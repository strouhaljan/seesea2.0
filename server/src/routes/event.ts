import { Router } from "express";

const router = Router();

interface EventLeg {
  id: number;
  name: string;
  active: number;
  start: string;
  end: string;
  race_type: string;
}

interface EventConfig {
  eventId: number;
  crews: unknown[];
  legs: EventLeg[];
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
    const url = `https://app.seesea.cz/api/cc_event/${slug}/`;
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: "Upstream error" });
      return;
    }

    const data = await response.json();
    const config: EventConfig = {
      eventId: data.cc_event_id,
      crews: data.cc_object ?? [],
      legs: data.cc_event_leg ?? [],
      fetchedAt: Date.now(),
    };

    cache.set(slug, config);
    res.json({ eventId: config.eventId, crews: config.crews, legs: config.legs });
  } catch {
    res.status(502).json({ error: "Failed to fetch event config" });
  }
});

export default router;
