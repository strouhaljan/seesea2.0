import { lazy, Suspense } from "react";
import "./App.css";
import {
  EventConfigContext,
  useEventConfigLoader,
} from "./hooks/useEventConfig";
import { useHighlightedCrews } from "./hooks/useHighlightedCrews";
import { useRoute } from "./router";
import { LivePage } from "./pages/LivePage";

const HistoryPage = lazy(() =>
  import("./pages/HistoryPage").then((m) => ({ default: m.HistoryPage })),
);

function App() {
  const eventConfig = useEventConfigLoader();
  const { highlightedCrews, toggleHighlight } = useHighlightedCrews();
  const route = useRoute();

  return (
    <EventConfigContext.Provider
      value={{ ...eventConfig, highlightedCrews, toggleHighlight }}
    >
      <div className="app-container">
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexDirection: "row",
          }}
        >
          <h1>VR map</h1>
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
