# App Context

## What This App Is

This project is a U.S.-focused Solar Lead Intelligence Dashboard built with React, Vite, Tailwind, Google Maps, and an Express backend.

The current UI is a single-page workspace with:
- A top search and filter bar
- KPI cards
- A Google map with lead markers
- A selected-lead insights panel
- A sortable top-leads table
- Revenue, energy, ROI, and priority charts
- CRM placeholder sections

## Tech Stack

- Frontend: React 19 + Vite
- Styling: Tailwind CSS 4
- Maps: `@react-google-maps/api`
- Backend: Express 5
- Utilities: `concurrently`, `dotenv`, `cors`

## Key Scripts

```bash
npm run dev
npm run build
npm run lint
npm run server
```

## Environment Variables

The app expects these variables in `.env`:

```bash
VITE_GOOGLE_MAPS_API_KEY=
GOOGLE_SOLAR_API_KEY=
PORT=3001
```

Do not commit real API keys.

## Current Data Flow

### Live data

- The selected U.S. location is resolved through Google Places / Google Maps.
- Solar building insights are fetched on demand from the backend through `GET /api/solar?lat=&lng=`.
- The backend proxies Google Solar API requests and formats the response.

### Synthetic data

The dashboard lead intelligence is not real CRM or parcel data yet.

It is generated locally in `src/utils/leadDashboard.js` by `buildLeadPortfolio()` using the selected location plus the Solar API response as a seed.

That generated data includes:
- lead addresses beyond the primary selected address
- owner names
- business names
- phone numbers
- email addresses
- parcel IDs
- property values
- lead status
- lead score
- priority
- estimated install cost
- ROI
- annual revenue for generated leads
- chart series and KPI rollups

So the dashboard is partially live and partially synthetic:
- Solar geometry and base energy data are live
- Lead records, revenue estimates, and CRM fields are mocked/generated locally

## Main Files

- `src/App.jsx`: application orchestration and dashboard state
- `src/components/TopBar.jsx`: search, filters, refresh action
- `src/components/MapView.jsx`: Google Map and lead markers
- `src/components/LeadDashboardSections.jsx`: KPI cards, charts, insights, table, CRM sections
- `src/utils/leadDashboard.js`: synthetic lead generation and scoring logic
- `src/services/solarApi.js`: frontend fetch wrapper for solar insights
- `src/services/locationService.js`: reverse geocoding helper
- `server/index.js`: Express server entry point
- `server/routes/solar.js`: solar API route
- `server/services/solarClient.js`: Google Solar API client
- `server/services/solarFormatter.js`: response shaping

## Important Notes

- The Google Solar API requires billing to be enabled on the Google Cloud project.
- If you want the dashboard to be fully real-time and non-mocked, the synthetic lead generator must be replaced with a real source such as a CRM, parcel API, utility data API, or database-backed lead table.
- The current app does not yet include WebSockets, SSE, or webhook-driven updates.

## Running Locally

```bash
npm install
npm run dev
```

Frontend runs through Vite and the backend runs on the configured `PORT` value.