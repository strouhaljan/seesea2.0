import { Router } from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const router = Router();

const crewDataPath = resolve(__dirname, "../data/crews-201606.json");
const crewData = JSON.parse(readFileSync(crewDataPath, "utf-8"));

router.get("/:eventId", (_req, res) => {
  res.json(crewData);
});

export default router;
