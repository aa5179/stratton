# Solar Analytics Dashboard

A React + Vite solar dashboard with Google Maps, Places Autocomplete, and an Express backend that proxies Google Solar Building Insights.

## Setup

1. Create a `.env` file in the project root.
2. Add these values:

```bash
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
GOOGLE_SOLAR_API_KEY=your_google_solar_api_key_here
PORT=3001
```

The Solar API key must have the Solar API enabled and billing active on the Google Cloud project. A Maps JavaScript API key that is restricted for browser referrers is usually not sufficient for the backend Solar request.

3. Install dependencies and start the app:

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` starts the Vite frontend and Express API together.
- `npm run build` builds the frontend for production.
- `npm run lint` runs ESLint across the workspace.
- `npm run server` starts only the Express API.

## API

`GET /api/solar?lat=&lng=` returns a curated Solar Building Insights response with address, roof area, max panels, annual energy, solar potential, and carbon offset.
