import { Autocomplete } from '@react-google-maps/api'
import { useState } from 'react'

function TopBar({
  isLoaded,
  disabled,
  onPlaceSelected,
  onRefresh,
  currentStateRate,
  isRefreshing,
  radiusMeters,
  onRadiusChange,
  selectedLocation,
  onOpenLeads,
  isLeadsLoading,
  onOpenStateLeads,
  isStateLeadsOpen,
  isStateLeadsLoading,
  thermalViewEnabled,
  onThermalViewChange,
  currentUser,
  onSignOut,
  onOpenLeadsPage,
  theme,
  onToggleTheme,
}) {
  const [autocomplete, setAutocomplete] = useState(null)

  const handlePlaceChanged = () => {
    if (!autocomplete) {
      return
    }

    const place = autocomplete.getPlace()
    const location = place?.geometry?.location

    if (!location) {
      return
    }

    const addressComponents = place.address_components ?? []
    const getComponent = (types) =>
      addressComponents.find((component) => types.some((type) => component.types.includes(type)))

    onPlaceSelected({
      lat: location.lat(),
      lng: location.lng(),
      address: place.formatted_address || place.name || 'Selected place',
      city: getComponent(['locality', 'sublocality', 'postal_town'])?.long_name || '',
      state: getComponent(['administrative_area_level_1'])?.short_name || '',
      zip: getComponent(['postal_code'])?.long_name || '',
      country: getComponent(['country'])?.short_name || 'US',
    })
  }

  return (
    <div className="topbar-card stratton-card space-y-4 rounded-lg p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="app-brand app-brand-map">
            <img src="/LOGO.jpeg" alt="Stratton logo" />
            <div>
              <p>STRATTON</p>
              <span>Building solar scanner</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button type="button" className="theme-toggle theme-toggle-compact" onClick={onToggleTheme}>
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="ghost-action rounded-md px-2.5 py-1 text-xs font-semibold transition"
            >
              Logout
            </button>
          </div>
        </div>
        <h1 className="mt-2 text-lg font-semibold leading-tight">
          Select one rooftop
        </h1>
        <p className="muted-copy mt-1 text-sm leading-6">
          Search or click a building. Panel layout, power, and savings use Google Solar data.
        </p>
        <div className="user-strip mt-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentUser?.name}</p>
            <p className="truncate text-xs">{currentUser?.email}</p>
          </div>
          <span className="role-pill shrink-0 rounded-md px-2 py-1 text-xs font-semibold uppercase">
            {currentUser?.role === 'admin' ? 'Admin' : 'Field'}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase text-slate-400">
            Search
          </span>
          {isLoaded ? (
            <Autocomplete onLoad={setAutocomplete} onPlaceChanged={handlePlaceChanged}>
              <input
                type="text"
                disabled={disabled}
                placeholder="City, ZIP, or address"
                className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-16 pr-4 text-sm font-medium text-slate-900 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </Autocomplete>
          ) : (
            <input
              type="text"
              disabled
              value="Loading Google Maps..."
              aria-label="Loading Google Maps"
              className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-16 pr-4 text-sm font-medium text-slate-500 outline-none"
            />
          )}
        </div>

        <div className="control-surface rounded-lg p-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="radius-control" className="text-xs font-semibold uppercase">
              Building radius
            </label>
            <span className="role-pill rounded-md px-2 py-1 text-sm font-semibold">{radiusMeters} m</span>
          </div>
          <input
            id="radius-control"
            type="range"
            min="10"
            max="120"
            step="5"
            value={radiusMeters}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
            className="mt-3 w-full accent-cyan-400"
          />
          <div className="muted-copy mt-2 flex justify-between text-[0.7rem]">
            <span>10 m</span>
            <span>120 m</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || !selectedLocation}
            className="min-h-11 rounded-lg bg-cyan-300 px-3 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={onOpenLeads}
            disabled={isLeadsLoading || isRefreshing || !selectedLocation}
            className="min-h-11 rounded-lg bg-emerald-300 px-3 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLeadsLoading ? 'Scanning...' : 'Open Leads'}
          </button>
          <button
            type="button"
            onClick={onOpenStateLeads}
            disabled={isStateLeadsLoading || !selectedLocation?.state}
            className={`min-h-11 rounded-lg px-3 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isStateLeadsOpen
                ? 'bg-amber-200 hover:bg-amber-100'
                : 'bg-slate-100 hover:bg-white'
            }`}
          >
            {isStateLeadsLoading ? 'Loading...' : 'State Leads'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onThermalViewChange(!thermalViewEnabled)}
          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            thermalViewEnabled
              ? 'border-amber-300 bg-amber-300 text-slate-950 hover:bg-amber-200'
              : 'border-white/10 bg-white/8 text-slate-100 hover:bg-white/14'
          }`}
        >
          <span>Thermal View</span>
          <span className={`relative h-5 w-10 rounded-full transition ${
            thermalViewEnabled ? 'bg-slate-950' : 'bg-slate-700'
          }`}
          >
            <span className={`absolute top-1 h-3 w-3 rounded-full bg-white transition ${
              thermalViewEnabled ? 'left-6' : 'left-1'
            }`}
            />
          </span>
        </button>

        {currentUser?.role === 'admin' ? (
          <button
            type="button"
            onClick={onOpenLeadsPage}
            className="min-h-11 w-full rounded-lg border border-cyan-200/35 bg-cyan-300/12 px-3 py-3 text-left text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/20"
          >
            Open Leads CRM
          </button>
        ) : null}
      </div>

      <div className="status-chip-row flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md px-3 py-1">
          State rate: ${currentStateRate.toFixed(2)}/kWh
        </span>
        <span className="rounded-md px-3 py-1">
          Satellite map
        </span>
        <span className="rounded-md px-3 py-1">
          {selectedLocation ? 'Boundary active' : 'Click map to start'}
        </span>
      </div>
    </div>
  )
}

export default TopBar
