# Contact Discovery Setup

The **Find Contact** button uses an automatic routing strategy:

1. Business/commercial leads:
   - Google Places Text Search finds website and phone when available.
   - The app checks public website pages such as `/contact` and `/about` for published email addresses.
   - Hunter Domain Search is used when `HUNTER_API_KEY` is configured.

2. Parcel/person owner leads:
   - People Data Labs person enrichment is used when `PDL_API_KEY` is configured.

3. If no email is found:
   - The lead stays in the no-email queue for field employee collection.

## Environment Variables

```env
ENRICHMENT_PROVIDER=auto
PDL_API_KEY=your_pdl_key
HUNTER_API_KEY=your_hunter_key
GOOGLE_PLACES_API_KEY=your_google_places_key
```

If `GOOGLE_PLACES_API_KEY` is not set, the server falls back to `GOOGLE_MAPS_API_KEY` or `VITE_GOOGLE_MAPS_API_KEY`.

The app does not invent emails. It only saves emails returned by an enrichment API or found on public business websites.
