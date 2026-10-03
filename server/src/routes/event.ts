import { Router } from "express";
import { upstream, type RawEventLeg } from "../upstream/index.js";
import { sendUpstreamError } from "./upstreamError.js";

const router = Router();

interface EventConfig {
  eventId: number;
  crews: unknown[];
  legs: RawEventLeg[];
  fetchedAt: number;
}

const cache = new Map<string, EventConfig>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

router.get("/:slug", async (req, res) => {
  const { slug } = req.params;

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    res.json({ eventId: cached.eventId, crews: cached.crews, legs: cached.legs });
    return;
  }

  try {
    const data = await upstream.getEvent(slug);
    const config: EventConfig = {
      eventId: data.cc_event_id,
      crews: data.cc_object ?? [],
      legs: data.cc_event_leg ?? [],
      fetchedAt: Date.now(),
    };

    cache.set(slug, config);
    res.json({ eventId: config.eventId, crews: config.crews, legs: config.legs });
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch event config");
  }
});

export default router;
