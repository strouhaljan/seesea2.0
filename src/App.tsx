import { lazy, Suspense, useEffect, useRef } from "react";
import "./App.css";
import {
  EventConfigContext,
  useEventConfigLoader,
} from "./hooks/useEventConfig";
import { useHighlightedCrews } from "./hooks/useHighlightedCrews";
import { useRoute } from "./router";
import { LivePage } from "./pages/LivePage";
import { HIGHLIGHTED_BOATS } from "./config";

const HistoryPage = lazy(() =>
  import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })),
);

function App() {
  const eventConfig = useEventConfigLoader();
  const { highlightedCrews, toggleHighlight } = useHighlightedCrews();
  const route = useRoute();
  const seededRef = useRef(false);

  // Seed default highlighted boats on first load (if nothing saved yet)
  useEffect(() => {
    if (seededRef.current || eventConfig.crews.length === 0) return;
    if (highlightedCrews.size > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    eventConfig.crews.forEach((crew) => {
      if (HIGHLIGHTED_BOATS.includes(crew.name)) {
        toggleHighlight(crew.id);
      }
    });
  }, [eventConfig.crews]);

  return (
    <EventConfigContext.Provider
      value={{ ...eventConfig, highlightedCrews, toggleHighlight }}
    >
      <div className="app-container">
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexDirection: "row",
          }}
        >
          <h1>SeeSea <sup style={{ fontSize: "0.4em" }}>2.0</sup></h1>
          <nav className="main-nav">
            <a
              href="#/"
              className={
                "nav-link" + (route === "live" ? " active" : "")
              }
            >
              Live
            </a>
            <a
              href="#/history"
              className={
                "nav-link" + (route === "history" ? " active" : "")
              }
            >
              History
            </a>
          </nav>
        </header>
        <main>
          {route === "history" ? (
            <Suspense
              fallback={<div className="loading">Loading...</div>}
            >
              <HistoryPage />
            </Suspense>
          ) : (
            <LivePage />
          )}
        </main>
      </div>
    </EventConfigContext.Provider>
  );
}

export default App;
