import { formatSolarInsights } from './solarFormatter.js'

const DEFAULT_REQUIRED_QUALITY = 'BASE'
const METERS_PER_LATITUDE_DEGREE = 111_320
const EARTH_RADIUS_METERS = 6_371_000
const SOLAR_CACHE_TTL_MS = 30 * 60 * 1000
const SOLAR_SCAN_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const solarPayloadCache = new Map()
const solarLeadScanCache = new Map()
const solarStateLeadScanCache = new Map()
const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.types',
].join(',')

const US_STATE_NAMES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
}

const STATE_LEAD_QUERIES = [
  'warehouse buildings',
  'commercial buildings',
  'office buildings',
  'schools',
  'shopping centers',
  'manufacturing facilities',
]

function getApiKey() {
  const apiKey = process.env.GOOGLE_SOLAR_API_KEY
    ?? process.env.VITE_GOOGLE_SOLAR_API_KEY

  if (!apiKey) {
    const error = new Error('Missing GOOGLE_SOLAR_API_KEY or VITE_GOOGLE_SOLAR_API_KEY in environment.')
    error.status = 500
    throw error
  }

  return apiKey
}

function getPlacesApiKey() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
    ?? process.env.GOOGLE_MAPS_API_KEY
    ?? process.env.VITE_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    const error = new Error(
      'Missing GOOGLE_PLACES_API_KEY, GOOGLE_MAPS_API_KEY, or VITE_GOOGLE_MAPS_API_KEY in environment.',
    )
    error.status = 500
    throw error
  }

  return apiKey
}

function buildSolarUrl({ lat, lng }) {
  const url = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest')
  url.searchParams.set('location.latitude', String(lat))
  url.searchParams.set('location.longitude', String(lng))
  url.searchParams.set('requiredQuality', DEFAULT_REQUIRED_QUALITY)
  url.searchParams.set('additionalInsights', 'DETECTED_ARRAYS')
  url.searchParams.set('key', getApiKey())

  return url
}

