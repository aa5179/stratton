-- Solar Lead CRM database schema
-- Target: Supabase Postgres with PostGIS and Row Level Security.
-- Run in Supabase SQL editor after creating a project.

create extension if not exists postgis;
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'ground_employee');
create type public.user_status as enum ('active', 'inactive');
create type public.lead_status as enum (
  'new',
  'scored',
  'email_found',
  'email_sent',
  'contact_ready',
  'no_email_found',
  'assigned_to_field',
  'visited',
  'contacted',
  'pending',
  'interested',
  'not_interested',
  'closed',
  'won',
  'lost',
  'do_not_contact'
);
create type public.ticket_status as enum (
  'pending',
  'visited',
  'contacted',
  'follow_up',
  'interested',
  'not_interested',
  'closed',
  'won',
  'lost'
);
create type public.email_status as enum (
  'queued',
  'sent',
  'opened',
  'clicked',
  'bounced',
  'unsubscribed',
  'failed'
);
create type public.suppression_reason as enum (
  'unsubscribe',
  'bounce',
  'manual'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.app_role not null default 'ground_employee',
  status public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.parcels (
  id uuid primary key default gen_random_uuid(),
  external_parcel_id text unique,
  address text,
  city text,
  state text,
  zip text,
  county text,
  owner_name text,
  owner_mailing_address text,
  property_type text,
  land_use text,
  building_area_m2 numeric,
  roof_area_m2 numeric,
  assessed_value numeric,
  geom geometry(MultiPolygon, 4326),
  centroid geography(Point, 4326),
  raw_source_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index parcels_centroid_gix on public.parcels using gist (centroid);
create index parcels_geom_gix on public.parcels using gist (geom);
create index parcels_state_city_idx on public.parcels (state, city);
create index parcels_owner_idx on public.parcels (owner_name);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid references public.parcels(id) on delete set null,
  google_solar_building_name text,
  address text not null,
  city text,
  state text,
  zip text,
  lat double precision not null,
  lng double precision not null,
  location geography(Point, 4326) generated always as (
    st_setsrid(st_makepoint(lng, lat), 4326)::geography
  ) stored,
  owner_name text,
  business_name text,
  email text,
  phone text,
  email_source text,
  phone_source text,
  property_type text,
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  priority text not null default 'Low',
  status public.lead_status not null default 'new',
  assigned_to uuid references public.profiles(id) on delete set null,
  last_contacted_at timestamptz,
  source text not null default 'google_solar',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (google_solar_building_name)
);

create index leads_location_gix on public.leads using gist (location);
create index leads_status_idx on public.leads (status);
create index leads_assigned_to_idx on public.leads (assigned_to);
create index leads_state_city_idx on public.leads (state, city);
create index leads_score_idx on public.leads (lead_score desc);
create index leads_email_idx on public.leads (email);
create unique index leads_address_location_unique_idx on public.leads (
  lower(regexp_replace(trim(address), '\s+', ' ', 'g')),
  coalesce(upper(trim(city)), ''),
  coalesce(upper(trim(state)), ''),
  coalesce(trim(zip), ''),
  round(lat::numeric, 5),
  round(lng::numeric, 5)
);

create table public.solar_assessments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  google_solar_building_name text,
  max_panels integer,
  selected_panels integer,
  annual_energy_kwh numeric,
  annual_savings numeric,
  roof_area_m2 numeric,
  building_area_m2 numeric,
  solar_score numeric,
  panel_capacity_watts numeric,
  panel_width_meters numeric,
  panel_height_meters numeric,
  estimated_install_cost numeric,
  estimated_25_year_savings numeric,
  roi numeric,
  raw_google_solar_json jsonb,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index solar_assessments_lead_id_idx on public.solar_assessments (lead_id);
create index solar_assessments_assessed_at_idx on public.solar_assessments (assessed_at desc);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  status public.ticket_status not null default 'pending',
  title text not null default 'Field follow-up',
  notes text,
  next_follow_up_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_lead_id_idx on public.tickets (lead_id);
create index tickets_assigned_to_idx on public.tickets (assigned_to);
create index tickets_status_idx on public.tickets (status);

create table public.ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  old_status public.ticket_status,
  new_status public.ticket_status,
  note text,
  created_at timestamptz not null default now()
);

