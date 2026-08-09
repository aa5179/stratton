# Solar Lead Platform API Cost Sheet

Updated: 2026-07-20  
Currency: USD  
Pricing source: Google Maps Platform global pricing list, last updated 2026-07-15 UTC.

## Important Assumptions

- A "solar building scored" means 1 Google Solar API Building Insights request.
- A "premium thermal/raster report" means 1 Google Solar API Data Layers request.
- User map panning/zooming does not count as a new Dynamic Maps load. A map load is charged when the map is loaded in the app.
- Parcel dataset price is not included unless you already have a vendor quote or public parcel data source.
- Database cost assumes Supabase/Postgres unless replaced by your own cloud setup.

## Exact API Prices

| Cost Item | Free Monthly Usage | 0-Free to Tier Cap | 100k-500k | 500k-1M | 1M-5M | 5M+ |
|---|---:|---:|---:|---:|---:|---:|
| Google Solar Building Insights | 10,000 | $10 / 1,000 | $5 / 1,000 | $4.50 / 1,000 | $4 / 1,000 | $3.50 / 1,000 |
| Google Solar Data Layers | 1,000 | $75 / 1,000 | $37.50 / 1,000 | $33.75 / 1,000 | $30 / 1,000 | $26.25 / 1,000 |
| Google Dynamic Maps | 10,000 | $7 / 1,000 | $5.60 / 1,000 | $4.20 / 1,000 | $2.10 / 1,000 | $0.53 / 1,000 |
| Google Places Text Search Pro | 5,000 | $32 / 1,000 | $25.60 / 1,000 | $19.20 / 1,000 | $9.60 / 1,000 | $2.40 / 1,000 |
| Google Places Autocomplete Requests | 10,000 | $2.83 / 1,000 | $2.27 / 1,000 | $1.70 / 1,000 | $0.85 / 1,000 | $0.21 / 1,000 |
| Google Geocoding | 10,000 | $5 / 1,000 | $4 / 1,000 | $3 / 1,000 | $1.50 / 1,000 | $0.38 / 1,000 |

## Database / Hosting

| Item | Real Starting Cost |
|---|---:|
| Supabase Free | $0 / month |
| Supabase Pro | $25 / month |
| Supabase included Pro database | 8 GB included |
| Supabase extra database storage | $0.125 / GB-month |
| Supabase included Pro egress | 250 GB included |
| Supabase extra egress | $0.09 / GB |

## Parcel Data

| Parcel Option | Cost |
|---|---:|
| Free county/state parcel datasets | $0 data cost, engineering/storage cost only |
| Paid parcel vendors, Regrid/LightBox/etc. | Quote-based or plan-based; exact cost depends on coverage, records returned, and license |

Do not use a fake parcel cost in financial planning. Ask the vendor for: state coverage, nationwide coverage, API record price, bulk file price, refresh frequency, redistribution rights, and commercial use rights.

## Cost Formula

Monthly Google cost =

```text
Solar Building Insights cost
+ Solar Data Layers cost
+ Dynamic Maps cost
+ Places Text Search cost
+ Autocomplete cost
+ Geocoding cost
```

Best practice:

```text
Call Google Solar once per parcel/building
Store result in database
Reuse cached/stored result
Do not call Solar again on every refresh
```

## Example Monthly Usage Costs

### MVP

| Usage | Volume | Cost |
|---|---:|---:|
| Solar buildings scored | 10,000 | $0 |
| Map loads | 10,000 | $0 |
| Autocomplete | 10,000 | $0 |
| Geocoding | 10,000 | $0 |
| Places Text Search | 5,000 | $0 |
| Database | Supabase Pro | $25 |
| Estimated total |  | $25 / month |

### Small Production

| Usage | Volume | Cost |
|---|---:|---:|
| Solar buildings scored | 50,000 | $400 |
| Map loads | 25,000 | $105 |
| Autocomplete | 25,000 | $42.45 |
| Geocoding | 10,000 | $0 |
| Places Text Search | 5,000 | $0 |
| Database | Supabase Pro | $25 |
| Estimated total |  | $572.45 / month |

### Growing Production

| Usage | Volume | Cost |
|---|---:|---:|
| Solar buildings scored | 100,000 | $900 |
| Map loads | 50,000 | $280 |
| Autocomplete | 50,000 | $113.20 |
| Geocoding | 25,000 | $75 |
| Places Text Search | 20,000 | $480 |
| Database | Supabase Pro | $25 |
| Estimated total |  | $1,873.20 / month |

### State-Scale Batch Scoring

| Usage | Volume | Cost |
|---|---:|---:|
| Solar buildings scored | 500,000 | $2,900 |
| Map loads | 100,000 | $630 |
| Autocomplete | 100,000 | $254.70 |
| Geocoding | 50,000 | $200 |
| Places Text Search | 50,000 | $1,440 |
| Database/storage | Estimate | $100-$700+ |
| Estimated total before parcel vendor |  | $5,524.70-$6,124.70 / month |

### Premium Reports With Solar Data Layers

Add this only when generating premium raster/thermal/roof reports.

| Data Layers Reports | Cost |
|---:|---:|
| 1,000 / month | $0 |
| 10,000 / month | $675 |
| 50,000 / month | $3,675 |
| 100,000 / month | $7,425 |

## Practical Business Recommendation

Start with:

- Solar Building Insights only.
- Parcel/building database with PostGIS.
- Cache each building result.
- Use Data Layers only for paid proposal/report users.
- Avoid live state-wide Solar scans; batch process parcel candidates offline.

Minimum realistic production budget:

```text
$500-$2,000 / month for early production
$5,000-$10,000+ / month for state-scale operation
Parcel vendor cost separate unless using free public data
```

## Sources

- Google Maps Platform pricing: https://developers.google.cn/maps/billing-and-pricing/pricing?hl=en
- Google Solar product: https://mapsplatform.google.com/maps-products/solar/
- Supabase pricing: https://supabase.com/pricing
- Regrid API billing docs: https://support.regrid.com/api/using-the-parcel-api
