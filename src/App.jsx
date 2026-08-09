import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import TopBar from './components/TopBar.jsx'
import MapView from './components/MapView.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import EmployeeDashboard from './components/EmployeeDashboard.jsx'
import AdminLeadsPage from './components/AdminLeadsPage.jsx'
import {
  KPIGrid,
  LeadInsightsPanel,
  NearbyLeadsPanel,
  StateLeadsPanel,
} from './components/LeadDashboardSections.jsx'
import { fetchSolarInsights, fetchSolarLeads, fetchStateSolarLeads } from './services/solarApi.js'
import { saveLeadBatch } from './services/crmService.js'
import {
  getCurrentUserProfile,
  onAuthChange,
  signInWithEmail,
  signOut as signOutFromSupabase,
} from './services/authService.js'
import { reverseGeocodeLocation } from './services/locationService.js'
import {
  buildLeadListFromSolarData,
  buildDashboardMetrics,
  buildLeadPortfolio,
  getElectricityRateForState,
} from './utils/leadDashboard.js'
import './App.css'

const US_CENTER = {
  lat: 39.8283,
  lng: -98.5795,
}

const MAP_LIBRARIES = ['places']
const LEAD_SCAN_RADIUS_METERS = 1000
const LEAD_SCAN_SAMPLE_COUNT = 24
const STATE_LEAD_PLACE_COUNT = 12
const MAX_VISIBLE_PANEL_OVERLAYS = 420

function SummaryStat({ label, value, hint }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950/72 p-3">
      <p className="text-[0.72rem] font-semibold uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold leading-tight text-white">{value}</p>
      {hint ? <p className="mt-1 text-[0.78rem] leading-5 text-slate-400">{hint}</p> : null}
    </div>
  )
}