create index ticket_updates_ticket_id_idx on public.ticket_updates (ticket_id);

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_subject text not null,
  template_body text not null,
  sender_email text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  to_email text not null,
  from_email text,
  subject text,
  body text,
  html_body text,
  status public.email_status not null default 'queued',
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_events_lead_id_idx on public.email_events (lead_id);
create index email_events_campaign_id_idx on public.email_events (campaign_id);
create index email_events_status_idx on public.email_events (status);

create table public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason public.suppression_reason not null,
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger touch_parcels_updated_at
before update on public.parcels
for each row execute function public.touch_updated_at();

create trigger touch_leads_updated_at
before update on public.leads
for each row execute function public.touch_updated_at();

create trigger touch_tickets_updated_at
before update on public.tickets
for each row execute function public.touch_updated_at();

create trigger touch_email_campaigns_updated_at
before update on public.email_campaigns
for each row execute function public.touch_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and status = 'active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'admin'
$$;

alter table public.profiles enable row level security;
alter table public.parcels enable row level security;
alter table public.leads enable row level security;
alter table public.solar_assessments enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_updates enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_events enable row level security;
alter table public.suppression_list enable row level security;

create policy "profiles_select_self_or_admin"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_all"
on public.profiles for all
using (public.is_admin())
with check (public.is_admin());

create policy "admin_all_parcels"
on public.parcels for all
using (public.is_admin())
with check (public.is_admin());

create policy "employees_read_parcels"
on public.parcels for select
using (public.current_user_role() in ('admin', 'ground_employee'));

create policy "admin_all_leads"
on public.leads for all
using (public.is_admin())
with check (public.is_admin());

create policy "employees_read_assigned_leads"
on public.leads for select
using (
  public.is_admin()
  or assigned_to = auth.uid()
);

create policy "employees_update_assigned_leads"
on public.leads for update
using (assigned_to = auth.uid())
with check (assigned_to = auth.uid());

create policy "admin_all_solar_assessments"
on public.solar_assessments for all
using (public.is_admin())
with check (public.is_admin());

create policy "employees_read_assigned_solar_assessments"
on public.solar_assessments for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.leads
    where leads.id = solar_assessments.lead_id
      and leads.assigned_to = auth.uid()
  )
);

create policy "admin_all_tickets"
on public.tickets for all
using (public.is_admin())
with check (public.is_admin());

create policy "employees_read_assigned_tickets"
on public.tickets for select
using (
  public.is_admin()
  or assigned_to = auth.uid()
);

create policy "employees_update_assigned_tickets"
on public.tickets for update
using (assigned_to = auth.uid())
with check (assigned_to = auth.uid());

create policy "employees_insert_ticket_updates"
on public.ticket_updates for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.tickets
    where tickets.id = ticket_updates.ticket_id
      and tickets.assigned_to = auth.uid()
  )
);

create policy "ticket_updates_read_visible"
on public.ticket_updates for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.tickets
    where tickets.id = ticket_updates.ticket_id
      and tickets.assigned_to = auth.uid()
  )
);

create policy "admin_all_email_campaigns"
on public.email_campaigns for all
using (public.is_admin())
with check (public.is_admin());

create policy "admin_all_email_events"
on public.email_events for all
using (public.is_admin())
with check (public.is_admin());

create policy "admin_all_suppression_list"
on public.suppression_list for all
using (public.is_admin())
with check (public.is_admin());

-- Radius search helper for area leads.
create or replace function public.leads_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_meters double precision
)
returns setof public.leads
language sql
stable
as $$
  select *
  from public.leads
  where st_dwithin(
    location,
    st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography,
    radius_meters
  )
  order by lead_score desc;
$$;
