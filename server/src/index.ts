import express from "express";
import cors from "cors";
import { etagMiddleware } from "./middleware/etag.js";
import eventRouter from "./routes/event.js";
import liveRouter from "./routes/live.js";
import windRouter from "./routes/wind.js";
import tailsRouter from "./routes/tails.js";
import legRouter from "./routes/leg.js";
import data2Router from "./routes/data2.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(
  cors({
    origin: ["http://localhost:5173", "https://seesea.cz"],
  }),
);

app.use(etagMiddleware);

app.use("/api/event", eventRouter);
app.use("/api/live", liveRouter);
app.use("/api/wind", windRouter);
app.use("/api/tails", tailsRouter);
app.use("/api/leg", legRouter);
app.use("/api/data2", data2Router);

app.listen(PORT, () => {
  console.log(`SeeSea server listening on port ${PORT}`);
});
