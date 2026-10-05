import { Router } from "express";
import { upstream } from "../upstream/index.js";
import { sendUpstreamError } from "./upstreamError.js";

const ALLOWED_FIELDS = ["time", "coords", "hdg", "cog", "sog", "twa", "tws"] as const;

const router = Router();

router.get("/:eventId", async (req, res) => {
  const { eventId } = req.params;

  try {
    const data = await upstream.getLive(eventId);
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
  } catch (err) {
    sendUpstreamError(res, err, "Failed to fetch upstream data");
  }
});

export default router;
