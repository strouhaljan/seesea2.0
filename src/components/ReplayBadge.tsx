import { useEffect, useState } from "react";
import { getReplay, now } from "../utils/clock";

/** Shows the replayed event, speed and race time while the server runs in replay mode. */
export default function ReplayBadge() {
  const replay = getReplay();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!replay) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [replay]);

  if (!replay) return null;

  const time = new Date(now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="replay-badge">
      REPLAY · {replay.slug} · ×{replay.speed} · {time}
    </div>
  );
}
