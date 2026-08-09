-- Prevent duplicate lead rows when Google Solar building name is missing.
-- Run after checking/removing any existing duplicates, otherwise the unique index can fail.

-- Optional duplicate check before applying the index:
-- select
--   lower(regexp_replace(trim(address), '\s+', ' ', 'g')) as normalized_address,
--   coalesce(upper(trim(city)), '') as city_key,
--   coalesce(upper(trim(state)), '') as state_key,
--   coalesce(trim(zip), '') as zip_key,
--   round(lat::numeric, 5) as lat_key,
--   round(lng::numeric, 5) as lng_key,
--   count(*) as duplicate_count
-- from public.leads
-- group by 1, 2, 3, 4, 5, 6
-- having count(*) > 1;

create unique index if not exists leads_address_location_unique_idx
on public.leads (
  lower(regexp_replace(trim(address), '\s+', ' ', 'g')),
  coalesce(upper(trim(city)), ''),
  coalesce(upper(trim(state)), ''),
  coalesce(trim(zip), ''),
  round(lat::numeric, 5),
  round(lng::numeric, 5)
);
