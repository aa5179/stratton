# STRATTON

STRATTON is a solar lead intelligence and CRM dashboard for finding high-potential rooftops, saving real lead data, enriching contacts, assigning field work, and sending property-specific solar outreach.

The app uses React + Vite for the frontend, Express for protected API routes, Google Maps/Solar/Places for property discovery, Supabase for auth/database/RLS, and Resend for outbound email delivery.

## Features

- Full-screen satellite map with building selection, adjustable radius, and solar panel placement from Google Solar data.
- Nearby and state lead discovery using real Google candidate buildings.
- Persistent browser caching and server scan caching to avoid repeated Google API calls for already searched areas.
- Lead scoring from solar capacity, savings, ROI, property fit, and contactability.
- Supabase login with `admin` and `ground_employee` roles.
- Admin CRM tabs for High Score Leads, No-Email Queue, and Low Score Leads.
- Automatic contact discovery when leads are saved.
- Bulk contact discovery for all lead tabs.
- Field assignment workflow for leads with no email or phone.
- Contact-ready status for phone-only leads.
- Duplicate lead protection by Google Solar building name and normalized address/location.
- Professional property-specific email generation and delivery through Gmail SMTP or Resend.
- Optional automatic Hot lead outreach when saved leads have an email address.
- Suppression list to prevent sending to blocked/unsubscribed/bounced emails.

## Tech Stack

- Frontend: React, Vite, Tailwind CSS utilities, `@react-google-maps/api`
- Backend: Express
- Database/Auth: Supabase
- Maps/Solar/Places: Google Maps Platform
- Contact enrichment: Google Places, public website scraping, Hunter, People Data Labs, or custom webhook
- Email delivery: Gmail SMTP for demos, Resend for production domains

## Environment Variables

Create `.env` in the project root:

```bash
PORT=3001

VITE_GOOGLE_MAPS_API_KEY=your_browser_maps_key
VITE_GOOGLE_SOLAR_API_KEY=your_google_solar_key

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

ENRICHMENT_PROVIDER=auto
PDL_API_KEY=your_people_data_labs_key
HUNTER_API_KEY=your_hunter_key

RESEND_API_KEY=your_resend_key
RESEND_FROM_EMAIL=onboarding@resend.dev

EMAIL_PROVIDER=gmail
GMAIL_USER=your_gmail_address@gmail.com
GMAIL_APP_PASSWORD=your_16_character_google_app_password
```

Notes:

- `VITE_GOOGLE_MAPS_API_KEY` is used in the browser for Maps and Places autocomplete.
- `VITE_GOOGLE_SOLAR_API_KEY` is used by the backend Solar API route.
- `EMAIL_PROVIDER=gmail` sends through Gmail SMTP for demos and early testing.
- `GMAIL_APP_PASSWORD` must be a Google App Password, not your normal Gmail password.
- `EMAIL_PROVIDER=resend` sends through Resend after you verify a production domain.
- `RESEND_FROM_EMAIL` is optional. During Resend test mode, `onboarding@resend.dev` works only for your verified test recipient. For production, verify a domain in Resend and use something like `sales@yourdomain.com`.
- Never commit real API keys.

## Database Setup

Run `database/schema.sql` first in Supabase SQL Editor for a new database.

Then run migrations in order:

```text
database/002_status_and_campaign_migration.sql
database/004_contact_ready_status.sql
database/005_prevent_duplicate_leads.sql
database/006_outbound_email_message_fields.sql
database/007_employee_outcome_statuses.sql
```

`database/003_reset_crm_data_keep_users.sql` is optional and destructive for CRM data. It deletes CRM records but keeps auth users/profiles.

Before running `005_prevent_duplicate_leads.sql`, use the duplicate-check query inside that file. If duplicates already exist, clean them before adding the unique index.

## Supabase Roles

The app expects a `profiles` row for each auth user.

Supported roles:

- `admin`: can scan/save leads, run contact enrichment, assign tickets, manage CRM, and send emails.
- `ground_employee`: can view assigned tickets and update visit/contact status.

See `database/SUPABASE_AUTH_SETUP.md` for profile setup notes.

## Running Locally

Install dependencies:

```bash
npm install
```

