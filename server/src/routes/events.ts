import { Router } from "express";
import * as clock from "../clock.js";
import { EVENT_SLUGS, getEventConfig, isRunning, type EventConfig } from "../events.js";

const router = Router();

router.get("/", async (_req, res) => {
  const configs = await Promise.all(
    EVENT_SLUGS.map(async (slug) => {
      try {
        return await getEventConfig(slug);
      } catch (err) {
        // One broken slug must not take the picker down
        console.warn(`Event ${slug} unavailable:`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );

  const now = clock.now();
  res.json(
    configs
      .filter((c): c is EventConfig => c !== null)
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        start: c.start,
        end: c.end,
        running: isRunning(c, now),
        center: c.center,
      })),
  );
});

export default router;
