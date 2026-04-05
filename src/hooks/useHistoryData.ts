import { useCallback, useEffect, useRef, useState } from "react";
import { VesselDataPoint } from "../types/tripData";
import { TailPoint, TailsData } from "./useTails";

interface ChunkData {
  objects: Record<string, VesselDataPoint[]>;
}

/** Sorted points per vessel covering the trail window — used for interpolation */
export type HistoryTimelines = Record<string, VesselDataPoint[]>;

interface UseHistoryDataResult {
  historyData: Record<string, VesselDataPoint>;
  historyTails: TailsData;
  historyTimelines: HistoryTimelines;
  loading: boolean;
}

function floorHour(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600) * 3600;
}

/**
 * Client-side chunk cache. Fetches hour-chunks from the server once and
 * reuses them for subsequent queries, so scrubbing/replaying never re-fetches
 * data that's already in memory.
 */
class ChunkCache {
  private chunks = new Map<string, ChunkData>();
  private inflight = new Map<string, Promise<ChunkData | null>>();

  private key(eventId: number, hourStart: number) {
    return `${eventId}:${hourStart}`;
  }

  /** Synchronous cache lookup — returns the chunk or undefined if not cached */
  tryGetChunk(eventId: number, hourStart: number): ChunkData | undefined {
    return this.chunks.get(this.key(eventId, hourStart));
  }

  async getChunk(
    eventId: number,
    hourStart: number,
    signal?: AbortSignal,
  ): Promise<ChunkData | null> {
    const k = this.key(eventId, hourStart);

    const cached = this.chunks.get(k);
    if (cached) return cached;

    // Deduplicate concurrent requests for the same chunk
    const existing = this.inflight.get(k);
    if (existing) return existing;

    const promise = this.fetchChunk(eventId, hourStart, signal, k);
    this.inflight.set(k, promise);
    promise.finally(() => this.inflight.delete(k));
    return promise;
  }

  /** Fire-and-forget prefetch — does not block on result */
  prefetch(eventId: number, hourStart: number) {
    const k = this.key(eventId, hourStart);
    if (this.chunks.has(k) || this.inflight.has(k)) return;
    const promise = this.fetchChunk(eventId, hourStart, undefined, k);
    this.inflight.set(k, promise);
    promise.finally(() => this.inflight.delete(k));
  }

  private async fetchChunk(
    eventId: number,
    hourStart: number,
    signal: AbortSignal | undefined,
    cacheKey: string,
  ): Promise<ChunkData | null> {
    try {
      const res = await fetch(
        `/api/data2/${eventId}/chunk?hour=${hourStart}`,
        signal ? { signal } : undefined,
      );
      if (!res.ok) return null;
      const data: ChunkData = await res.json();

      // Sort points within each vessel by time for binary search later
      for (const points of Object.values(data.objects)) {
        points.sort((a, b) => a.time - b.time);
      }

      this.chunks.set(cacheKey, data);
      return data;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      console.error("Failed to fetch chunk:", err);
      return null;
    }
  }
}

// Singleton — survives re-renders and hook re-mounts
const chunkCache = new ChunkCache();

/**
 * Fetches vessel positions for a specific point in time.
 * Data is cached in hour-chunks client-side so that scrubbing/replaying
 * only hits the network for chunks not yet downloaded.
 */
