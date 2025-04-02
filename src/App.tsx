import { Outlet, Link } from "@tanstack/react-router";
import "./App.css";

function App() {
  return (
    <div className="app-container">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexDirection: "row",
        }}
      >
        <h1>SeeSea 2.0</h1>
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
  );
}

export default App;