Start frontend and backend together:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/
```

Useful scripts:

```bash
npm run dev      # Vite + Express
npm run server   # Express only
npm run build    # production frontend build
npm run lint     # ESLint
```

## Lead Workflow

1. Sign in as an admin.
2. Search or click a building on the satellite map.
3. Open nearby or state leads.
4. Save scanned leads.
5. The app saves leads and solar assessments to Supabase.
6. The app automatically tries to find contact details.
7. Leads with email become email-ready.
8. If the admin enables `Auto-send Hot emails`, Hot leads with an email are sent the property-specific outreach email during save.
9. Leads with only phone become contact-ready.
10. Leads with no email or phone stay in the field assignment queue.

Duplicate protection:

- If Google Solar returns the same building name, the app updates the existing lead.
- If no building name exists, the app matches normalized address + rounded coordinates.
- Supabase also has a unique index for normalized address/location.

Scan caching:

- Selected building lookups are cached in the browser for 24 hours.
- Nearby area and state lead scans are cached in the browser for 7 days.
- The Express server also caches nearby and state scan results for 24 hours while the server is running.
- Nearby scans use a rounded area grid, so small clicks inside the same searched area reuse cached results instead of spending new Google Solar calls.
- The right lead panel shows `Loaded From: Cache` when a scan result came from cache.

## Contact Discovery

Contact discovery runs automatically when leads are saved and can also be triggered manually with `Find Contacts For All`.

Provider behavior with `ENRICHMENT_PROVIDER=auto`:

- Business/commercial leads: Google Places, business website, public email scraping, and Hunter if configured.
- Parcel/person owner leads: People Data Labs when owner data is available.
- Custom provider: `ENRICHMENT_API_URL` can be used if you add a compatible webhook.

See `docs/CONTACT_DISCOVERY.md` for more detail.

## Email Sending

Admin Leads page includes a `Send mails from` input and `Send Mails To All` buttons in every tab.

When an admin saves a scanned area, the `Auto-send Hot emails` toggle can send outreach to Hot leads that already have an email or receive one from automatic enrichment. This toggle is off by default. It uses the same backend route as the manual buttons, so suppression and status protections still apply.

For testing, enable `Test auto-send` before saving scanned leads. The app generates Hot lead emails from the scanned area but sends test copies only to:

- `adityavbs22@gmail.com`
- `aa5179@srmist.edu.in`

Test auto-send does not mark the real lead as `email_sent`.

For each eligible lead, the backend generates a professional email containing:

- Property address
- Estimated panel count
- Annual energy output
- Annual savings
- Upfront installation cost
- Estimated 25-year savings
- ROI
- Roof area

The send flow skips:

- Leads without email
- Suppressed emails
- `email_sent`, `do_not_contact`, `not_interested`, `closed`, `won`, and `lost` leads

Email records are stored in `email_campaigns` and `email_events`, including sender, recipient, subject, text body, HTML body, provider, provider message id, and send status.

### Gmail Demo Mode

Use Gmail when you do not have a domain yet:

```bash
EMAIL_PROVIDER=gmail
GMAIL_USER=your_gmail_address@gmail.com
GMAIL_APP_PASSWORD=your_16_character_google_app_password
```

Gmail sends from the authenticated Gmail account. The dashboard sender email is still used in the email signature and `reply-to`, but Gmail may show the actual sender as `GMAIL_USER`.

This is useful for demos and testing. For production or high-volume outreach, use Resend with a verified client domain.

### Resend Test Mode

If your Resend account is not domain-verified, Resend only allows sending to your account test email. For local testing without a domain, prefer Gmail demo mode and the scan page `Test auto-send` toggle.

For production sending:

1. Verify your domain at Resend.
2. Set `RESEND_FROM_EMAIL=sales@yourdomain.com`.
3. Use that same verified sender in the dashboard.
4. Restart the dev/server process.

## Suppression List

Suppression means "do not email this address."

Add an address to suppression when:

- The person unsubscribed.
- The email bounced.
- The client asked not to be contacted.
- You manually want to block future outreach.

Suppressed emails are skipped by `Send Mails To All`.

## API Routes

Protected backend routes require a Supabase bearer token.

- `GET /api/solar?lat=&lng=`: selected building solar insight.
- `GET /api/solar/leads?lat=&lng=`: nearby lead scan.
- `GET /api/solar/state-leads?state=`: sampled state lead scan.
- `POST /api/enrichment/contact`: admin-only contact enrichment.
- `POST /api/mail/send-leads`: admin-only email generation and send.
- `GET /api/health`: health check.

## Production Notes

- Verify Resend domain before sending to real leads.
- Restrict Google API keys by referrer/IP where appropriate.
- Rotate any API keys that were exposed during development.
- Keep Supabase RLS enabled.
- Run all migrations before testing CRM/email flows.
- Add monitoring for API failures and email bounces before using this at scale.

See `docs/PRODUCTION_READINESS.md` for the longer production checklist.
