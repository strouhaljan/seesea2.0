import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import MapView from './views/MapView'
import App from './App'
import MapView2 from './views/MapView2'

// Create a root route
export const rootRoute = createRootRoute({
  component: App,
})

// Map view (first route)
export const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: MapView,
})

// Second map view (with different data)
export const map2Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/map2',
  component: MapView2,
})

// Create the router with the routes
export const router = createRouter({
  routeTree: rootRoute.addChildren([
    mapRoute,
    map2Route,
  ]),
})

// Declare the router types
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}