export function useHistoryData(
  eventId: number | null,
  selectedTime: number | null,
  trailMinutes: number,
): UseHistoryDataResult {
  const [historyData, setHistoryData] = useState<Record<string, VesselDataPoint>>({});
  const [historyTails, setHistoryTails] = useState<TailsData>({});
  const [historyTimelines, setHistoryTimelines] = useState<HistoryTimelines>({});
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController>(undefined);
  const latestRequestRef = useRef(0);

  const sliceData = useCallback(
    (time: number, trail: number, chunks: (ChunkData | null)[]) => {
      const windowStart = time - trail * 60;

      const positions: Record<string, VesselDataPoint> = {};
      const tails: TailsData = {};
      const timelines: HistoryTimelines = {};

      for (const chunk of chunks) {
        if (!chunk) continue;
        for (const [vesselId, points] of Object.entries(chunk.objects)) {
          // Find best position: latest point <= target time
          // Points are sorted by time, so we can binary search
          let bestIdx = -1;
          let lo = 0;
          let hi = points.length - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (points[mid].time <= time) {
              bestIdx = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }

          if (bestIdx >= 0) {
            const existing = positions[vesselId];
            if (!existing || points[bestIdx].time > existing.time) {
              positions[vesselId] = points[bestIdx];
            }
          }

          // Build tail points and timeline within the window
          // Timeline includes one point after `time` for forward interpolation
          const tailPoints: TailPoint[] = [];
          const timelinePoints: VesselDataPoint[] = [];
          let addedNext = false;
          for (const p of points) {
            if (p.time < windowStart) continue;
            if (p.time <= time) {
              tailPoints.push([p.time, p.coords[0], p.coords[1], p.tws]);
              timelinePoints.push(p);
            } else if (!addedNext) {
              // Include the first point after target time for interpolation
              timelinePoints.push(p);
              addedNext = true;
            } else {
              break;
            }
          }
          if (tailPoints.length > 0) {
            if (!tails[vesselId]) {
              tails[vesselId] = tailPoints;
            } else {
              tails[vesselId].push(...tailPoints);
            }
          }
          if (timelinePoints.length > 0) {
            if (!timelines[vesselId]) {
              timelines[vesselId] = timelinePoints;
            } else {
              timelines[vesselId].push(...timelinePoints);
            }
          }
        }
      }

      // Sort merged tails/timelines by time (chunks may overlap at boundaries)
      for (const points of Object.values(tails)) {
        points.sort((a, b) => a[0] - b[0]);
      }
      for (const points of Object.values(timelines)) {
        points.sort((a, b) => a.time - b.time);
      }

      return { positions, tails, timelines };
    },
    [],
  );

  useEffect(() => {
    if (selectedTime === null || !eventId) {
      setHistoryData({});
      setHistoryTails({});
      setHistoryTimelines({});
      return;
    }

    const requestId = ++latestRequestRef.current;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const trailSeconds = trailMinutes * 60;
    const windowStart = selectedTime - trailSeconds;
    const windowEnd = selectedTime + 30; // small lookahead

    const firstHour = floorHour(windowStart);
    const lastHour = floorHour(windowEnd);
    const hours: number[] = [];
    for (let h = firstHour; h <= lastHour; h += 3600) {
      hours.push(h);
    }

    // Fast path: if all chunks are already cached, slice synchronously
    const syncChunks: (ChunkData | null)[] = [];
    let allCached = true;
    for (const h of hours) {
      const c = chunkCache.tryGetChunk(eventId, h);
      if (c) {
        syncChunks.push(c);
      } else {
        allCached = false;
        break;
      }
    }

    if (allCached) {
      const { positions, tails, timelines } = sliceData(selectedTime, trailMinutes, syncChunks);
      setHistoryData(positions);
      setHistoryTails(tails);
      setHistoryTimelines(timelines);
      setLoading(false);
      chunkCache.prefetch(eventId, lastHour + 3600);
      return;
    }

    // Slow path: fetch missing chunks, then slice
    setLoading(true);

    Promise.all(
      hours.map((h) => chunkCache.getChunk(eventId, h, controller.signal)),
    ).then((chunks) => {
      if (requestId !== latestRequestRef.current) return;

      const { positions, tails, timelines } = sliceData(selectedTime, trailMinutes, chunks);
      setHistoryData(positions);
      setHistoryTails(tails);
      setHistoryTimelines(timelines);
      setLoading(false);

      chunkCache.prefetch(eventId, lastHour + 3600);
    }).catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to load history chunks:", err);
      setLoading(false);
    });
  }, [eventId, selectedTime, trailMinutes, sliceData]);

  return { historyData, historyTails, historyTimelines, loading };
}
