import { Router } from "express";
import * as clock from "../clock.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    now: clock.now(),
    speed: clock.replay?.speed ?? 1,
    end: clock.replay?.end ?? null,
    replay: clock.replay?.slug ?? null,
  });
});

export default router;
