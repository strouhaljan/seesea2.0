# SeeSea 2.0

A React application that visualizes sailing trip data on a map using MapboxGL.

## Overview

SeeSea 2.0 fetches sailing vessel GPS track data from an API and displays the route on an interactive map. The application shows the vessel's journey, including start and end points.

## Features

- Interactive map displaying vessel route
- Start and end point markers
- Responsive design for various screen sizes
- Loading and error states

## Technologies Used

- React with TypeScript
- Vite for fast development and builds
- Mapbox GL JS for mapping
- Fetch API for data retrieval

## Getting Started

### Prerequisites

- Node.js 14+ installed
- A Mapbox access token (you'll need to replace the placeholder token)

### Installation

1. Clone the repository
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

4. Replace the placeholder Mapbox token in `src/components/Map.tsx` with your actual token:

```javascript
mapboxgl.accessToken = 'YOUR_MAPBOX_ACCESS_TOKEN';
```

5. Start the development server:

```bash
npm run dev
```

6. Open your browser and visit http://localhost:5173

## API Data Structure

The application consumes GPS track data with the following structure:

```json
{
  "sample": 0,
  "to": 1743325200,
  "objects": {
    "201502636": [
      {
        "coords": [15.555975, 43.8243],
        "time": 1743320727,
        "sog": 2.7,
        "cog": 302.0,
        "hdg": 330.0,
        // Additional sailing metrics...
      },
      // Additional track points...
    ]
  }
}
```

## License

MIT
## Events

The API server offers the events listed in `EVENTS` (comma-separated SeeSea slugs, e.g. `EVENTS=seawolf-cup-36,palagruza-cup-2026,vr-2026`). The app opens `/e/<slug>`; `/` goes to the first running event, or the first listed one. Users switch events from the header picker. Highlighted boats and the selected leg are remembered per event.

## Dev data & replay

The API server can replay a recorded event as if it were live, with no network access to SeeSea or Open-Meteo. Leg 2 of VR 2026 is committed in `server/fixtures/vr-2026/`.

Enable it in `.env` (the Conductor run script exports it to the server; when starting the server by hand, pass the variables yourself, e.g. `env REPLAY=vr-2026 npm --prefix server run dev`):

```
REPLAY=vr-2026
REPLAY_SPEED=10                         # optional, default 1
REPLAY_START=2026-04-02T12:00:00+02:00  # optional, default 30 min into the first recorded leg
```

The race clock starts at `REPLAY_START`, runs at `REPLAY_SPEED`× and stops at the end of the last recorded leg. Live positions, tails and wind are rebuilt from the recording for that time, and the UI shows a `REPLAY` badge. Restart the server to change settings.

In replay the event list is just the replayed event.

To record another event (stored in `server/fixtures/<slug>/`, gitignored except `vr-2026`):

```bash
npm --prefix server run record -- <slug> [--legs <legId,legId>]
```

Event slugs and leg ids are listed at `https://app.seesea.cz/api/cc_event/`. Re-running resumes and skips data already recorded.
