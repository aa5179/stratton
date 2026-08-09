-- Stores the sender and generated property-specific email content for each outbound email.
-- Run this once in Supabase SQL editor before using Send Mails To All.

alter table public.email_campaigns
add column if not exists sender_email text;

alter table public.email_events
add column if not exists from_email text,
add column if not exists subject text,
add column if not exists body text,
add column if not exists html_body text;
