const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
})

const oneDecimalFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1,
})

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const rateFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export function formatNumber(value, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }

  if (digits > 0) {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
  }

  return numberFormatter.format(value)
}

export function formatArea(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }

  return `${oneDecimalFormatter.format(value)} m2`
}

export function formatCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return '-'
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export function formatPercentage(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }

  return `${oneDecimalFormatter.format(value)}%`
}

export function formatCurrency(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }

  return currencyFormatter.format(value)
}

export function formatEnergyRate(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }

  return rateFormatter.format(value)
}

export function formatDegrees(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }

  return `${oneDecimalFormatter.format(value)} deg`
}

export function formatDirection(degrees) {
  if (typeof degrees !== 'number' || Number.isNaN(degrees)) {
    return '-'
  }

  const normalized = ((degrees % 360) + 360) % 360

  if (normalized >= 337.5 || normalized < 22.5) return 'North'
  if (normalized < 67.5) return 'North-East'
  if (normalized < 112.5) return 'East'
  if (normalized < 157.5) return 'South-East'
  if (normalized < 202.5) return 'South'
  if (normalized < 247.5) return 'South-West'
  if (normalized < 292.5) return 'West'
  return 'North-West'
}

export function getMoneyValue(money) {
  if (!money) {
    return null
  }

  const units = Number(money.units ?? 0)
  const nanos = Number(money.nanos ?? 0) / 1_000_000_000
  return units + nanos
}

export function calcRevenue(annualEnergyKwh, ratePerKwh) {
  if (typeof annualEnergyKwh !== 'number' || typeof ratePerKwh !== 'number') {
    return null
  }

  return annualEnergyKwh * ratePerKwh
}

export function calcPeriodRevenue(annualRevenue, years) {
  if (typeof annualRevenue !== 'number') {
    return null
  }

  return annualRevenue * years
}

export function calcRoi(revenue, cost) {
  if (typeof revenue !== 'number' || typeof cost !== 'number' || cost <= 0) {
    return null
  }

  return ((revenue - cost) / cost) * 100
}

export function calcTreesEquivalent(co2ReductionKg) {
  if (typeof co2ReductionKg !== 'number') {
    return null
  }

  return co2ReductionKg / 21
}

export function getMedianFromQuantiles(quantiles) {
  if (!Array.isArray(quantiles) || quantiles.length === 0) {
    return null
  }

  const middleIndex = Math.floor(quantiles.length / 2)
  return quantiles[middleIndex] ?? null
}
