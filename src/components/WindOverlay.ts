import type { Map as MapboxMap } from "mapbox-gl";
import { WindGridData, interpolateWind } from "../utils/windGrid";
import { getColorBySpeed } from "../utils/wind";

const PARTICLE_COUNT = 1000;
const PARTICLE_COUNT_MOBILE = 800;
const MAX_AGE = 120;
const BASE_TRAIL_LENGTH = 8;
const LINE_WIDTH = 1.2;

function getParticleCount(): number {
  return window.innerWidth < 768 ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT;
}

interface Particle {
  trail: Array<{ lng: number; lat: number }>;
  age: number;
  speed: number;
}

export class WindOverlay {
  private map: MapboxMap;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private grid: WindGridData;
  private particles: Particle[];
  private animFrameId: number | null = null;
  private visible = false;

  constructor(map: MapboxMap, grid: WindGridData) {
    this.map = map;
    this.grid = grid;

    const count = getParticleCount();
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle());
    }

    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.pointerEvents = "none";

    this.ctx = this.canvas.getContext("2d")!;
    this.syncSize();

    this.map.on("resize", this.syncSize);
    this.map.on("zoom", this.onZoom);
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    const mapCanvas = this.map.getCanvas();
    mapCanvas.parentElement?.insertBefore(
      this.canvas,
      mapCanvas.nextSibling,
    );
    this.syncSize();
    this.animate();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    if (this.animFrameId != null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.canvas.remove();
  }

  updateGrid(grid: WindGridData): void {
    this.grid = grid;
  }

  destroy(): void {
    this.hide();
    this.map.off("resize", this.syncSize);
    this.map.off("zoom", this.onZoom);
  }

  private syncSize = (): void => {
    const mapCanvas = this.map.getCanvas();
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = mapCanvas.style.width;
      this.canvas.style.height = mapCanvas.style.height;
    }
  };

  // On zoom, reset all particles immediately so they redistribute
  // within the new viewport and trails don't stretch/compress
  private onZoom = (): void => {
    for (const p of this.particles) {
      this.resetParticle(p);
    }
  };

  private randomInViewport(): { lng: number; lat: number } {
    const { bounds } = this.grid;
    let minLat = bounds.minLat;
    let maxLat = bounds.maxLat;
    let minLng = bounds.minLng;
    let maxLng = bounds.maxLng;

    const mb = this.map.getBounds();
    if (mb) {
      minLat = Math.max(minLat, mb.getSouth());
      maxLat = Math.min(maxLat, mb.getNorth());
      minLng = Math.max(minLng, mb.getWest());
      maxLng = Math.min(maxLng, mb.getEast());
    }

    if (minLat >= maxLat || minLng >= maxLng) {
      minLat = bounds.minLat;
      maxLat = bounds.maxLat;
      minLng = bounds.minLng;
      maxLng = bounds.maxLng;
    }

    return {
      lng: minLng + Math.random() * (maxLng - minLng),
      lat: minLat + Math.random() * (maxLat - minLat),
    };
  }

  private createParticle(): Particle {
    const pos = this.randomInViewport();
    return {
      trail: [pos],
      age: Math.floor(Math.random() * MAX_AGE),
      speed: 0,
    };
  }

  private resetParticle(p: Particle): void {
    const pos = this.randomInViewport();
    p.trail = [pos];
    p.age = MAX_AGE;
    p.speed = 0;
  }

  private getTrailLength(): number {
    const zoom = this.map.getZoom();
    const factor = Math.pow(2, (zoom - 9) / 2);
    return Math.round(BASE_TRAIL_LENGTH * Math.max(factor, 1));
  }

  private advancePosition(
    lng: number,
    lat: number,
    windU: number,
    windV: number,
  ): { lng: number; lat: number } {
    const px = this.map.project([lng, lat]);
    const scale = 0.15;
    const newPos = this.map.unproject([
      px.x + windU * scale,
      px.y - windV * scale,
    ]);
    return { lng: newPos.lng, lat: newPos.lat };
  }

  private animate = (): void => {
    if (!this.visible) return;

    this.syncSize();

    const ctx = this.ctx;
    const dpr = window.devicePixelRatio;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.lineWidth = LINE_WIDTH * dpr;
    ctx.lineCap = "round";

    const trailLength = this.getTrailLength();

    for (const particle of this.particles) {
      if (particle.age <= 0 || Math.random() < 0.003) {
        this.resetParticle(particle);
        continue;
      }

      const head = particle.trail[0];
      const wind = interpolateWind(this.grid, head.lat, head.lng);
      if (!wind) {
        this.resetParticle(particle);
        continue;
      }

      const newPos = this.advancePosition(
        head.lng,
        head.lat,
        wind.u,
        wind.v,
      );

      particle.trail.unshift(newPos);
      if (particle.trail.length > trailLength) {
        particle.trail.length = trailLength;
      }

      particle.age--;
      particle.speed = wind.speed;

      if (particle.trail.length < 2) continue;

      // Recycle off-screen particles back into viewport
      const headPx = this.map.project([newPos.lng, newPos.lat]);
      const headX = headPx.x * dpr;
      const headY = headPx.y * dpr;
      const margin = 50;
      if (
        headX < -margin ||
        headX > this.canvas.width + margin ||
        headY < -margin ||
        headY > this.canvas.height + margin
      ) {
        this.resetParticle(particle);
        continue;
      }

      const color = getColorBySpeed(particle.speed);

      for (let j = 0; j < particle.trail.length - 1; j++) {
        const from = particle.trail[j];
        const to = particle.trail[j + 1];

        const pxFrom = this.map.project([from.lng, from.lat]);
        const pxTo = this.map.project([to.lng, to.lat]);

        const sx1 = pxFrom.x * dpr;
        const sy1 = pxFrom.y * dpr;
        const sx2 = pxTo.x * dpr;
        const sy2 = pxTo.y * dpr;

        const dx = sx2 - sx1;
        const dy = sy2 - sy1;
        if (dx * dx + dy * dy > 400) continue;

        const alpha = 1 - j / particle.trail.length;
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    this.animFrameId = requestAnimationFrame(this.animate);
  };
}
