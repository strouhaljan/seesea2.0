import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { EventSummary } from "../hooks/useEvents";
import { now } from "../utils/clock";

interface EventPickerProps {
  events: EventSummary[];
  selected: EventSummary;
  onSelect: (slug: string) => void;
}

const isRunning = (e: EventSummary, at: number) => Date.parse(e.start) <= at && at <= Date.parse(e.end);

export default function EventPicker({ events, selected, onSelect }: EventPickerProps) {
  // Race time, refreshed every minute so the running dot follows the clock (also in replay)
  const [at, setAt] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setAt(now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const label = (e: EventSummary) => (isRunning(e, at) ? `● ${e.name}` : e.name);

  if (events.length === 1) {
    return (
      <span className="event-picker">
        <span className="event-picker__label">{label(selected)}</span>
      </span>
    );
  }

  return (
    <span className="event-picker">
      <span className="event-picker__label">{label(selected)}</span>
      <ChevronDown size={14} aria-hidden />
      {/* Invisible native select on top: the label sets the width, taps open the native picker */}
      <select
        className="event-picker__select"
        aria-label="Event"
        value={selected.slug}
        onChange={(e) => onSelect(e.target.value)}
      >
        {events.map((e) => (
          <option key={e.slug} value={e.slug}>
            {label(e)}
          </option>
        ))}
      </select>
    </span>
  );
}
