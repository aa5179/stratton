-- Adds a phone-only ready state for leads that have a callable contact but no email.
-- Run this once in Supabase SQL editor before using phone-only contact readiness.

alter type public.lead_status add value if not exists 'contact_ready';
