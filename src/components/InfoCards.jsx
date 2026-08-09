const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
})

const decimalFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1,
})

const cardBase =
  'rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_16px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl'

function formatArea(value) {
  if (typeof value !== 'number') {
    return '—'
  }

  return `${decimalFormatter.format(value)} m²`
}

function formatEnergy(value) {
  if (typeof value !== 'number') {
    return '—'
  }

  return `${decimalFormatter.format(value)} kWh/yr`
}

function formatCarbonOffset(value) {
  if (typeof value !== 'number') {
    return '—'
  }

  return `${decimalFormatter.format(value)} kg CO₂ / MWh`
}

function MetricCard({ label, value, tone = 'emerald' }) {
  const toneClasses = {
    emerald: 'from-emerald-500/12 to-emerald-400/5 text-emerald-700',
    sky: 'from-sky-500/12 to-sky-400/5 text-sky-700',
    blue: 'from-blue-500/12 to-blue-400/5 text-blue-700',
    slate: 'from-slate-500/12 to-slate-400/5 text-slate-700',
  }

  return (
    <div className={`${cardBase} bg-gradient-to-br ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
        {label}
      </p>
      <div className="mt-3 text-lg font-semibold text-slate-950">{value}</div>
    </div>
  )
}

function InfoCards({ location, solarData, loading, error }) {
  if (!location) {
    return (
      <div className="space-y-4">
        <div className={cardBase}>
          <p className="text-sm font-semibold text-slate-950">No location selected</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Search for an address or click a rooftop on the map to populate the
            solar intelligence cards.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard label="Roof area" value="—" tone="emerald" />
          <MetricCard label="Max panels" value="—" tone="sky" />
          <MetricCard label="Annual energy" value="—" tone="blue" />
          <MetricCard label="Carbon offset" value="—" tone="slate" />
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className={cardBase}>
          <p className="text-sm font-semibold text-slate-950">Loading insights</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Querying the Solar Building Insights API for the selected coordinates.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard label="Roof area" value="Analyzing..." tone="emerald" />
          <MetricCard label="Max panels" value="Analyzing..." tone="sky" />
          <MetricCard label="Annual energy" value="Analyzing..." tone="blue" />
          <MetricCard label="Carbon offset" value="Analyzing..." tone="slate" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-800 shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold">Solar lookup failed</p>
          <p className="mt-2 text-sm leading-6">{error}</p>
        </div>
      </div>
    )
  }

  const solarPotential = solarData?.solarPotential ?? {}

  return (
    <div className="space-y-4">
      <div className={cardBase}>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">
          Selected address
        </p>
        <p className="mt-3 text-lg font-semibold text-slate-950">
          {location.address}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="Roof area" value={formatArea(solarData?.roofArea)} tone="emerald" />
        <MetricCard
          label="Max panels"
          value={
            typeof solarData?.maxPanels === 'number'
              ? numberFormatter.format(solarData.maxPanels)
              : '—'
          }
          tone="sky"
        />
        <MetricCard label="Annual energy" value={formatEnergy(solarData?.annualEnergy)} tone="blue" />
        <MetricCard
          label="Carbon offset"
          value={formatCarbonOffset(solarData?.carbonOffset)}
          tone="slate"
        />
      </div>

      <div className={cardBase}>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
          Solar potential
        </p>
        <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
              Max array area
            </div>
            <div className="mt-1 font-semibold text-slate-950">
              {formatArea(solarPotential.maxArrayAreaMeters2)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
              Max sunshine
            </div>
            <div className="mt-1 font-semibold text-slate-950">
              {typeof solarPotential.maxSunshineHoursPerYear === 'number'
                ? `${numberFormatter.format(solarPotential.maxSunshineHoursPerYear)} hours/yr`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
              Panel capacity
            </div>
            <div className="mt-1 font-semibold text-slate-950">
              {typeof solarPotential.panelCapacityWatts === 'number'
                ? `${numberFormatter.format(solarPotential.panelCapacityWatts)} W`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
              Panel life
            </div>
            <div className="mt-1 font-semibold text-slate-950">
              {typeof solarPotential.panelLifetimeYears === 'number'
                ? `${numberFormatter.format(solarPotential.panelLifetimeYears)} years`
                : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InfoCards
