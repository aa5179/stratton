# Solar Lead Dashboard: CRM, Email, Field Team, and Scoring Plan

Updated: 2026-08-09

## What You Want To Build

The dashboard should become a real solar-lead CRM:

- Find high-potential solar clients in a selected area.
- Store parcel/building/client records in a database.
- Find or enrich email addresses where available.
- Automatically send outreach emails to potential clients.
- Give ground employees a login.
- Give admins a login.
- Assign no-email leads to ground employees for in-person contact.
- Let ground employees update lead/ticket status after visiting or talking to the client.
- Track lead statuses such as New, Email Found, Assigned, Contacted, Pending, Interested, Not Interested, Closed, Won.

## Reality Check

Google Solar does not provide email addresses.

To get email/client contact information, you need one or more of:

- Parcel ownership dataset.
- Business/place dataset.
- Email enrichment provider.
- Public website/domain search.
- Manual field collection by ground employees.

The app must not invent email addresses. If an email is not found from a real source, it should stay blank and move to field contact.

## Required Integrations

| Feature | Required Integration |
|---|---|
| Login | Auth provider, Supabase Auth, Clerk, Auth0, or custom JWT |
| Admin / ground employee roles | Users table with role field |
| Lead storage | PostgreSQL + PostGIS |
| Parcel storage | Parcel table with geometry and owner fields |
| Area search | PostGIS radius / polygon query |
| Solar potential | Google Solar Building Insights |
| Email enrichment | Hunter, Apollo, People Data Labs, Clearbit-style enrichment, or custom website search |
| Automated email sending | SendGrid, Mailgun, Amazon SES, Resend |
| Field employee tickets | Tickets table + status workflow |
| Email compliance | Unsubscribe, suppression list, CAN-SPAM fields |

## Recommended Database Tables

### users

```text
id
name
email
role: admin | ground_employee
status: active | inactive
created_at
```

### leads

```text
id
parcel_id
building_id
address
city
state
zip
lat
lng
owner_name
business_name
email
phone
email_source
lead_score
priority
status
assigned_to
last_contacted_at
created_at
updated_at
```

### solar_assessments

```text
id
lead_id
google_solar_building_name
max_panels
selected_panels
annual_energy_kwh
annual_savings
roof_area_m2
solar_score
estimated_install_cost
roi
raw_google_solar_json
created_at
```

### tickets

```text
id
lead_id
assigned_to
status: pending | contacted | follow_up | closed | won | lost
notes
next_follow_up_at
created_at
updated_at
closed_at
```

### email_campaigns

```text
id
name
template_subject
template_body
created_by
created_at
```

### email_events

```text
id
lead_id
campaign_id
to_email
status: queued | sent | opened | clicked | bounced | unsubscribed | failed
provider_message_id
sent_at
created_at
```

### suppression_list

```text
id
email
reason: unsubscribe | bounce | manual
created_at
```

## Dashboard Roles

### Admin

Admin can:

- View all leads.
- Search leads by area.
- Run solar scoring.
- Run email enrichment.
- Start email campaigns.
- Assign no-email leads to ground employees.
- View ticket status.
- Export reports.

### Ground Employee

Ground employee can:

- Login.
- See assigned leads only.
- View address, map, notes, and client/property info.
- Mark status: Pending, Visited, Contacted, Interested, Not Interested, Closed.
- Add visit notes.
- Add collected email/phone if the client provides it.
- Raise or close a ticket.

## Email Workflow

1. System finds high-potential lead.
2. System checks database for existing email.
3. If no email, run enrichment.
4. If email is found:
   - Validate email.
   - Check suppression list.
   - Add to campaign queue.
   - Send email through provider.
   - Track sent/open/click/bounce/unsubscribe.
5. If no email is found:
   - Assign to ground employee.
   - Create field ticket.
   - Ground employee visits/contact client offline.
   - Employee updates status and notes.

## Current Algorithm Audit

Current file:

```text
src/utils/leadDashboard.js
```

Current score uses:

```text
roof area
panel count
annual savings
state electricity rate
solar potential score
```

This is a good MVP, but not enough for production.

### Current Issues

- Electricity rates are hardcoded and may become outdated.
- Install cost is fixed at `$2,800 per panel`, which is too simple.
- It does not know parcel owner, property type, or business category.
- It does not know whether the lead has an email or phone.
- It does not include outreach history.
- It does not include utility usage or electricity bill size.
- It does not include roof age or structural constraints.
- It does not include historical conversion data.
- It can over-rank very large roofs even if the owner/contact fit is weak.

## Better Production Lead Score

Use a 100-point score:

| Category | Weight |
|---|---:|
| Solar capacity | 25 |
| Annual energy output | 20 |
| Financial value / savings | 20 |
| Property fit | 15 |
| Contactability | 10 |
| Outreach readiness | 10 |

### Suggested Formula

```text
lead_score =
  solar_capacity_score
+ energy_output_score
+ savings_score
+ property_fit_score
+ contactability_score
+ outreach_readiness_score
```

### Scoring Details

```text
solar_capacity_score:
  based on max panel count and roof area

energy_output_score:
  based on annual kWh and kWh per panel

savings_score:
  based on annual savings, payback period, and ROI

property_fit_score:
  based on parcel/building type such as commercial, warehouse, school, residential

contactability_score:
  email found = high
  phone found = medium
  no contact = low

outreach_readiness_score:
  no prior contact = medium
  bounced/unsubscribed = zero
  interested/follow-up = high
```

## Recommended Status Flow

```text
New
Scored
Email Found
Email Sent
No Email Found
Assigned To Field
Visited
Contacted
Pending
Interested
Closed
Won
Lost
Do Not Contact
```

## What To Build First

Phase 1:

- Add database.
- Add users and roles.
- Store leads.
- Store solar assessments.
- Store tickets.
- Build admin and ground employee views.

Phase 2:

- Add parcel import.
- Add area lead search from parcel data.
- Score parcel buildings with Google Solar.
- Cache all Solar results.

Phase 3:

- Add email enrichment.
- Add automated email campaigns.
- Add suppression list and unsubscribe handling.

Phase 4:

- Improve lead scoring using real conversion data.
- Add admin analytics.
- Add employee performance tracking.

## Key Rule

Do not send automated emails until:

- email source is real,
- unsubscribe is implemented,
- suppression list is implemented,
- sender domain is verified,
- admin can audit sent emails.
