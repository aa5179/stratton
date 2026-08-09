function formatAddress(payload) {
  const addressParts = [
    payload?.postalCode,
    payload?.administrativeArea,
    payload?.regionCode,
  ].filter(Boolean)

  if (addressParts.length > 0) {
    return addressParts.join(', ')
  }

  return 'Address unavailable'
}

function getAnnualEnergy(payload) {
  const configs = Array.isArray(payload?.solarPanelConfigs) ? payload.solarPanelConfigs : []
  const bestConfig = configs.reduce((best, config) => {
    if (!best) {
      return config
    }

    return (config?.yearlyEnergyDcKwh ?? 0) > (best?.yearlyEnergyDcKwh ?? 0)
      ? config
      : best
  }, null)

  return bestConfig?.yearlyEnergyDcKwh ?? null
}

function getMonthlyEnergy(payload) {
  const financialAnalyses = Array.isArray(payload?.solarPotential?.financialAnalyses)
    ? payload.solarPotential.financialAnalyses
    : []
  const defaultAnalysis = financialAnalyses.find((analysis) => analysis?.defaultBill)
    ?? financialAnalyses[0]

  return defaultAnalysis?.averageKwhPerMonth ?? null
}

function getLargestRoofSegment(payload) {
  const roofSegments = Array.isArray(payload?.solarPotential?.roofSegmentStats)
    ? payload.solarPotential.roofSegmentStats
    : []

  if (!roofSegments.length) {
    return null
  }

  return roofSegments.reduce((largest, segment, index) => {
    const currentArea = segment?.stats?.areaMeters2 ?? 0
    const largestArea = largest?.stats?.areaMeters2 ?? 0

    if (currentArea > largestArea) {
      return { ...segment, segmentIndex: index }
    }

    return largest
  }, null)
}

function getFinancialAnalysis(payload) {
  const analyses = Array.isArray(payload?.solarPotential?.financialAnalyses)
    ? payload.solarPotential.financialAnalyses
    : []

  return analyses.find((analysis) => analysis?.defaultBill) ?? analyses[0] ?? null
}

function getPanelCount(payload) {
  const panels = Array.isArray(payload?.solarPotential?.solarPanels)
    ? payload.solarPotential.solarPanels
    : []

  return panels.length || null
}

function getMedianFromQuantiles(quantiles) {
  if (!Array.isArray(quantiles) || quantiles.length === 0) {
    return null
  }

  const middle = Math.floor(quantiles.length / 2)
  return quantiles[middle] ?? null
}

function getTreesEquivalent(co2Kg) {
  if (typeof co2Kg !== 'number') {
    return null
  }

  return co2Kg / 21
}

function mapMoney(money) {
  if (!money) {
    return null
  }

  const units = Number(money.units ?? 0)
  const nanos = Number(money.nanos ?? 0) / 1_000_000_000
  return units + nanos
}

function getRevenueValues(payload) {
  const financialAnalysis = getFinancialAnalysis(payload)
  const solarPotential = payload?.solarPotential ?? {}
  const annualEnergy = financialAnalysis?.financialDetails?.initialAcKwhPerYear
    ?? getAnnualEnergy(payload)

  if (typeof annualEnergy !== 'number') {
    return { annualRevenue: null, periods: {} }
  }

  const rate = 8
  const annualRevenue = annualEnergy * rate
  const upfrontCost = mapMoney(
    financialAnalysis?.cashPurchaseSavings?.upfrontCost
      ?? financialAnalysis?.cashPurchaseSavings?.outOfPocketCost,
  )

  const periods = {
    tenYear: annualRevenue * 10,
    twentyYear: annualRevenue * 20,
    twentyFiveYear: annualRevenue * 25,
  }

  return {
    annualRevenue,
    periods,
    upfrontCost,
    lifetimeYears: solarPotential.panelLifetimeYears ?? null,
  }
}

function getSolarPotentialScore(payload) {
  const financialAnalysis = getFinancialAnalysis(payload)
  const scoreFromFinancials = financialAnalysis?.financialDetails?.solarPercentage

  if (typeof scoreFromFinancials === 'number') {
    return scoreFromFinancials
  }

  const maxSunshine = payload?.solarPotential?.maxSunshineHoursPerYear
  if (typeof maxSunshine === 'number') {
    return Math.max(0, Math.min(100, Math.round((maxSunshine / 2000) * 100)))
  }

  return null
}

