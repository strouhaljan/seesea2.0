import express from "express";
import cors from "cors";
import compression from "compression";
import { etagMiddleware } from "./middleware/etag.js";
import eventRouter from "./routes/event.js";
import liveRouter from "./routes/live.js";
import windRouter, { warmWindCache } from "./routes/wind.js";
import tailsRouter from "./routes/tails.js";
import legRouter from "./routes/leg.js";
import data2Router, { warmCache, purgeOldChunks } from "./routes/data2.js";
import eventsRouter from "./routes/events.js";
import { EVENT_SLUGS, getEventConfig } from "./events.js";
import clockRouter from "./routes/clock.js";
import * as clock from "./clock.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(
  cors({
    origin: ["http://localhost:5173", "https://seesea.cz"],
  }),
);

// JSON payloads (tails, history chunks, wind grids) shrink 3–12× gzipped
app.use(compression());
app.use(etagMiddleware);

app.use("/api/clock", clockRouter);
app.use("/api/event", eventRouter);
app.use("/api/events", eventsRouter);
app.use("/api/live", liveRouter);
app.use("/api/wind", windRouter);
app.use("/api/tails", tailsRouter);
app.use("/api/leg", legRouter);
app.use("/api/data2", data2Router);

app.listen(PORT, () => {
  console.log(`SeeSea server listening on port ${PORT}`);
  if (clock.replay) {
    const { slug, legIds, start, speed } = clock.replay;
    console.log(`REPLAY ${slug} (legs ${legIds.join(", ")}) from ${new Date(start).toISOString()} at ×${speed}`);
  }
  if (!clock.replay) purgeOldChunks();
  tryWarmCache();
  warmWindCache();
  // Re-check every 10 minutes — covers the case where no leg was active at
  // startup but one begins later, and keeps new hours warm as time passes.
  setInterval(tryWarmCache, 10 * 60 * 1000);
});

const WARM_MAX_HOURS = 24;

async function tryWarmCache() {
  if (EVENT_SLUGS.length === 0) {
    console.log("No EVENTS set, skipping cache warming");
    return;
  }

  for (const slug of EVENT_SLUGS) {
    try {
      const { eventId, legs } = await getEventConfig(slug);

      // Upstream's `active` flag is 0 on most events' race legs, so go by time only;
      // if legs overlap (e.g. a weeks-long preparation leg) take the latest start
      const now = clock.now();
      const activeLeg = legs
        .filter((l) => new Date(l.start).getTime() <= now && new Date(l.end).getTime() >= now)
        .sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0];

      if (!activeLeg) {
        console.log(`No running leg for ${slug}, skipping cache warming`);
        continue;
      }

      // At most the last day: a preparation leg can span weeks of mostly empty hours
      const from = Math.max(Math.floor(Date.parse(activeLeg.start) / 1000), Math.floor(now / 1000) - WARM_MAX_HOURS * 3600);
      console.log(`Warming cache for ${slug} (event ${eventId}, leg ${activeLeg.name}) from ${new Date(from * 1000).toISOString()}`);
      await warmCache(String(eventId), from);
    } catch (err) {
      console.error(`Cache warming failed for ${slug}:`, err);
    }
  }
}
