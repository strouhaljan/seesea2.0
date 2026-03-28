import { Router } from "express";

const ALLOWED_FIELDS = ["coords", "hdg", "cog", "sog", "twa", "tws"] as const;

const router = Router();

router.get("/:eventId", async (req, res) => {
  const { eventId } = req.params;
  const url = `https://app.seesea.cz/cc_event/${eventId}/data/live`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: "Upstream error" });
      return;
    }

    const data = await response.json();
    const stripped: Record<string, Record<string, unknown>> = {};

    for (const [id, vessel] of Object.entries(data.objects ?? {})) {
      const v = vessel as Record<string, unknown>;
      const slim: Record<string, unknown> = {};
      for (const field of ALLOWED_FIELDS) {
        if (field in v) slim[field] = v[field];
      }
      stripped[id] = slim;
    }

    res.json({ objects: stripped });
  } catch {
    res.status(502).json({ error: "Failed to fetch upstream data" });
  }
});

export default router;
