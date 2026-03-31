import express from "express";
import cors from "cors";
import { etagMiddleware } from "./middleware/etag.js";
import eventRouter from "./routes/event.js";
import liveRouter from "./routes/live.js";
import windRouter from "./routes/wind.js";
import tailsRouter from "./routes/tails.js";
import legRouter from "./routes/leg.js";
import data2Router, { warmCache, purgeOldChunks } from "./routes/data2.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(
  cors({
    origin: ["http://localhost:5173", "https://seesea.cz"],
  }),
);

app.use(etagMiddleware);

app.use("/api/event", eventRouter);
app.use("/api/live", liveRouter);
app.use("/api/wind", windRouter);
app.use("/api/tails", tailsRouter);
app.use("/api/leg", legRouter);
app.use("/api/data2", data2Router);

app.listen(PORT, () => {
  console.log(`SeeSea server listening on port ${PORT}`);
  purgeOldChunks();
  tryWarmCache();
  // Re-check every 10 minutes — covers the case where no leg was active at
  // startup but one begins later, and keeps new hours warm as time passes.
  setInterval(tryWarmCache, 10 * 60 * 1000);
});

async function tryWarmCache() {
  try {
    const slug = process.env.EVENT_SLUG;
    if (!slug) {
      console.log("No EVENT_SLUG set, skipping cache warming");
      return;
    }

    const res = await fetch(`https://app.seesea.cz/api/cc_event/${slug}/`);
    if (!res.ok) {
      console.error(`Failed to fetch event config for ${slug}: ${res.status}`);
      return;
    }

    const data = await res.json();
    const eventId = String(data.cc_event_id);
    const legs = (data.cc_event_leg ?? []) as { active: number; start: string; end: string }[];

    const now = Date.now();
    const activeLeg = legs
      .filter((l) => l.active === 1)
      .find((l) => new Date(l.start).getTime() <= now && new Date(l.end).getTime() >= now);

    if (!activeLeg) {
      console.log("No active leg found, skipping cache warming");
      return;
    }

    const legStart = Math.floor(new Date(activeLeg.start).getTime() / 1000);
    console.log(`Warming cache for event ${eventId} from leg start ${activeLeg.start}`);
    await warmCache(eventId, legStart);
  } catch (err) {
    console.error("Cache warming failed:", err);
  }
}
