import { useCallback, useState } from "react";
import { Sailboat, SlidersHorizontal } from "lucide-react";
import "./App.css";
import { useEventRoute, useEvents } from "./hooks/useEvents";
import EventPicker from "./components/EventPicker";
import EventScope from "./components/EventScope";

function App() {
  const { events, error: eventsError } = useEvents();
  const { selected, selectEvent } = useEventRoute(events);
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

  return (
    <div className="app-container">
      <header>
        <button
          className="header__panel-toggle"
          onClick={togglePanel}
          title={panelCollapsed ? "Show vessels" : "Hide vessels"}
        >
          <Sailboat size={18} />
        </button>
        <div className="header__title">
          <h1>SeeSea <sup style={{ fontSize: "0.4em" }}>2.0</sup></h1>
          {events && selected && (
            <>
              <span className="header__separator">·</span>
              <EventPicker events={events} selected={selected} onSelect={selectEvent} />
            </>
          )}
        </div>
        <button
          className="header__controls-toggle"
          onClick={toggleControls}
          title={controlsOpen ? "Hide controls" : "Show controls"}
        >
          <SlidersHorizontal size={18} />
        </button>
      </header>
      <main>
        {selected ? (
          <EventScope
            key={selected.slug}
            event={selected}
            panelCollapsed={panelCollapsed}
            onTogglePanel={togglePanel}
            controlsOpen={controlsOpen}
          />
        ) : (
          <div className={eventsError ? "error" : "loading"}>
            {eventsError
              ? `Failed to load events: ${eventsError}`
              : events
                ? "No events configured"
                : "Loading events..."}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
