import { Router } from "express";

const router = Router();

router.get("/:eventId/:legId", async (req, res) => {
  const { eventId, legId } = req.params;
  const url = `https://app.seesea.cz/api/cc_event/${eventId}/data/live/${legId}/tails`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: "Upstream error" });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: "Failed to fetch upstream tails data" });
  }
});

export default router;
