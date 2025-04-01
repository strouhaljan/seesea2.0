import { Outlet, Link } from "@tanstack/react-router";
import "./App.css";

function App() {
  return (
    <div className="app-container">
      <header>
        <h1>SeeSea 2.0</h1>
        <nav className="main-nav">
          <Link to="/" className="nav-link" activeProps={{ className: "nav-link active" }}>
            Map View
          </Link>
          <Link to="/map2" className="nav-link" activeProps={{ className: "nav-link active" }}>
            Alternative Map
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