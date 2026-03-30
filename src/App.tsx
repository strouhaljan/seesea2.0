import { useCallback, useEffect, useRef, useState } from "react";
import { Sailboat, SlidersHorizontal } from "lucide-react";
import "./App.css";
import {
  EventConfigContext,
  useEventConfigLoader,
} from "./hooks/useEventConfig";
import { useHighlightedCrews } from "./hooks/useHighlightedCrews";
import { LivePage } from "./pages/LivePage";
import { HIGHLIGHTED_BOATS } from "./config";

function App() {
  const eventConfig = useEventConfigLoader();
  const { highlightedCrews, toggleHighlight } = useHighlightedCrews();
  const seededRef = useRef(false);
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => localStorage.getItem("boatPanelCollapsed") === "true"
  );
  const togglePanel = useCallback(() => {
    setPanelCollapsed((v) => {
      localStorage.setItem("boatPanelCollapsed", String(!v));
      return !v;
    });
  }, []);
  const [controlsOpen, setControlsOpen] = useState(
    () => localStorage.getItem("controlsOpen") !== "false"
  );
  const toggleControls = useCallback(() => {
    setControlsOpen((v) => {
      localStorage.setItem("controlsOpen", String(!v));
      return !v;
    });
  }, []);

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
        <header>
          <button
            className="header__panel-toggle"
            onClick={togglePanel}
            title={panelCollapsed ? "Show vessels" : "Hide vessels"}
          >
            <Sailboat size={18} />
          </button>
          <h1>SeeSea <sup style={{ fontSize: "0.4em" }}>2.0</sup></h1>
          <button
            className="header__controls-toggle"
            onClick={toggleControls}
            title={controlsOpen ? "Hide controls" : "Show controls"}
          >
            <SlidersHorizontal size={18} />
          </button>
        </header>
        <main>
          <LivePage panelCollapsed={panelCollapsed} onTogglePanel={togglePanel} controlsOpen={controlsOpen} onToggleControls={toggleControls} />
        </main>
      </div>
    </EventConfigContext.Provider>
  );
}

export default App;
