import { EventConfigContext, useEventConfigLoader } from "../hooks/useEventConfig";
import { useHighlightedCrews } from "../hooks/useHighlightedCrews";
import type { EventSummary } from "../hooks/useEvents";
import { LivePage } from "../pages/LivePage";
import type { SheetSnap } from "../utils/sheet";

interface EventScopeProps {
  event: EventSummary;
  panelCollapsed: boolean;
  onTogglePanel: () => void;
  controlsOpen: boolean;
  isPhone: boolean;
  sheetSnap: SheetSnap;
  onSheetSnapChange: (snap: SheetSnap) => void;
  onCloseControls: () => void;
}

/**
 * Everything specific to one event. Rendered with `key={slug}` so switching
 * events remounts it — no state (map, caches in hooks, highlights) leaks across.
 */
export default function EventScope({ event, ...pageProps }: EventScopeProps) {
  const config = useEventConfigLoader(event.slug);
  const { highlightedCrews, toggleHighlight } = useHighlightedCrews(event.slug, config.crews);

  return (
    <EventConfigContext.Provider
      value={{ ...config, slug: event.slug, center: event.center, highlightedCrews, toggleHighlight }}
    >
      <LivePage {...pageProps} />
    </EventConfigContext.Provider>
  );
}
