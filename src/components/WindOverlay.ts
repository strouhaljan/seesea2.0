import type { Map as MapboxMap } from "mapbox-gl";
import { CompositeGrid, WindGridData, interpolateWind } from "../utils/windGrid";
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
  private composite: CompositeGrid;
  private particles: Particle[];
  private animFrameId: number | null = null;
  private visible = false;
  private _showBarbs = false;

  constructor(map: MapboxMap, composite: CompositeGrid) {
    this.map = map;
    this.composite = composite;

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

    this.map.on("resize", this.syncSize);
    this.map.on("move", this.onCameraChange);
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

  updateGrid(composite: CompositeGrid): void {
    this.composite = composite;
  }

  set showBarbs(value: boolean) {
    this._showBarbs = value;
  }

  destroy(): void {
    this.hide();
    this.map.off("resize", this.syncSize);
    this.map.off("move", this.onCameraChange);
  }

  private syncSize = (): void => {
    const mapCanvas = this.map.getCanvas?.();
    if (!mapCanvas) return;
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = mapCanvas.style.width;
      this.canvas.style.height = mapCanvas.style.height;
    }
  };

  private onCameraChange = (): void => {
    for (const p of this.particles) {
      this.resetParticle(p);
    }
  };

  /** Compute the overall bounding box across all regions. */
  private getCompositeBounds(): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const grid of this.composite) {
      if (grid.bounds.minLat < minLat) minLat = grid.bounds.minLat;
      if (grid.bounds.maxLat > maxLat) maxLat = grid.bounds.maxLat;
      if (grid.bounds.minLng < minLng) minLng = grid.bounds.minLng;
      if (grid.bounds.maxLng > maxLng) maxLng = grid.bounds.maxLng;
    }
    return { minLat, maxLat, minLng, maxLng };
  }

  private randomInViewport(): { lng: number; lat: number } {
    const bounds = this.getCompositeBounds();
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
      const wind = interpolateWind(this.composite, head.lat, head.lng);
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

    if (this._showBarbs) {
      this.drawBarbs(ctx, dpr);
    }

    this.animFrameId = requestAnimationFrame(this.animate);
  };

  private drawBarbs(ctx: CanvasRenderingContext2D, dpr: number): void {
    const zoom = this.map.getZoom();
    const mapBounds = this.map.getBounds();
    if (!mapBounds) return;

    const step = zoom >= 11 ? 1 : zoom >= 9 ? 2 : zoom >= 7 ? 3 : 5;
    const arrowLen = (zoom >= 11 ? 22 : zoom >= 9 ? 18 : 14) * dpr;
    const fontSize = Math.round((zoom >= 11 ? 11 : 10) * dpr);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `bold ${fontSize}px sans-serif`;

    for (const grid of this.composite) {
      this.drawBarbsForGrid(ctx, dpr, grid, mapBounds, step, arrowLen);
    }

    ctx.globalAlpha = 1;
  }

  private drawBarbsForGrid(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    grid: WindGridData,
    mapBounds: mapboxgl.LngLatBounds,
    step: number,
    arrowLen: number,
  ): void {
    for (let row = 0; row < grid.latSteps; row += step) {
      for (let col = 0; col < grid.lngSteps; col += step) {
        const lat = grid.bounds.minLat + row * grid.dlat;
        const lng = grid.bounds.minLng + col * grid.dlng;

        if (
          lat < mapBounds.getSouth() || lat > mapBounds.getNorth() ||
          lng < mapBounds.getWest() || lng > mapBounds.getEast()
        ) continue;

        const idx = row * grid.lngSteps + col;
        const uVal = grid.u[idx];
        const vVal = grid.v[idx];
        const speedKnots = grid.speed[idx];

        if (speedKnots < 0.5) continue;

        const px = this.map.project([lng, lat]);
        const sx = px.x * dpr;
        const sy = px.y * dpr;

        const angle = Math.atan2(-uVal, vVal);
        const color = getColorBySpeed(speedKnots);

        const tipX = sx + Math.sin(angle) * arrowLen;
        const tipY = sy - Math.cos(angle) * arrowLen;
        const tailX = sx - Math.sin(angle) * arrowLen * 0.3;
        const tailY = sy + Math.cos(angle) * arrowLen * 0.3;

        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        const headLen = 6 * dpr;
        const headAngle = 0.45;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          tipX - headLen * Math.sin(angle - headAngle),
          tipY + headLen * Math.cos(angle - headAngle),
        );
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          tipX - headLen * Math.sin(angle + headAngle),
          tipY + headLen * Math.cos(angle + headAngle),
        );
        ctx.stroke();

        const labelY = sy + arrowLen * 0.3 + 4 * dpr;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.fillText(`${Math.round(speedKnots)}`, sx, labelY);
      }
    }
  }
}
