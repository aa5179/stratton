const PDL_ENRICH_URL = 'https://api.peopledatalabs.com/v5/person/enrich'
const HUNTER_DOMAIN_SEARCH_URL = 'https://api.hunter.io/v2/domain-search'
const GOOGLE_PLACES_TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'
const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.types',
].join(',')

const BUSINESS_OWNER_PATTERN = /\b(llc|inc|corp|corporation|co\.|company|trust|holdings|properties|property|management|partners|realty|lp|llp|ltd)\b/i
const COMMERCIAL_PATTERN = /\b(warehouse|industrial|manufacturing|factory|school|retail|shopping|office|commercial|restaurant|store|hotel|medical|clinic|business|mixed|apartment|multifamily)\b/i
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const VALID_EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const BLOCKED_EMAIL_PREFIXES = /^(noreply|no-reply|donotreply|do-not-reply|example|test)@/i

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function getPlacesApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY
    ?? process.env.GOOGLE_MAPS_API_KEY
    ?? process.env.VITE_GOOGLE_MAPS_API_KEY
    ?? ''
}

function getHunterApiKey() {
  return process.env.HUNTER_API_KEY
    ?? (cleanText(process.env.ENRICHMENT_PROVIDER).toLowerCase() === 'hunter'
      ? process.env.ENRICHMENT_API_KEY
      : '')
    ?? ''
}

function getFullName(lead) {
  const ownerName = cleanText(lead.ownerName)

  if (ownerName && !BUSINESS_OWNER_PATTERN.test(ownerName)) {
    return ownerName
  }

  return cleanText(lead.contactName)
}

function getCompanyName(lead) {
  return cleanText(lead.businessName)
    || cleanText(lead.ownerName)
    || cleanText(lead.address)
}

function isBusinessLead(lead) {
  return Boolean(
    cleanText(lead.businessName)
    || BUSINESS_OWNER_PATTERN.test(cleanText(lead.ownerName))
    || COMMERCIAL_PATTERN.test(cleanText(lead.propertyType))
    || COMMERCIAL_PATTERN.test(cleanText(lead.landUse)),
  )
}

function normalizeEmailEntries(emails) {
  if (!Array.isArray(emails)) {
    return []
  }

  return emails
    .map((email) => {
      if (typeof email === 'string') {
        return email
      }

      return email?.address || email?.email || email?.value || ''
    })
    .filter(Boolean)
}

function normalizePhoneEntries(phones) {
  if (!Array.isArray(phones)) {
    return []
  }

  return phones
    .map((phone) => {
      if (typeof phone === 'string') {
        return phone
      }

      return phone?.number || phone?.phone || ''
    })
    .filter(Boolean)
}

function normalizeEmails(emails) {
  return [...new Set((emails ?? [])
    .map((email) => cleanText(email).toLowerCase())
    .filter((email) => VALID_EMAIL_PATTERN.test(email) && !BLOCKED_EMAIL_PREFIXES.test(email)))]
}

function getDomainFromUrl(value) {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`)
    return url.hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function normalizeWebsiteUrl(value) {
  const text = cleanText(value)

  if (!text) {
    return ''
  }

  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`)

    if (!['http:', 'https:'].includes(url.protocol)) {
      return ''
    }

    return url.toString()
  } catch {
    return ''
  }
}

function extractEmailsFromHtml(html) {
  const emails = html.match(EMAIL_PATTERN) ?? []
  const mailtoEmails = [...html.matchAll(/mailto:([^"'>?\s]+)/gi)]
    .map((match) => decodeURIComponent(match[1] || ''))

  return normalizeEmails([...emails, ...mailtoEmails])
}

function buildNoResult(provider, configured = true, details = null) {
  return {
    configured,
    provider,
    email: null,
    phone: null,
    source: provider,
    confidence: null,
    strategy: provider,
    raw: details,
  }
}

function buildResult({
  provider,
  email = null,
  phone = null,
  source = provider,
  confidence = null,
  strategy = provider,
  raw = null,
}) {
  return {
    configured: true,
    provider,
    email,
    phone,
    source,
    confidence,
    strategy,
    raw,
  }
}

async function fetchTextWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
        'User-Agent': 'SolarLeadCRM/1.0 contact-discovery',
      },
    })

    if (!response.ok) {
      return ''
    }

    const contentType = response.headers.get('content-type') ?? ''

    if (!/text|html|xml/i.test(contentType)) {
      return ''
    }

    return response.text()
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

async function findGooglePlaceForLead(lead) {
  const apiKey = getPlacesApiKey()

  if (!apiKey) {
    return buildNoResult('google_places', false)
  }

  const textQuery = [
    getCompanyName(lead),
    cleanText(lead.address),
    [cleanText(lead.city), cleanText(lead.state)].filter(Boolean).join(', '),
  ].filter(Boolean).join(' ')

  if (!textQuery) {
    return buildNoResult('google_places', true, {
      reason: 'Business name or address is required for Google Places lookup.',
    })
  }

  const response = await fetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      pageSize: 1,
      regionCode: 'US',
    }),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Google Places contact lookup failed.')
    error.status = response.status === 400 ? 400 : 502
    error.code = payload?.error?.status || 'PLACES_CONTACT_LOOKUP_FAILED'
    error.details = payload
    throw error
  }

  const place = payload?.places?.[0] ?? null

  return buildResult({
    provider: 'google_places',
    phone: cleanText(place?.nationalPhoneNumber) || null,
    strategy: 'business_place_lookup',
    raw: {
      placeId: place?.id,
      displayName: place?.displayName?.text,
      formattedAddress: place?.formattedAddress,
      websiteUri: place?.websiteUri,
      types: place?.types ?? [],
    },
  })
}