function App() {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [currentUser, setCurrentUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [solarData, setSolarData] = useState(null)
  const [solarError, setSolarError] = useState('')
  const [solarLoading, setSolarLoading] = useState(false)
  const [radiusMeters, setRadiusMeters] = useState(35)
  const [requestedPanelCount, setRequestedPanelCount] = useState(null)
  const [activeLeadId, setActiveLeadId] = useState(null)
  const [nearbyLeadsOpen, setNearbyLeadsOpen] = useState(false)
  const [nearbyLeads, setNearbyLeads] = useState([])
  const [nearbyLeadsLoading, setNearbyLeadsLoading] = useState(false)
  const [nearbyLeadsError, setNearbyLeadsError] = useState('')
  const [nearbyScanMeta, setNearbyScanMeta] = useState(null)
  const [stateLeadsOpen, setStateLeadsOpen] = useState(false)
  const [stateLeads, setStateLeads] = useState([])
  const [stateLeadsLoading, setStateLeadsLoading] = useState(false)
  const [stateLeadsError, setStateLeadsError] = useState('')
  const [stateScanMeta, setStateScanMeta] = useState(null)
  const [thermalViewEnabled, setThermalViewEnabled] = useState(false)
  const [adminPage, setAdminPage] = useState('map')
  const [leadSaveState, setLeadSaveState] = useState({
    nearby: { saving: false, result: null },
    state: { saving: false, result: null },
  })

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'solar-dashboard-map',
    googleMapsApiKey: mapsApiKey ?? '',
    libraries: MAP_LIBRARIES,
  })

  const stateRate = getElectricityRateForState(selectedLocation?.state)

  const login = useCallback(async ({ email, password }) => {
    const profile = await signInWithEmail({ email, password })
    setAuthError('')
    setCurrentUser(profile)
  }, [])

  const signOut = useCallback(async () => {
    await signOutFromSupabase()
    setCurrentUser(null)
    setAuthError('')
  }, [])

  useEffect(() => {
    let active = true

    const loadSession = async () => {
      setAuthLoading(true)
      setAuthError('')

      try {
        const profile = await getCurrentUserProfile()

        if (active) {
          setCurrentUser(profile)
        }
      } catch (error) {
        if (active) {
          setCurrentUser(null)
          setAuthError(error.message || 'Unable to load session.')
        }
      } finally {
        if (active) {
          setAuthLoading(false)
        }
      }
    }

    const unsubscribe = onAuthChange((profile, error) => {
      if (!active) {
        return
      }

      if (error) {
        setCurrentUser(null)
        setAuthError(error.message || 'Unable to load profile.')
        return
      }

      setAuthError('')
      setCurrentUser(profile)
    })

    loadSession()

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!selectedLocation) {
      return undefined
    }

    let active = true

    const loadSolarData = async () => {
      setSolarLoading(true)
      setSolarError('')

      try {
        const data = await fetchSolarInsights(selectedLocation.lat, selectedLocation.lng)
        if (active) {
          setSolarData(data)
        }
      } catch (error) {
        if (active) {
          setSolarData(null)
          setSolarError(error.message || 'Unable to load solar insights.')
        }
      } finally {
        if (active) {
          setSolarLoading(false)
        }
      }
    }

    loadSolarData()

    return () => {
      active = false
    }
  }, [selectedLocation])

  const selectLocation = useCallback(({ lat, lng, address, city, state, zip, country }) => {
    setSolarData(null)
    setSolarError('')
    setRequestedPanelCount(null)
    setNearbyLeadsOpen(false)
    setNearbyLeads([])
    setNearbyLeadsError('')
    setNearbyScanMeta(null)
    setLeadSaveState((current) => ({
      ...current,
      nearby: { saving: false, result: null },
      state: { saving: false, result: null },
    }))
    setStateLeadsOpen(false)
    setStateLeads([])
    setStateLeadsError('')
    setStateScanMeta(null)
    setSelectedLocation({ lat, lng, address, city, state, zip, country })
    setActiveLeadId('selected-building')
  }, [])

  const handleMapClick = useCallback(async ({ lat, lng }) => {
    const resolvedLocation = await reverseGeocodeLocation(lat, lng)
    selectLocation({ lat, lng, ...resolvedLocation })
  }, [selectLocation])

  const refreshCurrentLocation = useCallback(async () => {
    if (!selectedLocation) {
      return
    }

    setSolarLoading(true)
    setSolarError('')

    try {
      const data = await fetchSolarInsights(selectedLocation.lat, selectedLocation.lng, { force: true })
      setSolarData(data)
      setActiveLeadId('selected-building')
    } catch (error) {
      setSolarData(null)
      setSolarError(error.message || 'Unable to refresh solar insights.')
    } finally {
      setSolarLoading(false)
    }
  }, [selectedLocation])

  const openNearbyLeads = useCallback(async () => {
    if (!selectedLocation) {
      return
    }

    setNearbyLeadsOpen(true)
    setStateLeadsOpen(false)
    setNearbyLeadsLoading(true)
    setNearbyLeadsError('')

    try {
      const payload = await fetchSolarLeads(selectedLocation.lat, selectedLocation.lng, {
        radiusMeters: LEAD_SCAN_RADIUS_METERS,
        maxSamples: LEAD_SCAN_SAMPLE_COUNT,
      })
      const rankedLeads = buildLeadListFromSolarData({
        selectedLocation,
        solarBuildings: payload.leads ?? [],
      })

      setNearbyLeads(rankedLeads)
      setLeadSaveState((current) => ({
        ...current,
        nearby: { saving: false, result: null },
      }))
      setNearbyScanMeta({
        radiusMeters: payload.radiusMeters ?? LEAD_SCAN_RADIUS_METERS,
        sampleCount: payload.sampleCount ?? 0,
        discoveredCount: payload.discoveredCount ?? rankedLeads.length,
        errorCount: payload.errors?.length ?? 0,
      })

      if (rankedLeads[0]) {
        setActiveLeadId(rankedLeads[0].id)
        setSolarData(rankedLeads[0].solarData)
        setRequestedPanelCount(rankedLeads[0].availablePanels ?? rankedLeads[0].maxPanels ?? 0)
      }
    } catch (error) {
      setNearbyLeads([])
      setNearbyLeadsError(error.message || 'Unable to scan nearby solar leads.')
    } finally {
      setNearbyLeadsLoading(false)
    }
  }, [selectedLocation])

  const openStateLeads = useCallback(async () => {
    if (!selectedLocation?.state) {
      return
    }

    setNearbyLeadsOpen(false)
    setStateLeadsOpen(true)
    setStateLeadsLoading(true)
    setStateLeadsError('')

    try {
      const payload = await fetchStateSolarLeads(selectedLocation.state, {
        maxPlaces: STATE_LEAD_PLACE_COUNT,
      })
      const rankedLeads = buildLeadListFromSolarData({
        selectedLocation,
        solarBuildings: payload.leads ?? [],
      })

      setStateLeads(rankedLeads)
      setLeadSaveState((current) => ({
        ...current,
        state: { saving: false, result: null },
      }))
      setStateScanMeta({
        stateName: payload.stateName,
        placeCount: payload.placeCount ?? 0,
        discoveredCount: payload.discoveredCount ?? rankedLeads.length,
        errorCount: payload.errors?.length ?? 0,
      })

      if (rankedLeads[0]) {
        setActiveLeadId(rankedLeads[0].id)
        setSolarData(rankedLeads[0].solarData)
        setRequestedPanelCount(rankedLeads[0].availablePanels ?? rankedLeads[0].maxPanels ?? 0)
      }
    } catch (error) {
      setStateLeads([])
      setStateLeadsError(error.message || 'Unable to load state solar leads.')
    } finally {
      setStateLeadsLoading(false)
    }
  }, [selectedLocation])

  const selectNearbyLead = useCallback((lead) => {
    setActiveLeadId(lead.id)
    setSolarData(lead.solarData)
    setRequestedPanelCount(lead.availablePanels ?? lead.maxPanels ?? 0)
  }, [])

  const saveScannedLeads = useCallback(async ({ kind, leadsToSave, source }) => {
    setLeadSaveState((current) => ({
      ...current,
      [kind]: { saving: true, result: null },
    }))

    try {
      const summary = await saveLeadBatch({
        leads: leadsToSave,
        currentUser,
        source,
      })

      setLeadSaveState((current) => ({
        ...current,
        [kind]: { saving: false, result: summary },
      }))
    } catch (error) {
      setLeadSaveState((current) => ({
        ...current,
        [kind]: {
          saving: false,
          result: {
            error: error.message || 'Unable to save leads.',
          },
        },
      }))
    }
  }, [currentUser])

  const selectMapMarker = useCallback((leadId) => {
    const stateLead = stateLeads.find((lead) => lead.id === leadId)

    if (stateLead) {
      selectNearbyLead(stateLead)
      return
    }

    const nearbyLead = nearbyLeads.find((lead) => lead.id === leadId)

    if (nearbyLead) {
      selectNearbyLead(nearbyLead)
      return
    }

    setActiveLeadId(leadId)
  }, [nearbyLeads, selectNearbyLead, stateLeads])

  const leadPortfolio = useMemo(() => {
    return buildLeadPortfolio({
      selectedLocation,
      solarData,
      selectedPanelCount: requestedPanelCount ?? solarData?.maxPanels ?? solarData?.panelCount ?? 0,
    })
  }, [selectedLocation, solarData, requestedPanelCount])

  const leads = leadPortfolio.leads
  const mapMarkers = stateLeadsOpen && stateLeads.length
    ? stateLeads
    : nearbyLeadsOpen && nearbyLeads.length
      ? nearbyLeads
      : leads
  const visibleLeadCount = stateLeadsOpen && stateLeads.length
    ? stateLeads.length
    : nearbyLeadsOpen && nearbyLeads.length
      ? nearbyLeads.length
      : leads.length
  const stateLeadCandidates = stateLeads.length
    ? stateLeads
    : nearbyLeads.length
      ? nearbyLeads
      : leads

  const activeLead = useMemo(
    () => leads[0] ?? null,
    [leads],
  )

  const mapTargetLat = activeLead?.lat ?? selectedLocation?.lat ?? US_CENTER.lat
  const mapTargetLng = activeLead?.lng ?? selectedLocation?.lng ?? US_CENTER.lng
  const mapCenter = useMemo(
    () => ({ lat: mapTargetLat, lng: mapTargetLng }),
    [mapTargetLat, mapTargetLng],
  )

  const metrics = useMemo(() => buildDashboardMetrics(leads), [leads])
  const maxPanelCount = solarData?.maxPanels ?? solarData?.panelCount ?? 0
  const selectedPanelCount = Math.min(
    maxPanelCount,
    requestedPanelCount ?? maxPanelCount,
  )
  const deferredSelectedPanelCount = useDeferredValue(selectedPanelCount)

  const kpiCards = [
    {
      label: 'Selected Panels',
      value: metrics.potentialPanels.toLocaleString('en-US'),
      hint: `${maxPanelCount.toLocaleString('en-US')} max available`,
    },
    {
      label: 'Annual Energy',
      value: `${Math.round(metrics.annualEnergy).toLocaleString('en-US')} kWh`,
      hint: 'Portfolio output forecast',
    },
    {
      label: 'Annual Savings',
      value: `$${Math.round(metrics.annualRevenue).toLocaleString('en-US')}`,
      hint: `Using ${stateRate.toFixed(2)} / kWh`,
    },
    {
      label: 'Average ROI',
      value: `${metrics.averageRoi.toFixed(1)}%`,
      hint: 'Across the selected lead set',
    },
    {
      label: 'Roof Area',
      value: `${Math.round(metrics.totalRoofArea).toLocaleString('en-US')} m2`,
      hint: `${radiusMeters}m boundary`,
    },
  ]

  const selectedAddress = selectedLocation?.address || 'Click the satellite map or search an address'
  const solarPanelLayoutCount = selectedPanelCount
  const visiblePanelOverlayCount = Math.min(deferredSelectedPanelCount, MAX_VISIBLE_PANEL_OVERLAYS)
  const visibleRadiusMeters = nearbyLeadsOpen ? LEAD_SCAN_RADIUS_METERS : radiusMeters
  const thermalAreaPanels = useMemo(() => {
    const sourceLeads = stateLeadsOpen && stateLeads.length
      ? stateLeads
      : nearbyLeadsOpen && nearbyLeads.length
        ? nearbyLeads
        : []

    return sourceLeads.flatMap((lead) => lead.solarData?.solarPanels ?? [])
  }, [nearbyLeads, nearbyLeadsOpen, stateLeads, stateLeadsOpen])
  const canSaveLeads = currentUser?.role === 'admin'

  if (authLoading) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="app-brand app-brand-login">
            <img src="/LOGO.jpeg" alt="Stratton logo" />
            <div>
              <p className="login-eyebrow">STRATTON</p>
              <span>Solar CRM</span>
            </div>
          </div>
          <h1 className="login-title">Loading session</h1>
          <p className="login-copy">Checking your Supabase authentication session.</p>
        </section>
      </main>
    )
  }

  if (!currentUser) {
    return <LoginScreen onLogin={login} authError={authError} />
  }

  if (currentUser.role === 'ground_employee') {
    return <EmployeeDashboard currentUser={currentUser} onSignOut={signOut} />
  }

  if (adminPage === 'leads') {
    return (
      <AdminLeadsPage
        currentUser={currentUser}
        onBackToMap={() => setAdminPage('map')}
        onSignOut={signOut}
      />
    )
  }

  return (
    <div className="map-workspace">
      <MapView
        isLoaded={isLoaded}
        loadError={loadError}
        center={mapCenter}
        markers={mapMarkers}
        activeMarkerId={nearbyLeadsOpen || stateLeadsOpen ? activeLeadId : activeLead?.id ?? null}
        onMapClick={handleMapClick}
        onMarkerSelect={selectMapMarker}
        selectedLocation={selectedLocation}
        radiusMeters={visibleRadiusMeters}
        radiusCenter={nearbyLeadsOpen && selectedLocation ? selectedLocation : mapCenter}
        selectedPanelCount={visiblePanelOverlayCount}
        solarPanels={solarData?.solarPanels ?? []}
        thermalSolarPanels={thermalAreaPanels}
        solarPotential={solarData?.solarPotential ?? {}}
        roofSegments={solarData?.roofAnalysis?.roofSegments ?? []}
        thermalViewEnabled={thermalViewEnabled}
      />

      <aside className="workspace-panel workspace-panel-left">
        <TopBar
          isLoaded={isLoaded}
          disabled={!isLoaded || Boolean(loadError)}
          onPlaceSelected={selectLocation}
          onRefresh={refreshCurrentLocation}
          currentStateRate={stateRate}
          isRefreshing={solarLoading}
          radiusMeters={radiusMeters}
          onRadiusChange={setRadiusMeters}
          selectedLocation={selectedLocation}
          onOpenLeads={openNearbyLeads}
          isLeadsLoading={nearbyLeadsLoading}
          onOpenStateLeads={openStateLeads}
          isStateLeadsOpen={stateLeadsOpen}
          isStateLeadsLoading={stateLeadsLoading}
          thermalViewEnabled={thermalViewEnabled}
          onThermalViewChange={setThermalViewEnabled}
          currentUser={currentUser}
          onSignOut={signOut}
          onOpenLeadsPage={() => setAdminPage('leads')}
        />

        <div className="rounded-lg border border-white/15 bg-slate-950/82 p-4 shadow-[0_22px_70px_rgba(2,6,23,0.45)] backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase text-cyan-200/85">Selected area</p>
          <h2 className="mt-2 text-lg font-semibold text-white">{selectedAddress}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <SummaryStat
              label="Panels in radius"
              value={solarLoading ? '-' : metrics.potentialPanels.toLocaleString('en-US')}
              hint={`${maxPanelCount.toLocaleString('en-US')} max available`}
            />
            <SummaryStat
              label={stateLeadsOpen ? 'State leads' : 'Leads in radius'}
              value={nearbyLeadsLoading || stateLeadsLoading ? '-' : visibleLeadCount.toLocaleString('en-US')}
              hint={stateLeadsOpen ? 'Real state sample leads' : nearbyLeadsOpen ? 'Real buildings from 1 km scan' : 'Selected real building'}
            />
            <SummaryStat
              label="Solar layout"
              value={solarLoading ? '-' : solarPanelLayoutCount.toLocaleString('en-US')}
              hint={selectedPanelCount > visiblePanelOverlayCount ? `${visiblePanelOverlayCount.toLocaleString('en-US')} drawn for speed` : 'Panels drawn when API returns centers'}
            />
            <SummaryStat
              label="Map mode"
              value={thermalViewEnabled ? 'Thermal' : 'Satellite'}
              hint={thermalViewEnabled
                ? thermalAreaPanels.length
                  ? 'Area heat from scanned leads'
                  : 'Open Leads for area heat'
                : 'Click rooftops to rescan'}
            />
          </div>
        </div>

        <div className="control-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-200/85">Panel count</p>
              <h3 className="mt-1 text-base font-semibold text-white">
                {selectedPanelCount.toLocaleString('en-US')} selected
              </h3>
            </div>
            <div className="rounded-md border border-white/10 bg-white/8 px-2.5 py-1 text-xs font-semibold text-slate-200">
              {maxPanelCount.toLocaleString('en-US')} max
            </div>
          </div>

          <input
            type="range"
            min="0"
            max={maxPanelCount}
            step="1"
            value={selectedPanelCount}
            disabled={!maxPanelCount || solarLoading}
            onChange={(event) => setRequestedPanelCount(Number(event.target.value))}
            className="mt-3 w-full accent-emerald-300 disabled:opacity-50"
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <SummaryStat
              label="Annual kWh"
              value={solarLoading ? '-' : Math.round(metrics.annualEnergy).toLocaleString('en-US')}
              hint="Selected panels"
            />
            <SummaryStat
              label="Savings"
              value={solarLoading ? '-' : `$${Math.round(metrics.annualRevenue).toLocaleString('en-US')}`}
              hint={`$${stateRate.toFixed(2)} / kWh`}
            />
          </div>
        </div>

        {solarError || loadError?.message ? (
          <div className="rounded-lg border border-rose-300/40 bg-rose-950/85 p-4 text-rose-100 shadow-[0_18px_60px_rgba(2,6,23,0.35)] backdrop-blur-xl">
            <p className="text-sm font-semibold">Solar lookup failed</p>
            <p className="mt-2 text-sm leading-6">
              {solarError || loadError?.message || 'Unknown error.'}
            </p>
          </div>
        ) : null}

        <KPIGrid metrics={kpiCards} loading={solarLoading || !selectedLocation} />
      </aside>

      <aside className="workspace-panel workspace-panel-right">
        {nearbyLeadsOpen ? (
          <NearbyLeadsPanel
            leads={nearbyLeads}
            loading={nearbyLeadsLoading}
            error={nearbyLeadsError}
            activeLeadId={activeLeadId}
            onSelectLead={selectNearbyLead}
            radiusMeters={LEAD_SCAN_RADIUS_METERS}
            scanMeta={nearbyScanMeta}
            canSaveLeads={canSaveLeads}
            saveState={leadSaveState.nearby}
            onSaveLeads={() => saveScannedLeads({
              kind: 'nearby',
              leadsToSave: nearbyLeads,
              source: 'nearby_radius_scan',
            })}
          />
        ) : null}
        {stateLeadsOpen ? (
          <StateLeadsPanel
            leads={stateLeadCandidates}
            stateCode={selectedLocation?.state}
            currentStateRate={stateRate}
            onSelectLead={selectNearbyLead}
            loading={stateLeadsLoading}
            error={stateLeadsError}
            scanMeta={stateScanMeta}
            canSaveLeads={canSaveLeads}
            saveState={leadSaveState.state}
            onSaveLeads={() => saveScannedLeads({
              kind: 'state',
              leadsToSave: stateLeadCandidates,
              source: 'state_places_scan',
            })}
          />
        ) : null}
        <LeadInsightsPanel lead={activeLead} currentStateRate={stateRate} />
      </aside>
    </div>
  )
}

export default App
