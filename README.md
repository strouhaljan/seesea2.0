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