async function findEmailOnWebsite(websiteUrl) {
  const normalizedWebsite = normalizeWebsiteUrl(websiteUrl)

  if (!normalizedWebsite) {
    return buildNoResult('public_website', true, {
      reason: 'No website URL available.',
    })
  }

  const origin = new URL(normalizedWebsite).origin
  const candidateUrls = [
    normalizedWebsite,
    `${origin}/contact`,
    `${origin}/contact-us`,
    `${origin}/about`,
    `${origin}/about-us`,
  ]
  const visited = []

  for (const url of [...new Set(candidateUrls)]) {
    const html = await fetchTextWithTimeout(url)
    visited.push(url)

    if (!html) {
      continue
    }

    const emails = extractEmailsFromHtml(html)

    if (emails.length) {
      return buildResult({
        provider: 'public_website',
        email: emails[0],
        source: 'public_website',
        confidence: 80,
        strategy: 'business_website_scrape',
        raw: {
          websiteUrl: normalizedWebsite,
          matchedUrl: url,
          emailCount: emails.length,
          visited,
        },
      })
    }
  }

  return buildNoResult('public_website', true, {
    websiteUrl: normalizedWebsite,
    visited,
  })
}

async function enrichWithHunterDomain({ lead, domain }) {
  const apiKey = getHunterApiKey()

  if (!apiKey) {
    return buildNoResult('hunter', false)
  }

  const query = new URLSearchParams({
    api_key: apiKey,
    limit: '10',
  })
  const cleanDomain = cleanText(domain)
  const companyName = getCompanyName(lead)

  if (cleanDomain) {
    query.set('domain', cleanDomain)
  } else if (companyName) {
    query.set('company', companyName)
  } else {
    return buildNoResult('hunter', true, {
      reason: 'Domain or company name is required for Hunter domain search.',
    })
  }

  const response = await fetch(`${HUNTER_DOMAIN_SEARCH_URL}?${query.toString()}`)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.errors?.[0]?.details || payload?.error || 'Hunter domain search failed.')
    error.status = response.status
    error.code = 'HUNTER_DOMAIN_SEARCH_FAILED'
    error.details = payload
    throw error
  }

  const rawEmails = payload?.data?.emails ?? []
  const emails = normalizeEmails(rawEmails.map((entry) => entry.value))
  const bestEntry = rawEmails.find((entry) => emails.includes(cleanText(entry.value).toLowerCase()))

  return buildResult({
    provider: 'hunter',
    email: emails[0] ?? null,
    source: 'hunter_domain_search',
    confidence: bestEntry?.confidence ?? null,
    strategy: 'business_domain_enrichment',
    raw: {
      domain: payload?.data?.domain || cleanDomain,
      organization: payload?.data?.organization,
      emailCount: emails.length,
      pattern: payload?.data?.pattern,
    },
  })
}

async function enrichWithPeopleDataLabs(lead) {
  const apiKey = process.env.PDL_API_KEY

  if (!apiKey) {
    return buildNoResult('people_data_labs', false)
  }

  const fullName = getFullName(lead)
  const locality = cleanText(lead.city)
  const region = cleanText(lead.state)
  const postalCode = cleanText(lead.zip)

  if (!fullName || (!locality && !region && !postalCode)) {
    return buildNoResult('people_data_labs', true, {
      reason: 'Person enrichment needs owner name plus city, state, or ZIP.',
    })
  }

  const query = new URLSearchParams({
    name: fullName,
    min_likelihood: '6',
    data_include: 'full_name,emails,phone_numbers,location_names,linkedin_url',
  })

  if (locality) query.set('locality', locality)
  if (region) query.set('region', region)
  if (postalCode) query.set('postal_code', postalCode)

  const response = await fetch(`${PDL_ENRICH_URL}?${query.toString()}`, {
    headers: {
      'X-Api-Key': apiKey,
      Accept: 'application/json',
    },
  })

  if (response.status === 404) {
    return buildNoResult('people_data_labs', true, { status: 404 })
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || 'People Data Labs enrichment failed.')
    error.status = response.status
    error.code = 'PDL_ENRICHMENT_FAILED'
    error.details = payload
    throw error
  }

  const emails = normalizeEmailEntries(payload?.data?.emails)
  const phones = normalizePhoneEntries(payload?.data?.phone_numbers)

  return buildResult({
    provider: 'people_data_labs',
    email: normalizeEmails(emails)[0] ?? null,
    phone: phones[0] ?? null,
    source: 'people_data_labs',
    confidence: payload?.likelihood ?? null,
    strategy: 'parcel_owner_person_enrichment',
    raw: {
      status: payload?.status,
      likelihood: payload?.likelihood,
      matchedName: payload?.data?.full_name,
      linkedinUrl: payload?.data?.linkedin_url,
      emailCount: emails.length,
      phoneCount: phones.length,
    },
  })
}

