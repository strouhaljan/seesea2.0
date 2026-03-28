import { useState, useEffect } from "react";

function getRoute(): string {
  const hash = window.location.hash;
  if (hash.startsWith("#/history")) return "history";
  return "live";
}

export function useRoute() {
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    const handler = () => setRoute(getRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return route;
}
