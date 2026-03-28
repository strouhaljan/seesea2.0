import { Outlet, Link } from "@tanstack/react-router";
import "./App.css";
import {
  EventConfigContext,
  useEventConfigLoader,
} from "./hooks/useEventConfig";
import { useHighlightedCrews } from "./hooks/useHighlightedCrews";

function App() {
  const eventConfig = useEventConfigLoader();
  const { highlightedCrews, toggleHighlight } = useHighlightedCrews();

  return (
    <EventConfigContext.Provider value={{ ...eventConfig, highlightedCrews, toggleHighlight }}>
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
          <Link
            to="/"
            className="nav-link"
            activeProps={{ className: "nav-link active" }}
          >
            Live
          </Link>
          <Link
            to="/history"
            className="nav-link"
            activeProps={{ className: "nav-link active" }}
          >
            History
          </Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
    </EventConfigContext.Provider>
  );
}

export default App;
