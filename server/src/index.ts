import express from "express";
import cors from "cors";
import { etagMiddleware } from "./middleware/etag.js";
import eventRouter from "./routes/event.js";
import liveRouter from "./routes/live.js";
import historyRouter from "./routes/history.js";

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
app.use("/api/history", historyRouter);

app.listen(PORT, () => {
  console.log(`SeeSea server listening on port ${PORT}`);
});
