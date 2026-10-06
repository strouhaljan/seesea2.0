import { useCallback, useState } from "react";
import { Sailboat, SlidersHorizontal } from "lucide-react";
import "./App.css";
import { useEventRoute, useEvents } from "./hooks/useEvents";
import EventPicker from "./components/EventPicker";
import EventScope from "./components/EventScope";
import { isPhoneNow, useIsPhone } from "./hooks/useIsPhone";
import type { SheetSnap } from "./utils/sheet";

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
  const isPhone = useIsPhone();
  // Phones start with the map clear; desktop keeps the controls open by default
  const [controlsOpen, setControlsOpenState] = useState(() => {
    const saved = localStorage.getItem("controlsOpen");
    return saved === null ? !isPhoneNow() : saved !== "false";
  });
  const setControlsOpen = useCallback((open: boolean) => {
    localStorage.setItem("controlsOpen", String(open));
    setControlsOpenState(open);
  }, []);
  const closeControls = useCallback(() => setControlsOpen(false), [setControlsOpen]);

  const [sheetSnap, setSheetSnapState] = useState<SheetSnap>(
    () => (localStorage.getItem("boatSheetSnap") as SheetSnap) || "bar",
  );
  const setSheetSnap = useCallback((snap: SheetSnap) => {
    localStorage.setItem("boatSheetSnap", snap);
    setSheetSnapState(snap);
  }, []);

  const toggleControls = useCallback(() => {
    const open = !controlsOpen;
    setControlsOpen(open);
    // Phones show settings in the boat sheet: raise it if it's only a bar
    if (open && isPhone && sheetSnap === "bar") setSheetSnap("half");
  }, [controlsOpen, isPhone, sheetSnap, setControlsOpen, setSheetSnap]);

  // ⛵ on phones raises/lowers the boat sheet; on desktop it toggles the side panel
  const toggleBoats = useCallback(() => {
    if (!isPhone) return togglePanel();
    const raise = sheetSnap === "bar";
    setSheetSnap(raise ? "half" : "bar");
    if (raise) setControlsOpen(false);
  }, [isPhone, sheetSnap, setSheetSnap, setControlsOpen, togglePanel]);

  return (
    <div className="app-container">
      <header>
        <button
          className="header__panel-toggle"
          onClick={toggleBoats}
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
            isPhone={isPhone}
            sheetSnap={sheetSnap}
            onSheetSnapChange={setSheetSnap}
            onCloseControls={closeControls}
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
