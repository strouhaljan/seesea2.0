import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App";
import { initClock } from "./utils/clock";

// New version deployed: the new worker takes over at once and the page reloads.
// No user-facing prompt needed: this is a live tracker with no form state to lose.
registerSW();

// Sync the race clock before rendering so the first leg/slider decisions use it
initClock().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
