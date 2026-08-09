-- Adds statuses used by the production CRM workflow.
-- Run this once in Supabase SQL editor if your database was created before these statuses existed.

alter type public.lead_status add value if not exists 'not_interested';
alter type public.ticket_status add value if not exists 'interested';
alter type public.ticket_status add value if not exists 'not_interested';