async function enrichWithCustomWebhook(lead) {
  const apiUrl = cleanText(process.env.ENRICHMENT_API_URL)
  const apiKey = cleanText(process.env.ENRICHMENT_API_KEY)

  if (!apiUrl) {
    return buildNoResult('custom_webhook', false)
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ lead }),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.error || 'Custom enrichment webhook failed.')
    error.status = response.status
    error.code = 'CUSTOM_ENRICHMENT_FAILED'
    error.details = payload
    throw error
  }

  return buildResult({
    provider: payload?.provider || 'custom_webhook',
    email: cleanText(payload?.email) || null,
    phone: cleanText(payload?.phone) || null,
    source: payload?.source || payload?.provider || 'custom_webhook',
    confidence: payload?.confidence ?? null,
    strategy: payload?.strategy || 'custom_webhook',
    raw: payload,
  })
}

async function enrichBusinessContact(lead) {
  const attempts = []
  const placeResult = await findGooglePlaceForLead(lead)
  attempts.push(placeResult)

  const websiteUrl = placeResult.raw?.websiteUri
  const domain = getDomainFromUrl(websiteUrl)

  if (websiteUrl) {
    const websiteResult = await findEmailOnWebsite(websiteUrl)
    attempts.push(websiteResult)

    if (websiteResult.email) {
      return {
        ...websiteResult,
        phone: placeResult.phone ?? websiteResult.phone,
        raw: {
          ...websiteResult.raw,
          attempts,
          googlePlace: placeResult.raw,
        },
      }
    }
  }

  const hunterResult = await enrichWithHunterDomain({ lead, domain })
  attempts.push(hunterResult)

  if (hunterResult.email) {
    return {
      ...hunterResult,
      phone: placeResult.phone ?? hunterResult.phone,
      raw: {
        ...hunterResult.raw,
        attempts,
        googlePlace: placeResult.raw,
      },
    }
  }

  if (placeResult.phone) {
    return {
      ...placeResult,
      raw: {
        ...placeResult.raw,
        attempts,
      },
    }
  }

  return buildNoResult('business_contact_discovery', attempts.some((attempt) => attempt.configured), {
    attempts,
  })
}

function mergeFallbackContact(primary, fallback) {
  if (primary.email || primary.phone) {
    return {
      ...primary,
      email: primary.email ?? fallback.email,
      phone: primary.phone ?? fallback.phone,
      raw: {
        ...primary.raw,
        fallback: fallback.raw,
      },
    }
  }

  return fallback.email || fallback.phone ? fallback : primary
}

export async function enrichContact(lead) {
  const preferredProvider = cleanText(process.env.ENRICHMENT_PROVIDER).toLowerCase()

  if (preferredProvider === 'custom') {
    return enrichWithCustomWebhook(lead)
  }

  if (preferredProvider === 'people_data_labs') {
    return enrichWithPeopleDataLabs(lead)
  }

  if (preferredProvider === 'hunter') {
    return enrichWithHunterDomain({ lead, domain: cleanText(lead.domain) })
  }

  if (isBusinessLead(lead)) {
    const businessResult = await enrichBusinessContact(lead)

    if (businessResult.email || businessResult.phone) {
      return businessResult
    }

    const pdlResult = await enrichWithPeopleDataLabs(lead)
    return mergeFallbackContact(businessResult, pdlResult)
  }

  const pdlResult = await enrichWithPeopleDataLabs(lead)

  if (pdlResult.email || pdlResult.phone) {
    return pdlResult
  }

  const businessResult = await enrichBusinessContact(lead)

  if (businessResult.email || businessResult.phone) {
    return businessResult
  }

  const customResult = await enrichWithCustomWebhook(lead)

  if (customResult.configured) {
    return customResult
  }

  return pdlResult.configured || businessResult.configured
    ? buildNoResult('contact_discovery', true, {
      attempts: [pdlResult, businessResult],
    })
    : buildNoResult('none', false)
}
