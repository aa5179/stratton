import { apiFetch } from './apiClient.js'

const solarRequestCache = new Map()
const solarLeadsRequestCache = new Map()
const solarStateLeadsRequestCache = new Map()
const METERS_PER_LATITUDE_DEGREE = 111_320
const CACHE_PREFIX = 'stratton:solar-cache:v2'
const SOLAR_INSIGHT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const SOLAR_LEAD_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function getApiErrorMessage(payload, fallback) {
  if (payload?.code === 'RESOURCE_EXHAUSTED') {
    return 'Google Solar quota was reached. Wait about one minute, then try again.'
  }

  return payload?.error || fallback
}

function withCacheHit(payload, cacheHit) {
  return payload && typeof payload === 'object'
    ? { ...payload, cacheHit }
    : payload
}

function readPersistentCache(key) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}:${key}`)
    const cached = raw ? JSON.parse(raw) : null

    if (!cached || cached.expiresAt <= Date.now()) {
      window.localStorage.removeItem(`${CACHE_PREFIX}:${key}`)
      return null
    }

    return withCacheHit(cached.payload, true)
  } catch {
    return null
  }
}

function writePersistentCache(key, payload, ttlMs) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(`${CACHE_PREFIX}:${key}`, JSON.stringify({
      expiresAt: Date.now() + ttlMs,
      payload,
    }))
  } catch {
    // If localStorage is full or blocked, the in-memory cache still prevents duplicate calls this session.
  }
}

function deletePersistentCache(key) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(`${CACHE_PREFIX}:${key}`)
  } catch {
    // Cache cleanup is best-effort.
  }
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

export async function fetchSolarInsights(lat, lng, options = {}) {
  const cacheKey = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`

  if (options.force) {
    solarRequestCache.delete(cacheKey)
    deletePersistentCache(`insight:${cacheKey}`)
  }

  if (!options.force && solarRequestCache.has(cacheKey)) {
    return solarRequestCache.get(cacheKey)
  }

  const cached = !options.force ? readPersistentCache(`insight:${cacheKey}`) : null

  if (cached) {
    const request = Promise.resolve(cached)
    solarRequestCache.set(cacheKey, request)
    return request
  }

  const query = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  })

  const request = apiFetch(`/api/solar?${query.toString()}`)
    .then(async (response) => {
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to load solar insights.'))
      }

      const cachedPayload = withCacheHit(payload, false)
      writePersistentCache(`insight:${cacheKey}`, cachedPayload, SOLAR_INSIGHT_CACHE_TTL_MS)
      return cachedPayload
    })
    .catch((error) => {
      solarRequestCache.delete(cacheKey)
      throw error
    })

  solarRequestCache.set(cacheKey, request)

  return request
}

export async function fetchSolarLeads(lat, lng, options = {}) {
  const radiusMeters = Number(options.radiusMeters ?? 1000)
  const maxSamples = Number(options.maxSamples ?? 24)
  const cacheKey = [
    getAreaCacheCell({ lat, lng, radiusMeters }),
    Math.round(radiusMeters),
    Math.round(maxSamples),
  ].join(',')

  if (options.force) {
    solarLeadsRequestCache.delete(cacheKey)
    deletePersistentCache(`leads:${cacheKey}`)
  }

  if (!options.force && solarLeadsRequestCache.has(cacheKey)) {
    return solarLeadsRequestCache.get(cacheKey)
  }

  const cached = !options.force ? readPersistentCache(`leads:${cacheKey}`) : null

  if (cached) {
    const request = Promise.resolve(cached)
    solarLeadsRequestCache.set(cacheKey, request)
    return request
  }

  const query = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radiusMeters: String(radiusMeters),
    maxSamples: String(maxSamples),
  })

  const request = apiFetch(`/api/solar/leads?${query.toString()}`)
    .then(async (response) => {
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to load solar leads.'))
      }

      const cachedPayload = withCacheHit(payload, false)
      writePersistentCache(`leads:${cacheKey}`, cachedPayload, SOLAR_LEAD_CACHE_TTL_MS)
      return cachedPayload
    })
    .catch((error) => {
      solarLeadsRequestCache.delete(cacheKey)
      throw error
    })

  solarLeadsRequestCache.set(cacheKey, request)

  return request
}

export async function fetchStateSolarLeads(state, options = {}) {
  const stateCode = String(state || '').trim().toUpperCase()
  const maxPlaces = Number(options.maxPlaces ?? 12)
  const cacheKey = `${stateCode},${Math.round(maxPlaces)}`

  if (options.force) {
    solarStateLeadsRequestCache.delete(cacheKey)
    deletePersistentCache(`state-leads:${cacheKey}`)
  }

  if (!options.force && solarStateLeadsRequestCache.has(cacheKey)) {
    return solarStateLeadsRequestCache.get(cacheKey)
  }

  const cached = !options.force ? readPersistentCache(`state-leads:${cacheKey}`) : null

  if (cached) {
    const request = Promise.resolve(cached)
    solarStateLeadsRequestCache.set(cacheKey, request)
    return request
  }

  const query = new URLSearchParams({
    state: stateCode,
    maxPlaces: String(maxPlaces),
  })

  const request = apiFetch(`/api/solar/state-leads?${query.toString()}`)
    .then(async (response) => {
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, 'Unable to load state solar leads.'))
      }

      const cachedPayload = withCacheHit(payload, false)
      writePersistentCache(`state-leads:${cacheKey}`, cachedPayload, SOLAR_LEAD_CACHE_TTL_MS)
      return cachedPayload
    })
    .catch((error) => {
      solarStateLeadsRequestCache.delete(cacheKey)
      throw error
    })

  solarStateLeadsRequestCache.set(cacheKey, request)

  return request
}
