import express from "express";
import cors from "cors";
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

async function tryWarmCache() {
  if (EVENT_SLUGS.length === 0) {
    console.log("No EVENTS set, skipping cache warming");
    return;
  }

  for (const slug of EVENT_SLUGS) {
    try {
      const { eventId, legs } = await getEventConfig(slug);

      const now = clock.now();
      const activeLeg = legs
        .filter((l) => l.active === 1)
        .find((l) => new Date(l.start).getTime() <= now && new Date(l.end).getTime() >= now);

      if (!activeLeg) {
        console.log(`No running leg for ${slug}, skipping cache warming`);
        continue;
      }

      const legStart = Math.floor(new Date(activeLeg.start).getTime() / 1000);
      console.log(`Warming cache for ${slug} (event ${eventId}) from leg start ${activeLeg.start}`);
      await warmCache(String(eventId), legStart);
    } catch (err) {
      console.error(`Cache warming failed for ${slug}:`, err);
    }
  }
}
