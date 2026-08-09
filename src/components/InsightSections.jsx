import {
  calcPeriodRevenue,
  calcRevenue,
  calcRoi,
  calcTreesEquivalent,
  formatArea,
  formatCoordinates,
  formatCurrency,
  formatDegrees,
  formatDirection,
  formatEnergyRate,
  formatNumber,
  formatPercentage,
  getMoneyValue,
} from '../utils/solarInsights.js'

const sectionShell =
  'rounded-4xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-5'

const metricShell =
  'rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 shadow-sm'

function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
        {title}
      </h3>
      {description ? (
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
    </div>
  )
}

function Metric({ label, value, hint }) {
  return (
    <div className={metricShell}>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value ?? '—'}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

function LoadingGrid({ items = 4 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className={`${metricShell} animate-pulse`}>
          <div className="h-3 w-24 rounded-full bg-slate-200" />
          <div className="mt-4 h-6 w-2/3 rounded-full bg-slate-200" />
          <div className="mt-2 h-3 w-1/2 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ title, message }) {
  return (
    <div className={sectionShell}>
      <SectionHeader eyebrow="No data" title={title} description={message} />
    </div>
  )
}

export function PropertyInformationSection({ location, solarData, loading }) {
  if (loading) {
    return (
      <div className={sectionShell}>
        <SectionHeader
          eyebrow="Property information"
          title="Location details"
          description="Building and roof context derived from the selected point."
        />
        <LoadingGrid items={4} />
      </div>
    )
  }

  if (!solarData) {
    return (
      <EmptyState
        title="Property information"
        message="Select a place on the map or use search to populate the property metrics."
      />
    )
  }

  const center = solarData.center ?? {}

  return (
    <div className={sectionShell}>
      <SectionHeader
        eyebrow="Property information"
        title="Location details"
        description="Address, coordinates, and roof geometry context for the selected building."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Address" value={solarData.address ?? location?.address ?? '—'} />
        <Metric
          label="Latitude & longitude"
          value={formatCoordinates(center.latitude ?? location?.lat, center.longitude ?? location?.lng)}
        />
        <Metric label="Building area" value={formatArea(solarData.buildingArea)} />
        <Metric label="Roof area" value={formatArea(solarData.roofArea)} />
      </div>
    </div>
  )
}

export function RoofAnalysisSection({ solarData, loading }) {
  if (loading) {
    return (
      <div className={sectionShell}>
        <SectionHeader
          eyebrow="Roof analysis"
          title="Roof geometry"
          description="Inspect the usable roof segments and their orientation."
        />
        <LoadingGrid items={4} />
      </div>
    )
  }

  if (!solarData) {
    return (
      <EmptyState
        title="Roof analysis"
        message="Roof segment data will appear once a building is selected."
      />
    )
  }

  const roofAnalysis = solarData.roofAnalysis ?? {}
  const largestSegment = roofAnalysis.largestRoofSegment
  const roofSegments = roofAnalysis.roofSegments ?? []

  return (
    <div className={sectionShell}>
      <SectionHeader
        eyebrow="Roof analysis"
        title="Roof geometry"
        description="Understand the number of segments and the most usable roof plane."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Roof segments" value={formatNumber(roofSegments.length)} />
        <Metric
          label="Largest usable segment"
          value={largestSegment?.stats?.areaMeters2 ? formatArea(largestSegment.stats.areaMeters2) : '—'}
          hint={largestSegment ? `Segment ${largestSegment.segmentIndex + 1}` : undefined}
        />
        <Metric
          label="Roof orientation"
          value={formatDirection(roofAnalysis.roofOrientation)}
          hint={formatDegrees(roofAnalysis.roofOrientation)}
        />
        <Metric
          label="Roof pitch"
          value={formatDegrees(roofAnalysis.roofPitch)}
          hint={roofAnalysis.roofPitch !== null ? 'Degrees from the ground plane' : undefined}
        />
      </div>
    </div>
  )
}

export function SolarPotentialSection({ solarData, loading }) {
  if (loading) {
    return (
      <div className={sectionShell}>
        <SectionHeader
          eyebrow="Solar potential"
          title="Panel capacity"
          description="Potential output estimates based on Google Solar API data."
        />
        <LoadingGrid items={4} />
      </div>
    )
  }

  if (!solarData) {
    return (
      <EmptyState
        title="Solar potential"
        message="Potential metrics will populate after a building lookup completes."
      />
    )
  }

  const solarPotential = solarData.solarPotential ?? {}

  return (
    <div className={sectionShell}>
      <SectionHeader
        eyebrow="Solar potential"
        title="Panel capacity"
        description="Estimated maximum installable panels, sunshine, and solar flux."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Maximum installable panels" value={formatNumber(solarData.maxPanels)} />
        <Metric
          label="Solar potential score"
          value={formatPercentage(solarPotential.solarPotentialScore)}
          hint="Derived from the best available Solar API signal"
        />
        <Metric
          label="Sunshine hours"
          value={solarPotential.maxSunshineHoursPerYear != null ? `${formatNumber(solarPotential.maxSunshineHoursPerYear)} hrs/yr` : '—'}
        />
        <Metric
          label="Solar flux"
          value={solarPotential.solarFlux != null ? `${formatNumber(solarPotential.solarFlux, 1)} kWh/kW/yr` : '—'}
          hint="Median sunshine quantile"
        />
      </div>
    </div>
  )
}

export function EnergyAnalysisSection({ solarData, loading }) {
  if (loading) {
    return (
      <div className={sectionShell}>
        <SectionHeader
          eyebrow="Energy analysis"
          title="Generation profile"
          description="Annual and monthly generation estimates plus panel efficiency."
        />
        <LoadingGrid items={4} />
      </div>
    )
  }

  if (!solarData) {
    return (
      <EmptyState
        title="Energy analysis"
        message="Energy values will appear after Solar API data is fetched."
      />
    )
  }

  const panelCount = solarData.panelCount ?? solarData.maxPanels
  const annualEnergy = solarData.annualEnergy
  const monthlyEnergy = solarData.monthlyEnergy
  const energyPerPanel = typeof annualEnergy === 'number' && typeof panelCount === 'number' && panelCount > 0
    ? annualEnergy / panelCount
    : null

  return (
    <div className={sectionShell}>
      <SectionHeader
        eyebrow="Energy analysis"
        title="Generation profile"
        description="A practical view of output across the first year and per panel."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Annual generation"
          value={annualEnergy != null ? `${formatNumber(annualEnergy)} kWh` : '—'}
        />
        <Metric
          label="Monthly generation"
          value={monthlyEnergy != null ? `${formatNumber(monthlyEnergy)} kWh` : '—'}
          hint={monthlyEnergy != null ? 'Average monthly AC production' : 'Not available in API response'}
        />
        <Metric
          label="Energy per panel"
          value={energyPerPanel != null ? `${formatNumber(energyPerPanel, 1)} kWh` : '—'}
        />
        <Metric label="Total panel count" value={formatNumber(panelCount)} />
      </div>
    </div>
  )
}

export function RevenueCalculatorSection({ solarData, loading, electricityRate, onElectricityRateChange }) {
  if (loading) {
    return (
      <div className={sectionShell}>
        <SectionHeader
          eyebrow="Revenue calculator"
          title="Financial projection"
          description="Model solar revenue from the annual energy estimate."
        />
        <LoadingGrid items={4} />
      </div>
    )
  }

  if (!solarData) {
    return (
      <EmptyState
        title="Revenue calculator"
        message="A selected roof is required before financial projections can be calculated."
      />
    )
  }

  const annualRevenue = calcRevenue(solarData.annualEnergy, electricityRate)
  const tenYearRevenue = calcPeriodRevenue(annualRevenue, 10)
  const twentyYearRevenue = calcPeriodRevenue(annualRevenue, 20)
  const twentyFiveYearRevenue = calcPeriodRevenue(annualRevenue, 25)
  const upfrontCost = getMoneyValue(solarData.financialAnalysis?.cashPurchaseSavings?.upfrontCost)
    ?? getMoneyValue(solarData.financialAnalysis?.cashPurchaseSavings?.outOfPocketCost)
  const roi10 = calcRoi(tenYearRevenue, upfrontCost)
  const roi20 = calcRoi(twentyYearRevenue, upfrontCost)
  const roi25 = calcRoi(twentyFiveYearRevenue, upfrontCost)

  return (
    <div className={sectionShell}>
      <SectionHeader
        eyebrow="Revenue calculator"
        title="Financial projection"
        description="Uses the annual energy estimate with a configurable electricity rate."
      />

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Electricity rate
          </p>
          <p className="mt-1 text-sm text-slate-600">Default U.S. value for the calculator.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          $
          <input
            type="number"
            min="0"
            step="0.01"
            value={electricityRate}
            onChange={(event) => onElectricityRateChange(Number(event.target.value) || 0)}
            className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-right outline-none focus:ring-4 focus:ring-sky-500/10"
          />
          <span>/kWh</span>
        </label>
      </div>

      <div className="mb-4 text-sm text-slate-600">
        Current rate: {formatEnergyRate(electricityRate)} per kWh
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Annual revenue" value={formatCurrency(annualRevenue)} />
        <Metric
          label="10-year revenue"
          value={formatCurrency(tenYearRevenue)}
          hint={roi10 != null ? `ROI ${formatPercentage(roi10)}` : undefined}
        />
        <Metric
          label="20-year revenue"
          value={formatCurrency(twentyYearRevenue)}
          hint={roi20 != null ? `ROI ${formatPercentage(roi20)}` : undefined}
        />
        <Metric
          label="25-year revenue"
          value={formatCurrency(twentyFiveYearRevenue)}
          hint={roi25 != null ? `ROI ${formatPercentage(roi25)}` : undefined}
        />
      </div>

      {upfrontCost != null ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Estimated upfront cost available: {formatCurrency(upfrontCost)}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ROI is hidden because the Solar API response did not include cost data for this roof.
        </div>
      )}
    </div>
  )
}

export function EnvironmentalImpactSection({ solarData, loading }) {
  if (loading) {
    return (
      <div className={sectionShell}>
        <SectionHeader
          eyebrow="Environmental impact"
          title="Carbon savings"
          description="Estimate CO₂ reduction from the selected solar layout."
        />
        <LoadingGrid items={4} />
      </div>
    )
  }

  if (!solarData) {
    return (
      <EmptyState
        title="Environmental impact"
        message="Select a roof to estimate carbon savings and tree-equivalent impact."
      />
    )
  }

  const co2ReductionKg = typeof solarData.annualEnergy === 'number' && typeof solarData.carbonOffset === 'number'
    ? (solarData.annualEnergy / 1000) * solarData.carbonOffset
    : null
  const treesEquivalent = calcTreesEquivalent(co2ReductionKg)
  const carbonOffset = solarData.carbonOffset

  return (
    <div className={sectionShell}>
      <SectionHeader
        eyebrow="Environmental impact"
        title="Carbon savings"
        description="Uses the API carbon intensity factor to estimate avoided emissions."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Carbon offset"
          value={carbonOffset != null ? `${formatNumber(carbonOffset, 1)} kg CO₂ / MWh` : '—'}
        />
        <Metric
          label="CO₂ reduction"
          value={co2ReductionKg != null ? `${formatNumber(co2ReductionKg, 1)} kg CO₂ / yr` : '—'}
        />
        <Metric
          label="Equivalent trees planted"
          value={treesEquivalent != null ? formatNumber(treesEquivalent, 1) : '—'}
        />
        <Metric
          label="Impact summary"
          value={co2ReductionKg != null ? 'Cleaner than grid power' : 'Not enough data'}
        />
      </div>
    </div>
  )
}