function getPanelDimensions(solarPotential) {
  const widthMeters = solarPotential?.panelWidthMeters
  const heightMeters = solarPotential?.panelHeightMeters

  return {
    widthMeters: typeof widthMeters === 'number' ? widthMeters : 1,
    heightMeters: typeof heightMeters === 'number' ? heightMeters : 1.7,
  }
}

export function formatSolarInsights(payload) {
  const solarPotential = payload?.solarPotential ?? {}
  const wholeRoofStats = solarPotential.wholeRoofStats ?? {}
  const buildingStats = solarPotential.buildingStats ?? {}
  const financialAnalysis = getFinancialAnalysis(payload)
  const roofSegments = Array.isArray(solarPotential.roofSegmentStats)
    ? solarPotential.roofSegmentStats.map((segment, index) => ({
        segmentIndex: index,
        pitchDegrees: segment?.pitchDegrees ?? null,
        azimuthDegrees: segment?.azimuthDegrees ?? null,
        planeHeightAtCenterMeters: segment?.planeHeightAtCenterMeters ?? null,
        center: segment?.center ?? null,
        boundingBox: segment?.boundingBox ?? null,
        stats: {
          areaMeters2: segment?.stats?.areaMeters2 ?? null,
          groundAreaMeters2: segment?.stats?.groundAreaMeters2 ?? null,
          sunshineQuantiles: segment?.stats?.sunshineQuantiles ?? [],
        },
      }))
    : []
  const solarPanels = Array.isArray(solarPotential.solarPanels)
    ? solarPotential.solarPanels
    : []
  const solarPanelConfigs = Array.isArray(solarPotential.solarPanelConfigs)
    ? solarPotential.solarPanelConfigs
    : []
  const panelDimensions = getPanelDimensions(solarPotential)
  const detectedArrays = payload?.detectedArrays ?? null
  const largestRoofSegment = getLargestRoofSegment(payload)
  const revenue = getRevenueValues(payload)

  return {
    buildingName: payload?.name ?? null,
    address: formatAddress(payload),
    center: payload?.center ?? null,
    boundingBox: payload?.boundingBox ?? null,
    imageryDate: payload?.imageryDate ?? null,
    imageryProcessedDate: payload?.imageryProcessedDate ?? null,
    imageryQuality: payload?.imageryQuality ?? null,
    regionCode: payload?.regionCode ?? null,
    detectedArrays,
    roofArea: wholeRoofStats.areaMeters2 ?? null,
    buildingArea: buildingStats.areaMeters2 ?? null,
    buildingGroundArea: buildingStats.groundAreaMeters2 ?? null,
    roofGroundArea: wholeRoofStats.groundAreaMeters2 ?? null,
    maxPanels: solarPotential.maxArrayPanelsCount ?? null,
    annualEnergy: financialAnalysis?.financialDetails?.initialAcKwhPerYear
      ?? getAnnualEnergy(payload),
    monthlyEnergy: getMonthlyEnergy(payload),
    panelCount: getPanelCount(payload),
    solarPotential: {
      maxArrayAreaMeters2: solarPotential.maxArrayAreaMeters2 ?? null,
      maxSunshineHoursPerYear: solarPotential.maxSunshineHoursPerYear ?? null,
      panelCapacityWatts: solarPotential.panelCapacityWatts ?? null,
      panelWidthMeters: panelDimensions.widthMeters,
      panelHeightMeters: panelDimensions.heightMeters,
      panelLifetimeYears: solarPotential.panelLifetimeYears ?? null,
      solarFlux: getMedianFromQuantiles(buildingStats.sunshineQuantiles),
      solarPotentialScore: getSolarPotentialScore(payload),
      buildingStats: {
        areaMeters2: buildingStats.areaMeters2 ?? null,
        groundAreaMeters2: buildingStats.groundAreaMeters2 ?? null,
        sunshineQuantiles: buildingStats.sunshineQuantiles ?? [],
      },
    },
    roofAnalysis: {
      roofSegments,
      largestRoofSegment,
      roofOrientation: largestRoofSegment?.azimuthDegrees ?? null,
      roofPitch: largestRoofSegment?.pitchDegrees ?? null,
    },
    solarPanels,
    solarPanelConfigs,
    financialAnalysis,
    revenue,
    carbonOffset: solarPotential.carbonOffsetFactorKgPerMwh ?? null,
    environmentalImpact: {
      carbonOffsetKgPerMwh: solarPotential.carbonOffsetFactorKgPerMwh ?? null,
      treesEquivalent: getTreesEquivalent(solarPotential.carbonOffsetFactorKgPerMwh),
      co2ReductionKgPerMwh: solarPotential.carbonOffsetFactorKgPerMwh ?? null,
    },
  }
}
