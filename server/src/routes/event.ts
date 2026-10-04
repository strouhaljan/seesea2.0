import { Router } from "express";
import { getEventConfig, isListedEvent } from "../events.js";
import { sendUpstreamError } from "./upstreamError.js";

const router = Router();

router.get("/:slug", async (req, res) => {
  const { slug } = req.params;

  if (!isListedEvent(slug)) {
    res.status(404).json({ error: "Event not available" });
    return;
  }

  try {
    const config = await getEventConfig(slug);
    res.json({
      eventId: config.eventId,
      crews: config.crews,
      legs: config.legs,
    });
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch event config");
  }
});

export default router;
