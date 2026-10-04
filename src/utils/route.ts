const EVENT_PATH = /^\/e\/([^/]+)\/?$/;

/** Event slug from a `/e/<slug>` path, or null for any other path. */
export function getEventSlugFromPath(pathname = window.location.pathname): string | null {
  const match = pathname.match(EVENT_PATH);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null; // malformed escape, e.g. a truncated link
  }
}

export function eventPath(slug: string): string {
  return `/e/${encodeURIComponent(slug)}`;
}
