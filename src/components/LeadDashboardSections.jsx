import {
  formatArea,
  formatCurrency,
  formatNumber,
  formatPercentage,
} from '../utils/solarInsights.js'
import { useState } from 'react'

const cardShell =
  'stratton-card rounded-lg p-4'

const metricShell =
  'stratton-metric min-w-0 rounded-lg p-3.5'

function SectionHeading({ eyebrow, title, description }) {
  return (
    <div className="mb-3">
      <p className="text-[0.72rem] font-semibold uppercase text-cyan-700">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950">{title}</h2>
      {description ? <p className="mt-1.5 text-sm leading-6 text-slate-600">{description}</p> : null}
    </div>
  )
}

function MetricTile({ label, value, hint, wide = false }) {
  return (
    <div className={`${metricShell} ${wide ? 'md:col-span-2' : ''}`}>
      <p className="text-[0.72rem] font-semibold uppercase text-slate-500">{label}</p>
      <div className="mt-1.5 break-words text-base font-semibold leading-snug text-slate-950">
        {value ?? '-'}
      </div>
      {hint ? <p className="mt-1 text-[0.78rem] leading-5 text-slate-500">{hint}</p> : null}
    </div>
  )
}

function getPriorityClass(priority) {
  if (priority === 'Hot') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (priority === 'High') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (priority === 'Medium') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function SaveLeadsAction({
  canSave,
  disabled,
  saving,
  result,
  onSave,
  autoSendHotEmails,
  onAutoSendHotEmailsChange,
  autoSendHotEmailTestMode,
  onAutoSendHotEmailTestModeChange,
}) {
  const hotMailLabel = result?.hotMailTestMode ? 'hot test mails' : 'hot mails'
  const summaryText = result && !result.error
    ? [
        `${formatNumber(result.created)} created`,
        `${formatNumber(result.updated)} updated`,
        `${formatNumber(result.assessments)} assessments`,
        `${formatNumber(result.ticketsCreated)} field tickets`,
        `${formatNumber(result.contactAttempts ?? 0)} contact checks`,
        `${formatNumber(result.emailsFound ?? 0)} emails found`,
        `${formatNumber(result.phonesFound ?? 0)} phones found`,
        result.hotMailRequested ? `${formatNumber(result.hotMailSent ?? 0)} ${hotMailLabel} sent` : null,
        result.hotMailQueued ? `${formatNumber(result.hotMailQueued)} ${hotMailLabel} queued` : null,
        result.hotMailSkipped ? `${formatNumber(result.hotMailSkipped)} ${hotMailLabel} skipped` : null,
        result.hotMailFailed ? `${formatNumber(result.hotMailFailed)} ${hotMailLabel} failed` : null,
        result.hotMailTestRecipients?.length ? `test recipients: ${result.hotMailTestRecipients.join(', ')}` : null,
        result.contactFailed ? `${formatNumber(result.contactFailed)} contact checks failed` : null,
        result.hotMailError ? `hot mail error: ${result.hotMailError}` : null,
      ].filter(Boolean).join(', ')
    : ''

  if (!canSave) {
    return (
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
        Lead saving is available to admins only.
      </div>
    )
  }

  return (
    <div className="save-leads-action mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-900">Save scanned leads</p>
          <p className="mt-1 text-xs leading-5 text-emerald-700">
            Creates CRM leads, stores solar assessments, checks contacts automatically, and opens field tickets when no email or phone is found.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saving}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Leads'}
        </button>
      </div>

      <label className="save-leads-toggle save-leads-toggle-emerald mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white/75 p-2.5">
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-emerald-950">Auto-send Hot emails</span>
          <span className="block text-xs leading-5 text-emerald-700">
            Off by default. When enabled, Hot leads with emails are mailed during save.
          </span>
        </span>
        <input
          type="checkbox"
          checked={Boolean(autoSendHotEmails)}
          onChange={(event) => onAutoSendHotEmailsChange?.(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-emerald-600"
        />
      </label>

      <label className="save-leads-toggle save-leads-toggle-amber mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/85 p-2.5">
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-amber-950">Test auto-send</span>
          <span className="block text-xs leading-5 text-amber-800">
            Sends Hot lead test copies to adityavbs22@gmail.com and aa5179@srmist.edu.in instead of real lead emails.
          </span>
        </span>
        <input
          type="checkbox"
          checked={Boolean(autoSendHotEmailTestMode)}
          onChange={(event) => onAutoSendHotEmailTestModeChange?.(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-amber-600"
        />
      </label>

      {result ? (
        <p className={`mt-2 text-xs leading-5 ${result.error ? 'text-rose-700' : 'text-emerald-800'}`}>
          {result.error
            ? result.error
            : `${summaryText}.`}
        </p>
      ) : null}
    </div>
  )
}

export function KPIGrid({ metrics, loading }) {
  return (
    <div className={cardShell}>
      <SectionHeading
        eyebrow="System output"
        title="Selected System"
        description="Power and savings for the current panel count."
      />

      <div className="grid gap-2 sm:grid-cols-2">
        {metrics.map((metric) => (
          <MetricTile
            key={metric.label}
            label={metric.label}
            value={loading ? '-' : metric.value}
            hint={loading ? 'Loading solar data' : metric.hint}
          />
        ))}
      </div>
    </div>
  )
}

export function NearbyLeadsPanel({
  leads,
  loading,
  error,
  activeLeadId,
  onSelectLead,
  radiusMeters,
  scanMeta,
  canSaveLeads,
  onSaveLeads,
  saveState,
  autoSendHotEmails,
  onAutoSendHotEmailsChange,
  autoSendHotEmailTestMode,
  onAutoSendHotEmailTestModeChange,
}) {
  const topLeadCount = leads.length

  return (
    <div className={cardShell}>
      <SectionHeading
        eyebrow="Nearby leads"
        title="Top Buildings in 1 km"
        description={`Ranked real Google Solar buildings discovered from ${scanMeta?.sampleCount ?? 0} sampled points.`}
      />

      <div className="mb-3 grid grid-cols-3 gap-2">
        <MetricTile label="Radius" value={`${formatNumber(radiusMeters)} m`} />
        <MetricTile label="Buildings" value={loading ? '-' : formatNumber(topLeadCount)} />
        <MetricTile
          label={scanMeta?.cacheHit ? 'Loaded From' : 'Best Score'}
          value={scanMeta?.cacheHit ? 'Cache' : loading || !leads[0] ? '-' : formatNumber(leads[0].leadScore)}
        />
      </div>

      <SaveLeadsAction
        canSave={canSaveLeads}
        disabled={loading || leads.length === 0}
        saving={saveState?.saving}
        result={saveState?.result}
        onSave={onSaveLeads}
        autoSendHotEmails={autoSendHotEmails}
        onAutoSendHotEmailsChange={onAutoSendHotEmailsChange}
        autoSendHotEmailTestMode={autoSendHotEmailTestMode}
        onAutoSendHotEmailTestModeChange={onAutoSendHotEmailTestModeChange}
      />

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          Scanning real buildings in the 1 km radius...
        </div>
      ) : null}

      {!loading && !error && leads.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          No Solar API buildings were discovered in this scan. Try another rooftop nearby.
        </div>
      ) : null}

      <div className="space-y-2">
        {leads.slice(0, 12).map((lead, index) => {
          const isActive = lead.id === activeLeadId

          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelectLead(lead)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                isActive
                  ? 'border-cyan-400 bg-cyan-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/45'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    #{index + 1} Lead Score {formatNumber(lead.leadScore)}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                    {lead.address}
                  </p>
                </div>
                <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${getPriorityClass(lead.priority)}`}>
                  {lead.priority}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <span>
                  <strong className="block text-slate-950">{formatNumber(lead.availablePanels)}</strong>
                  max panels
                </span>
                <span>
                  <strong className="block text-slate-950">{formatCurrency(lead.annualRevenue)}</strong>
                  annual savings
                </span>
                <span>
                  <strong className="block text-slate-950">{formatNumber((lead.distanceMiles ?? 0) * 1609.34)}</strong>
                  meters away
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function StateLeadsPanel({
  leads,
  stateCode,
  currentStateRate,
  onSelectLead,
  loading,
  error,
  scanMeta,
  canSaveLeads,
  onSaveLeads,
  saveState,
  autoSendHotEmails,
  onAutoSendHotEmailsChange,
  autoSendHotEmailTestMode,
  onAutoSendHotEmailTestModeChange,
}) {
  const rankedLeads = [...leads].sort((left, right) => right.leadScore - left.leadScore)
  const bestLead = rankedLeads[0] ?? null

  return (
    <div className={cardShell}>
      <SectionHeading
        eyebrow="State leads"
        title={stateCode ? `${stateCode} Lead View` : 'State Lead View'}
        description="Real places from Google Places, scored with Google Solar where rooftop data is available."
      />

      <div className="mb-3 grid grid-cols-3 gap-2">
        <MetricTile label="State" value={stateCode || '-'} />
        <MetricTile label="Places Checked" value={loading ? '-' : formatNumber(scanMeta?.placeCount ?? 0)} />
        <MetricTile
          label={scanMeta?.cacheHit ? 'Loaded From' : 'Solar Leads'}
          value={scanMeta?.cacheHit ? 'Cache' : loading ? '-' : formatNumber(rankedLeads.length)}
        />
      </div>

      <SaveLeadsAction
        canSave={canSaveLeads}
        disabled={loading || rankedLeads.length === 0}
        saving={saveState?.saving}
        result={saveState?.result}
        onSave={onSaveLeads}
        autoSendHotEmails={autoSendHotEmails}
        onAutoSendHotEmailsChange={onAutoSendHotEmailsChange}
        autoSendHotEmailTestMode={autoSendHotEmailTestMode}
        onAutoSendHotEmailTestModeChange={onAutoSendHotEmailTestModeChange}
      />

      <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-800">
        This is a real sampled state search. Google Places finds candidate buildings in the state,
        then Google Solar scores the rooftops that have solar data.
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          Searching real Google Places and scoring rooftops with Google Solar...
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-2">
        <MetricTile label="Electricity Rate" value={`$${currentStateRate.toFixed(2)} / kWh`} />
        <MetricTile label="Best Score" value={bestLead ? formatNumber(bestLead.leadScore) : '-'} />
        <MetricTile
          label="Local Annual Savings"
          value={formatCurrency(rankedLeads.reduce((sum, lead) => sum + (lead.annualRevenue || 0), 0))}
        />
        <MetricTile label="Skipped" value={loading ? '-' : formatNumber(scanMeta?.errorCount ?? 0)} />
      </div>

      {!loading && !error && rankedLeads.length === 0 ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          No Google Solar-ready buildings were found from this state sample. Try increasing the
          sample size later or search a specific city first.
        </div>
      ) : null}

      {rankedLeads.length ? (
        <div className="mt-3 space-y-2">
          {rankedLeads.slice(0, 6).map((lead, index) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelectLead?.(lead)}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/45"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    #{index + 1} State Candidate
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                    {lead.address}
                  </p>
                </div>
                <span className={`shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${getPriorityClass(lead.priority)}`}>
                  {formatNumber(lead.leadScore)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <span>
                  <strong className="block text-slate-950">{formatNumber(lead.availablePanels)}</strong>
                  panels
                </span>
                <span>
                  <strong className="block text-slate-950">{formatCurrency(lead.annualRevenue)}</strong>
                  savings
                </span>
                <span>
                  <strong className="block text-slate-950">{lead.priority}</strong>
                  priority
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function LeadInsightsPanel({ lead, currentStateRate }) {
  const [activeTab, setActiveTab] = useState('overview')

  if (!lead) {
    return (
      <div className={cardShell}>
        <SectionHeading
          eyebrow="Building details"
          title="No Building Selected"
          description="Search an address or click a rooftop to load Google Solar data."
        />
      </div>
    )
  }

  const estimatedInstallCost = lead.estimatedInstallCost ?? null
  const costPerPanel = lead.maxPanels > 0 && estimatedInstallCost
    ? estimatedInstallCost / lead.maxPanels
    : null
  const net25YearSavings = typeof estimatedInstallCost === 'number'
    ? (lead.estimated25YearRevenue ?? 0) - estimatedInstallCost
    : null
  const paybackYears = estimatedInstallCost && lead.annualRevenue > 0
    ? estimatedInstallCost / lead.annualRevenue
    : null

  return (
    <div className={cardShell}>
      <SectionHeading
        eyebrow="Building details"
        title="Selected Building"
        description="Live solar potential for the current panel count."
      />

      <div className="mb-3 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
            activeTab === 'overview'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-600 hover:bg-white/70'
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cost')}
          className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
            activeTab === 'cost'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-slate-600 hover:bg-white/70'
          }`}
        >
          Upfront Cost
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="grid gap-2 md:grid-cols-2">
          <MetricTile label="Address" value={lead.address} wide />
          <MetricTile label="Selected Panels" value={formatNumber(lead.maxPanels)} />
          <MetricTile label="Max Available" value={formatNumber(lead.availablePanels)} />
          <MetricTile label="Annual Energy" value={`${formatNumber(lead.annualEnergy)} kWh`} />
          <MetricTile label="Annual Savings" value={formatCurrency(lead.annualRevenue)} />
          <MetricTile label="Roof Area" value={formatArea(lead.roofArea)} />
          <MetricTile label="Roof Segments" value={formatNumber(lead.roofSegments)} />
          <MetricTile label="Solar Potential" value={`${formatNumber(lead.solarPotential)} / 100`} />
          <MetricTile label="Electricity Rate" value={`$${currentStateRate.toFixed(2)} / kWh`} />
          <MetricTile label="25-Year Savings" value={formatCurrency(lead.estimated25YearRevenue)} />
          <MetricTile label="Estimated ROI" value={formatPercentage(lead.roi)} />
          <MetricTile label="Carbon Offset" value={`${formatNumber(lead.carbonOffset, 1)} kg CO2 / MWh`} />
          <MetricTile label="Score" value={formatNumber(lead.leadScore)} />

          <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-[0.72rem] font-semibold uppercase text-slate-500">Recommendation</p>
            <p className="mt-1.5 text-sm leading-6 text-slate-700">{lead.recommendation}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          <MetricTile label="Selected Panels" value={formatNumber(lead.maxPanels)} />
          <MetricTile label="Cost Per Panel" value={formatCurrency(costPerPanel)} hint="Current estimate uses $2,800 per panel." />
          <MetricTile label="Upfront Cost" value={formatCurrency(estimatedInstallCost)} />
          <MetricTile label="Annual Savings" value={formatCurrency(lead.annualRevenue)} />
          <MetricTile label="25-Year Savings" value={formatCurrency(lead.estimated25YearRevenue)} />
          <MetricTile label="Net 25-Year Savings" value={formatCurrency(net25YearSavings)} />
          <MetricTile label="Estimated Payback" value={typeof paybackYears === 'number' ? `${formatNumber(paybackYears, 1)} years` : '-'} />
          <MetricTile label="Estimated ROI" value={formatPercentage(lead.roi)} />

          <div className="cost-note-panel md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
            <p className="text-[0.72rem] font-semibold uppercase text-amber-700">Cost note</p>
            <p className="mt-1.5 text-sm leading-6 text-amber-800">
              Upfront cost is an app estimate based on the selected panel count. Final installed
              cost can change with roof work, electrical upgrades, incentives, and installer pricing.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
