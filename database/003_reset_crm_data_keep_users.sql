-- Danger zone: clears CRM/business data while keeping Supabase auth users and public.profiles.
-- Run this in Supabase SQL editor when you want a clean test database.
-- This preserves:
--   - auth.users
--   - public.profiles

truncate table
  public.email_events,
  public.email_campaigns,
  public.ticket_updates,
  public.tickets,
  public.solar_assessments,
  public.leads,
  public.parcels,
  public.suppression_list
restart identity cascade;
