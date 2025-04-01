import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import App from "./App";
import { HistoryPage } from "./pages/HistoryPage";
import { LivePage } from "./pages/LivePage";

export const rootRoute = createRootRoute({
  component: App,
});

export const livePageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LivePage,
});

export const historyPageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: HistoryPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([livePageRoute, historyPageRoute]),
});

// Declare the router types
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
