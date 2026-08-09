# Production Readiness Plan

This app should be treated as a company CRM because it stores lead, property, contact, and employee activity data.

## Done in this pass

- Backend API now verifies Supabase sessions with bearer tokens.
- Solar API routes require an active logged-in user.
- Email enrichment route requires an admin user.
- Server-side rate limits protect paid Google Solar/Places and enrichment calls.
- Frontend API calls include the current Supabase access token.

## Required before launch

- Rotate any API key pasted into chat or shared docs.
- Move server secrets to production hosting environment variables.
- Use server-only names for backend secrets: `GOOGLE_SOLAR_API_KEY`, `GOOGLE_PLACES_API_KEY`, `PDL_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Use `ENRICHMENT_PROVIDER=auto` so business leads can use domain discovery and parcel/person owners can use PDL.
- Add `HUNTER_API_KEY` if you want business/domain email discovery beyond public website scraping.
- Keep browser-only variables prefixed with `VITE_`.
- Add a production domain allowlist in CORS using `APP_ORIGIN`.
- Configure Supabase backups and point-in-time recovery.
- Add audit reporting for lead assignment, enrichment attempts, employee status changes, and outbound email events.
- Add privacy/compliance controls: opt-out, suppression list checks, source attribution, and retention policy.
- Add monitoring for API failures, quota usage, enrichment match rates, and email bounce rates.

## Data workflow

1. Solar/Places finds a candidate building.
2. Parcel import links the building to parcel owner data.
3. Enrichment attempts to find owner/business email.
4. If email is found, lead becomes email-ready.
5. If email is missing, admin assigns it to a ground employee.
6. Employee collects contact details and updates the ticket.
