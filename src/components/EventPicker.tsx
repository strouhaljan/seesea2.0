import type { EventSummary } from "../hooks/useEvents";

interface EventPickerProps {
  events: EventSummary[];
  selected: EventSummary;
  onSelect: (slug: string) => void;
}

const label = (e: EventSummary) => (e.running ? `● ${e.name}` : e.name);

export default function EventPicker({ events, selected, onSelect }: EventPickerProps) {
  if (events.length === 1) {
    return <span className="event-picker">{label(selected)}</span>;
  }

  return (
    <select
      className="event-picker"
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
  );
}
