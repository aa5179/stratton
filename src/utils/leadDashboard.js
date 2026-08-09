const US_STATE_RATES = {
  CA: 0.32,
  NY: 0.24,
  NJ: 0.22,
  MA: 0.27,
  CT: 0.25,
  RI: 0.24,
  NH: 0.22,
  VT: 0.2,
  ME: 0.21,
  PA: 0.18,
  IL: 0.17,
  OH: 0.16,
  MI: 0.17,
  CO: 0.15,
  AZ: 0.16,
  NV: 0.17,
  TX: 0.14,
  FL: 0.15,
  GA: 0.15,
  NC: 0.15,
  WA: 0.11,
  OR: 0.12,
  default: 0.16,
}

const PRIORITY_ORDER = {
  Hot: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

const EARTH_RADIUS_MILES = 3958.8

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getStateRate(state) {
  if (!state) {
    return US_STATE_RATES.default
  }

  return US_STATE_RATES[state.toUpperCase()] ?? US_STATE_RATES.default
}

function classifyPriority(score) {
  if (score >= 80) return 'Hot'
  if (score >= 65) return 'High'
  if (score >= 50) return 'Medium'
  return 'Low'
}

function getLeadRecommendation(lead) {
  if (lead.priority === 'Hot') {
    return 'Real Google Solar data shows strong roof capacity, high annual output, and attractive lifetime value.'
  }

  if (lead.priority === 'High') {
    return 'Real Google Solar data looks promising. Confirm utility bill, roof age, and installation constraints before outreach.'
  }

  if (lead.priority === 'Medium') {
    return 'Real Google Solar data is usable, but the economics benefit from a second-pass qualification.'
  }

  return 'Real Google Solar data is available, but this building is not a top-fit target yet.'
}

export function getElectricityRateForState(state) {
  return getStateRate(state)
}

export function getDistanceMiles(from, to) {
  if (!from || !to) {
    return null
  }

  const fromLat = Number(from.lat)
  const fromLng = Number(from.lng)
  const toLat = Number(to.lat)
  const toLng = Number(to.lng)

  if ([fromLat, fromLng, toLat, toLng].some((value) => Number.isNaN(value))) {
    return null
  }

  const toRadians = (value) => (value * Math.PI) / 180
  const latDistance = toRadians(toLat - fromLat)
  const lngDistance = toRadians(toLng - fromLng)
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(lngDistance / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_MILES * c
}

export function isLeadInsideRadius(lead, center, radiusMiles) {
  const distance = getDistanceMiles(center, lead)

  if (distance === null) {
    return false
  }

  return distance <= radiusMiles
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

function getLeadAddress({ selectedLocation, solarData, fallback }) {
  if (solarData?.placeName && solarData?.placeAddress) {
    return `${solarData.placeName} - ${solarData.placeAddress}`
  }

  if (solarData?.placeAddress) {
    return solarData.placeAddress
  }

  if (solarData?.address && solarData.address !== 'Address unavailable') {
    return solarData.address
  }

  if (selectedLocation?.address) {
    return selectedLocation.address
  }

  return fallback
}

function getPropertyFitScore(propertyType) {
  const normalized = String(propertyType || '').toLowerCase()

  if (/\b(warehouse|industrial|manufacturing|factory|school|retail|shopping|office|commercial)\b/.test(normalized)) {
    return 15
  }

  if (/\b(apartment|multifamily|condo|mixed)\b/.test(normalized)) {
    return 11
  }

  if (/\b(residential|single family|home)\b/.test(normalized)) {
    return 7
  }

  return 9
}

function getContactabilityScore({ email, phone }) {
  if (email) return 10
  if (phone) return 6
  return 2
}

function getOutreachReadinessScore({ status, emailEvents = [] }) {
  if (status === 'do_not_contact' || emailEvents.some((event) => ['bounced', 'unsubscribed'].includes(event.status))) {
    return 0
  }

  if (['interested', 'follow_up', 'contacted'].includes(status)) {
    return 10
  }

  if (status === 'email_found') {
    return 8
  }

  if (status === 'email_sent') {
    return 6
  }

  return 5
}

function buildRealLeadScore({
  solarScore,
  roofArea,
  panels,
  annualEnergy,
  annualRevenue,
  roi,
  propertyType,
  email,
  phone,
  status,
  emailEvents,
}) {
  const solarCapacityScore = clamp(((panels / 180) * 17) + ((roofArea / 900) * 8), 0, 25)
  const energyOutputScore = clamp(((annualEnergy / 65000) * 14) + (((annualEnergy / Math.max(1, panels)) / 520) * 6), 0, 20)
  const savingsScore = clamp(((annualRevenue / 22000) * 14) + (((roi ?? 0) / 250) * 6), 0, 20)
  const propertyFitScore = getPropertyFitScore(propertyType)
  const contactabilityScore = getContactabilityScore({ email, phone })
  const outreachReadinessScore = getOutreachReadinessScore({ status, emailEvents })
  const solarQualityAdjustment = clamp((solarScore - 70) / 10, -4, 4)

  return clamp(Math.round(
    solarCapacityScore
    + energyOutputScore
    + savingsScore
    + propertyFitScore
    + contactabilityScore
    + outreachReadinessScore
    + solarQualityAdjustment,
  ), 0, 100)
}

export function getPanelConfigForCount(solarData, panelCount) {
  const maxPanels = solarData?.maxPanels ?? solarData?.panelCount ?? 0
  const annualEnergy = solarData?.annualEnergy ?? 0
  const requestedCount = clamp(Math.round(panelCount ?? maxPanels), 0, maxPanels)
  const configs = Array.isArray(solarData?.solarPanelConfigs)
    ? [...solarData.solarPanelConfigs]
      .filter((config) => typeof config?.panelsCount === 'number')
      .sort((left, right) => left.panelsCount - right.panelsCount)
    : []

  if (requestedCount === 0) {
    return {
      panelsCount: 0,
      yearlyEnergyDcKwh: 0,
      source: 'zero-panels',
    }
  }

  const exactConfig = configs.find((config) => config.panelsCount === requestedCount)

  if (exactConfig) {
    return {
      ...exactConfig,
      source: 'google-config',
    }
  }

  const lowerConfig = [...configs].reverse().find((config) => config.panelsCount < requestedCount)
  const upperConfig = configs.find((config) => config.panelsCount > requestedCount)

  if (
    lowerConfig
    && upperConfig
    && typeof lowerConfig.yearlyEnergyDcKwh === 'number'
    && typeof upperConfig.yearlyEnergyDcKwh === 'number'
  ) {
    const span = upperConfig.panelsCount - lowerConfig.panelsCount
    const progress = span > 0 ? (requestedCount - lowerConfig.panelsCount) / span : 0

    return {
      panelsCount: requestedCount,
      yearlyEnergyDcKwh: lowerConfig.yearlyEnergyDcKwh
        + ((upperConfig.yearlyEnergyDcKwh - lowerConfig.yearlyEnergyDcKwh) * progress),
      source: 'interpolated-google-config',
    }
  }

  const nearestConfig = configs.reduce((nearest, config) => {
    if (!nearest) {
      return config
    }

    return Math.abs(config.panelsCount - requestedCount) < Math.abs(nearest.panelsCount - requestedCount)
      ? config
      : nearest
  }, null)

  if (nearestConfig && typeof nearestConfig.yearlyEnergyDcKwh === 'number') {
    const energyPerPanel = nearestConfig.yearlyEnergyDcKwh / nearestConfig.panelsCount

    return {
      panelsCount: requestedCount,
      yearlyEnergyDcKwh: energyPerPanel * requestedCount,
      source: 'scaled-google-config',
    }
  }

  return {
    panelsCount: requestedCount,
    yearlyEnergyDcKwh: maxPanels > 0 ? (annualEnergy / maxPanels) * requestedCount : 0,
    source: 'scaled-building-energy',
  }
}

export function buildLeadFromSolarData({
  selectedLocation,
  solarData,
  selectedPanelCount,
  id = 'selected-building',
  addressFallback = 'Selected building',
  isPrimary = false,
}) {
  if (!selectedLocation || !solarData) {
    return null
  }

  const stateRate = getStateRate(selectedLocation.state)
  const solarScore = solarData.solarPotential?.solarPotentialScore ?? 68
  const maxPanels = solarData.maxPanels ?? solarData.panelCount ?? 0
  const panelConfig = getPanelConfigForCount(solarData, selectedPanelCount ?? maxPanels)
  const selectedPanels = panelConfig.panelsCount ?? 0
  const annualEnergy = panelConfig.yearlyEnergyDcKwh ?? 0
  const roofArea = solarData.roofArea ?? solarData.buildingArea ?? 0
  const roofSegmentCount = solarData.roofAnalysis?.roofSegments?.length ?? 0
  const buildingCenter = getLatLng(solarData.center) ?? {
    lat: selectedLocation.lat,
    lng: selectedLocation.lng,
  }
  const annualRevenue = annualEnergy * stateRate
  const estimatedInstallCost = selectedPanels > 0 ? selectedPanels * 2800 : null
  const roi = estimatedInstallCost
    ? (((annualRevenue * 25) - estimatedInstallCost) / estimatedInstallCost) * 100
    : null
  const leadScore = buildRealLeadScore({
    solarScore,
    roofArea,
    panels: selectedPanels,
    annualEnergy,
    annualRevenue,
    roi,
    propertyType: 'Building',
    email: '',
    phone: '',
    status: isPrimary ? 'scored' : 'new',
    emailEvents: [],
  })
  const priority = classifyPriority(leadScore)

  return {
    id,
    lat: buildingCenter.lat,
    lng: buildingCenter.lng,
    address: getLeadAddress({ selectedLocation, solarData, fallback: addressFallback }),
    city: selectedLocation.city || '',
    state: selectedLocation.state || '',
    zip: selectedLocation.zip || '',
    propertyType: 'Building',
    roofArea,
    roofSegments: roofSegmentCount,
    maxPanels: selectedPanels,
    availablePanels: maxPanels,
    panelConfigSource: panelConfig.source,
    annualEnergy,
    annualRevenue,
    estimatedAnnualSavings: annualRevenue,
    estimated25YearRevenue: annualRevenue * 25,
    estimatedInstallCost,
    roi,
    leadScore,
    priority,
    solarPotential: solarScore,
    carbonOffset: solarData.carbonOffset ?? 0,
    recommendation: getLeadRecommendation({ priority }),
    ownerName: '',
    businessName: '',
    phoneNumber: '',
    email: '',
    propertyValue: null,
    parcelId: '',
    leadStatus: isPrimary ? 'Google Solar API result' : 'Discovered in 1 km scan',
    isPrimary,
    distanceMiles: getDistanceMiles(selectedLocation, buildingCenter) ?? 0,
    center: buildingCenter,
    solarData,
  }
}

export function buildLeadListFromSolarData({ selectedLocation, solarBuildings }) {
  return solarBuildings
    .map((solarBuilding, index) => buildLeadFromSolarData({
      selectedLocation,
      solarData: solarBuilding,
      selectedPanelCount: solarBuilding?.maxPanels ?? solarBuilding?.panelCount ?? 0,
      id: solarBuilding?.buildingName || `solar-lead-${index + 1}`,
      addressFallback: `Solar building ${index + 1}`,
    }))
    .filter(Boolean)
    .sort((left, right) => right.leadScore - left.leadScore)
}

export function buildLeadPortfolio({ selectedLocation, solarData, selectedPanelCount }) {
  if (!selectedLocation || !solarData) {
    return {
      leads: [],
      activeLeadId: null,
      stateRate: getStateRate(selectedLocation?.state),
    }
  }

  const stateRate = getStateRate(selectedLocation.state)
  const lead = buildLeadFromSolarData({
    selectedLocation,
    solarData,
    selectedPanelCount,
    id: 'selected-building',
    addressFallback: 'Selected building',
    isPrimary: true,
  })

  return {
    leads: lead ? [lead] : [],
    activeLeadId: lead?.id ?? null,
    stateRate,
  }
}

export function buildDashboardMetrics(leads) {
  const count = leads.length
  const qualifiedLeads = leads.filter((lead) => lead.leadScore >= 65).length
  const hotLeads = leads.filter((lead) => lead.priority === 'Hot').length
  const totalRoofArea = leads.reduce((sum, lead) => sum + (lead.roofArea || 0), 0)
  const potentialPanels = leads.reduce((sum, lead) => sum + (lead.maxPanels || 0), 0)
  const annualEnergy = leads.reduce((sum, lead) => sum + (lead.annualEnergy || 0), 0)
  const annualRevenue = leads.reduce((sum, lead) => sum + (lead.annualRevenue || 0), 0)
  const averageRoi = leads.length
    ? leads.reduce((sum, lead) => sum + (lead.roi || 0), 0) / leads.length
    : 0

  return {
    propertiesScanned: count,
    qualifiedLeads,
    hotLeads,
    totalRoofArea,
    potentialPanels,
    annualEnergy,
    annualRevenue,
    averageRoi,
  }
}

export function buildChartSeries(leads) {
  const topLeads = [...leads].slice(0, 5)

  return {
    revenue: topLeads.map((lead) => ({ label: lead.address, value: lead.annualRevenue })),
    energy: topLeads.map((lead) => ({ label: lead.address, value: lead.annualEnergy })),
    roi: topLeads.map((lead) => ({ label: lead.address, value: lead.roi ?? 0 })),
    priority: ['Hot', 'High', 'Medium', 'Low'].map((priority) => ({
      label: priority,
      value: leads.filter((lead) => lead.priority === priority).length,
    })),
  }
}

export function sortLeads(leads, sortKey, sortDirection) {
  const sorted = [...leads].sort((left, right) => {
    const comparison = (() => {
      switch (sortKey) {
        case 'leadScore':
          return left.leadScore - right.leadScore
        case 'address':
          return left.address.localeCompare(right.address)
        case 'propertyType':
          return left.propertyType.localeCompare(right.propertyType)
        case 'roofArea':
          return (left.roofArea || 0) - (right.roofArea || 0)
        case 'panels':
          return (left.maxPanels || 0) - (right.maxPanels || 0)
        case 'annualEnergy':
          return (left.annualEnergy || 0) - (right.annualEnergy || 0)
        case 'annualRevenue':
          return (left.annualRevenue || 0) - (right.annualRevenue || 0)
        case 'roi':
          return (left.roi || 0) - (right.roi || 0)
        case 'priority':
          return PRIORITY_ORDER[right.priority] - PRIORITY_ORDER[left.priority]
        default:
          return left.leadScore - right.leadScore
      }
    })()

    return sortDirection === 'asc' ? comparison : comparison * -1
  })

  return sorted
}
