import { Router } from "express";
import { upstream } from "../upstream/index.js";
import { sendUpstreamError } from "./upstreamError.js";

const router = Router();

router.get("/:eventId/:legId", async (req, res) => {
  const { eventId, legId } = req.params;

  try {
    res.json(await upstream.getLeg(eventId, legId));
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch upstream leg data");
  }
});

export default router;
