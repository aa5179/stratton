import { apiFetch } from './apiClient.js'

const solarRequestCache = new Map()
const solarLeadsRequestCache = new Map()
const solarStateLeadsRequestCache = new Map()

function getApiErrorMessage(payload, fallback) {
  if (payload?.code === 'RESOURCE_EXHAUSTED') {
    return 'Google Solar quota was reached. Wait about one minute, then try again.'
  }

  return payload?.error || fallback
}

export async function fetchSolarInsights(lat, lng, options = {}) {
  const cacheKey = `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`

  if (options.force) {
    solarRequestCache.delete(cacheKey)
  }

  if (!options.force && solarRequestCache.has(cacheKey)) {
    return solarRequestCache.get(cacheKey)
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

      return payload
    })

  solarRequestCache.set(cacheKey, request)

  return request
}

export async function fetchSolarLeads(lat, lng, options = {}) {
  const radiusMeters = Number(options.radiusMeters ?? 1000)
  const maxSamples = Number(options.maxSamples ?? 24)
  const cacheKey = [
    Number(lat).toFixed(6),
    Number(lng).toFixed(6),
    Math.round(radiusMeters),
    Math.round(maxSamples),
  ].join(',')

  if (options.force) {
    solarLeadsRequestCache.delete(cacheKey)
  }

  if (!options.force && solarLeadsRequestCache.has(cacheKey)) {
    return solarLeadsRequestCache.get(cacheKey)
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

      return payload
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
  }

  if (!options.force && solarStateLeadsRequestCache.has(cacheKey)) {
    return solarStateLeadsRequestCache.get(cacheKey)
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

      return payload
    })

  solarStateLeadsRequestCache.set(cacheKey, request)

  return request
}