function getSolarCacheKey({ lat, lng }) {
  return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`
}

function getAreaCacheCell({ lat, lng, radiusMeters }) {
  const cellMeters = Math.max(100, Math.min(500, Math.round(radiusMeters / 3)))
  const lngMeters = Math.max(1, METERS_PER_LATITUDE_DEGREE * Math.cos((Number(lat) * Math.PI) / 180))
  const latStep = cellMeters / METERS_PER_LATITUDE_DEGREE
  const lngStep = cellMeters / lngMeters

  return [
    Math.round(Number(lat) / latStep),
    Math.round(Number(lng) / lngStep),
    cellMeters,
  ].join(',')
}

async function getCachedScanResult(cache, cacheKey, producer) {
  const cached = cache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    const payload = await cached.promise
    return { ...payload, cacheHit: true }
  }

  const promise = producer()
  cache.set(cacheKey, {
    expiresAt: Date.now() + SOLAR_SCAN_CACHE_TTL_MS,
    promise,
  })

  try {
    const payload = await promise
    return { ...payload, cacheHit: false }
  } catch (error) {
    cache.delete(cacheKey)
    throw error
  }
}

async function requestSolarPayload({ lat, lng }) {
  const cacheKey = getSolarCacheKey({ lat, lng })
  const cached = solarPayloadCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  const url = buildSolarUrl({ lat, lng })

  const promise = (async () => {
    let response

    try {
      response = await fetch(url)
    } catch (error) {
      const upstreamError = new Error(`Google Solar API network request failed: ${error.message}`)
      upstreamError.status = 502
      upstreamError.code = 'SOLAR_API_NETWORK_ERROR'
      throw upstreamError
    }

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const error = new Error(
        payload?.error?.message || 'Google Solar API request failed.',
      )
      error.status = response.status === 400 || response.status === 429 ? response.status : 502
      error.code = payload?.error?.status || 'SOLAR_API_ERROR'
      error.details = payload
      throw error
    }

    return payload
  })()

  solarPayloadCache.set(cacheKey, {
    expiresAt: Date.now() + SOLAR_CACHE_TTL_MS,
    promise,
  })

  try {
    return await promise
  } catch (error) {
    solarPayloadCache.delete(cacheKey)
    throw error
  }
}

async function requestPlacesTextSearch({ textQuery, maxResultCount }) {
  let response

  try {
    response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getPlacesApiKey(),
        'X-Goog-FieldMask': PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery,
        pageSize: maxResultCount,
        regionCode: 'US',
      }),
    })
  } catch (error) {
    const upstreamError = new Error(`Google Places API network request failed: ${error.message}`)
    upstreamError.status = 502
    upstreamError.code = 'PLACES_API_NETWORK_ERROR'
    throw upstreamError
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(
      payload?.error?.message || 'Google Places API request failed.',
    )
    error.status = response.status === 400 ? 400 : 502
    error.code = payload?.error?.status || 'PLACES_API_ERROR'
    error.details = payload
    throw error
  }

  return Array.isArray(payload?.places) ? payload.places : []
}

function buildScanPoints({ lat, lng, radiusMeters }) {
  const rings = [
    { ratio: 0, count: 1 },
    { ratio: 0.25, count: 8 },
    { ratio: 0.5, count: 12 },
    { ratio: 0.75, count: 16 },
    { ratio: 1, count: 24 },
  ]
  const lngMeters = Math.max(1, METERS_PER_LATITUDE_DEGREE * Math.cos((lat * Math.PI) / 180))

  return rings.flatMap((ring) => {
    if (ring.count === 1) {
      return [{ lat, lng }]
    }

    return Array.from({ length: ring.count }, (_, index) => {
      const angle = (index / ring.count) * Math.PI * 2
      const distance = radiusMeters * ring.ratio
      const northMeters = Math.cos(angle) * distance
      const eastMeters = Math.sin(angle) * distance

      return {
        lat: lat + (northMeters / METERS_PER_LATITUDE_DEGREE),
        lng: lng + (eastMeters / lngMeters),
      }
    })
  })
}

function getLatLng(location) {
  if (!location) {
    return null
  }

  const lat = location.lat ?? location.latitude
  const lng = location.lng ?? location.longitude

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null
  }

  return { lat, lng }
}

function getDistanceMeters(from, to) {
  const fromLat = Number(from?.lat)
  const fromLng = Number(from?.lng)
  const toLat = Number(to?.lat)
  const toLng = Number(to?.lng)

  if ([fromLat, fromLng, toLat, toLng].some((value) => Number.isNaN(value))) {
    return null
  }

  const toRadians = (value) => (value * Math.PI) / 180
  const latDistance = toRadians(toLat - fromLat)
  const lngDistance = toRadians(toLng - fromLng)
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(lngDistance / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_METERS * c
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = []
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )

  return results
}

async function getPlacesForState({ state, maxPlaces }) {
  const stateCode = String(state || '').trim().toUpperCase()
  const stateName = US_STATE_NAMES[stateCode] ?? String(state || '').trim()

  if (!stateName) {
    const error = new Error('A US state code or state name is required.')
    error.status = 400
    throw error
  }

  const perQueryLimit = Math.min(20, Math.max(3, Math.ceil(maxPlaces / STATE_LEAD_QUERIES.length)))
  const placeMap = new Map()
  const errors = []

  await mapWithConcurrency(STATE_LEAD_QUERIES, 2, async (leadQuery) => {
    try {
      const places = await requestPlacesTextSearch({
        textQuery: `${leadQuery} in ${stateName}, USA`,
        maxResultCount: perQueryLimit,
      })

      places.forEach((place) => {
        const location = getLatLng(place.location)

        if (!location || placeMap.size >= maxPlaces) {
          return
        }

        const key = place.id ?? `${location.lat.toFixed(5)},${location.lng.toFixed(5)}`

        if (!placeMap.has(key)) {
          placeMap.set(key, {
            id: place.id ?? key,
            name: place.displayName?.text ?? 'Unnamed place',
            address: place.formattedAddress ?? '',
            types: place.types ?? [],
            location,
            sourceQuery: leadQuery,
          })
        }
      })
    } catch (error) {
      errors.push({
        query: leadQuery,
        message: error.message,
        code: error.code,
      })
    }
  })

  return {
    stateCode,
    stateName,
    places: [...placeMap.values()].slice(0, maxPlaces),
    placeErrors: errors,
  }
}

export async function getSolarInsights({ lat, lng }) {
  return formatSolarInsights(await requestSolarPayload({ lat, lng }))
}

export async function getSolarLeadsNear({ lat, lng, radiusMeters = 1000, maxSamples = 24 }) {
  const scanRadius = Math.min(Math.max(Number(radiusMeters) || 1000, 100), 2000)
  const sampleLimit = Math.min(Math.max(Number(maxSamples) || 24, 1), 36)
  const cacheKey = [
    getAreaCacheCell({ lat, lng, radiusMeters: scanRadius }),
    Math.round(scanRadius),
    Math.round(sampleLimit),
  ].join(',')

  return getCachedScanResult(solarLeadScanCache, cacheKey, async () => {
    const scanPoints = buildScanPoints({ lat, lng, radiusMeters: scanRadius }).slice(0, sampleLimit)
    const buildings = new Map()
    const errors = []

    await mapWithConcurrency(scanPoints, 4, async (point, index) => {
      try {
        const payload = await requestSolarPayload(point)
        const formatted = formatSolarInsights(payload)
        const center = getLatLng(formatted.center)
        const distanceMeters = getDistanceMeters({ lat, lng }, center)

        if (!center || distanceMeters === null || distanceMeters > scanRadius) {
          return
        }

        const key = formatted.buildingName
          ?? `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`

        if (!buildings.has(key)) {
          buildings.set(key, {
            ...formatted,
            sampleIndex: index,
            sampledFrom: point,
            distanceMeters,
          })
        }
      } catch (error) {
        errors.push({
          sampleIndex: index,
          message: error.message,
          code: error.code,
        })
      }
    })

    return {
      radiusMeters: scanRadius,
      sampleCount: scanPoints.length,
      discoveredCount: buildings.size,
      leads: [...buildings.values()],
      errors,
    }
  })
}

export async function getSolarStateLeads({ state, maxPlaces = 12 }) {
  const placeLimit = Math.min(Math.max(Number(maxPlaces) || 12, 1), 24)
  const stateCode = String(state || '').trim().toUpperCase()
  const cacheKey = `${stateCode},${Math.round(placeLimit)}`

  return getCachedScanResult(solarStateLeadScanCache, cacheKey, async () => {
    const {
      stateCode: resolvedStateCode,
      stateName,
      places,
      placeErrors,
    } = await getPlacesForState({ state, maxPlaces: placeLimit })
    const buildings = new Map()
    const errors = [...placeErrors]

    await mapWithConcurrency(places, 3, async (place) => {
      try {
        const payload = await requestSolarPayload({
          lat: place.location.lat,
          lng: place.location.lng,
        })
        const formatted = formatSolarInsights(payload)
        const center = getLatLng(formatted.center)
        const key = formatted.buildingName
          ?? place.id
          ?? `${center?.lat?.toFixed(5)},${center?.lng?.toFixed(5)}`

        if (!buildings.has(key)) {
          buildings.set(key, {
            ...formatted,
            placeId: place.id,
            placeName: place.name,
            placeAddress: place.address,
            placeTypes: place.types,
            sourceQuery: place.sourceQuery,
            sampledFrom: place.location,
          })
        }
      } catch (error) {
        errors.push({
          placeId: place.id,
          placeName: place.name,
          message: error.message,
          code: error.code,
        })
      }
    })

    return {
      stateCode: resolvedStateCode,
      stateName,
      placeCount: places.length,
      discoveredCount: buildings.size,
      leads: [...buildings.values()],
      errors,
    }
  })
}
