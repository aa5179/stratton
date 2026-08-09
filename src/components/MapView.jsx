import { Circle, GoogleMap, Marker, OverlayView } from '@react-google-maps/api'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

const containerStyle = {
  width: '100%',
  height: '100%',
}

const mapOptions = {
  disableDefaultUI: false,
  clickableIcons: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  zoomControl: true,
  gestureHandling: 'greedy',
  mapTypeId: 'satellite',
  tilt: 0,
}

const radiusOptions = {
  fillColor: '#38bdf8',
  fillOpacity: 0.12,
  strokeColor: '#0ea5e9',
  strokeOpacity: 0.9,
  strokeWeight: 2,
  clickable: false,
}

const MAX_THERMAL_HEAT_SPOTS = 520

function getZoomForRadius(radiusMeters, hasSelection) {
  if (!hasSelection) return 5
  if (radiusMeters >= 1000) return 15
  if (radiusMeters >= 500) return 16
  if (radiusMeters >= 200) return 17
  if (radiusMeters <= 20) return 21
  if (radiusMeters <= 45) return 20
  if (radiusMeters <= 75) return 19
  return 18
}

function getDistanceMiles(from, to) {
  if (!from || !to) {
    return 0
  }

  const toRadians = (value) => (value * Math.PI) / 180
  const latDistance = toRadians(to.lat - from.lat)
  const lngDistance = toRadians(to.lng - from.lng)
  const a = Math.sin(latDistance / 2) ** 2
    + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(lngDistance / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return 3958.8 * c
}

function getMapCenter(map) {
  const center = map?.getCenter()

  if (!center) {
    return null
  }

  return {
    lat: center.lat(),
    lng: center.lng(),
  }
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - ((-2 * progress + 2) ** 3) / 2
}

function getPanelCenter(panel) {
  const center = panel?.center

  if (!center) {
    return null
  }

  const lat = center.lat ?? center.latitude
  const lng = center.lng ?? center.longitude

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null
  }

  return { lat, lng }
}

function getMetersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom)
}

function getPanelAzimuth(panel, roofSegmentAzimuths) {
  const azimuth = roofSegmentAzimuths.get(panel.segmentIndex)

  return azimuth ?? 180
}

function getPanelSize(panel, dimensions, zoom) {
  const center = getPanelCenter(panel)

  if (!center) {
    return { width: 10, height: 16 }
  }

  const metersPerPixel = getMetersPerPixel(center.lat, zoom)
  const landscape = panel.orientation === 'LANDSCAPE'
  const panelWidth = landscape ? dimensions.heightMeters : dimensions.widthMeters
  const panelHeight = landscape ? dimensions.widthMeters : dimensions.heightMeters

  return {
    width: Math.max(7, Math.min(54, panelWidth / metersPerPixel)),
    height: Math.max(10, Math.min(82, panelHeight / metersPerPixel)),
  }
}

const SolarPanelOverlay = memo(function SolarPanelOverlay({
  panel,
  dimensions,
  roofSegmentAzimuths,
  zoom,
  thermalViewEnabled,
}) {
  const position = getPanelCenter(panel)

  if (!position) {
    return null
  }

  const size = getPanelSize(panel, dimensions, zoom)
  const azimuth = getPanelAzimuth(panel, roofSegmentAzimuths)
  const yearlyEnergy = panel.yearlyEnergyDcKwh
  const energyIntensity = typeof yearlyEnergy === 'number'
    ? Math.max(0.5, Math.min(1, yearlyEnergy / 520))
    : 0.76
  const heatIntensity = typeof yearlyEnergy === 'number'
    ? Math.max(0, Math.min(1, yearlyEnergy / 620))
    : 0.62
  const heatHue = Math.round(220 - (heatIntensity * 220))

  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({
        x: -(size.width / 2),
        y: -(size.height / 2),
      })}
    >
      <div
        title={yearlyEnergy ? `${Math.round(yearlyEnergy)} kWh/year` : 'Solar panel placement'}
        className={`solar-panel-overlay ${thermalViewEnabled ? 'solar-panel-overlay-thermal' : ''}`}
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          opacity: thermalViewEnabled ? Math.max(0.72, heatIntensity) : energyIntensity,
          '--panel-heat-color': `hsl(${heatHue} 96% 56%)`,
          transform: `translateZ(0) rotate(${azimuth}deg)`,
        }}
      />
    </OverlayView>
  )
})

const ThermalHeatOverlay = memo(function ThermalHeatOverlay({
  panel,
  dimensions,
  zoom,
}) {
  const position = getPanelCenter(panel)

  if (!position) {
    return null
  }

  const panelSize = getPanelSize(panel, dimensions, zoom)
  const yearlyEnergy = panel.yearlyEnergyDcKwh
  const heatIntensity = typeof yearlyEnergy === 'number'
    ? Math.max(0.22, Math.min(1, yearlyEnergy / 620))
    : 0.55
  const heatHue = Math.round(218 - (heatIntensity * 218))
  const width = Math.max(24, Math.min(78, panelSize.width * 4.4))
  const height = Math.max(24, Math.min(78, panelSize.height * 2.9))

  return (
    <OverlayView
      position={position}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={() => ({
        x: -(width / 2),
        y: -(height / 2),
      })}
    >
      <div
        title={yearlyEnergy ? `${Math.round(yearlyEnergy)} kWh/year solar potential` : 'Solar potential heat'}
        className="thermal-potential-spot"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          opacity: Math.max(0.3, Math.min(0.72, heatIntensity)),
          '--thermal-spot-color': `hsl(${heatHue} 96% 54%)`,
        }}
      />
    </OverlayView>
  )
})

function MapView({
  center,
  markers = [],
  activeMarkerId,
  onMapClick,
  onMarkerSelect,
  isLoaded,
  loadError,
  selectedLocation,
  radiusMeters = 35,
  radiusCenter,
  selectedPanelCount = 0,
  solarPanels = [],
  thermalSolarPanels = [],
  solarPotential = {},
  roofSegments = [],
  thermalViewEnabled = false,
}) {
  const [mapZoom, setMapZoom] = useState(getZoomForRadius(radiusMeters, Boolean(selectedLocation)))
  const [initialMapCamera] = useState(() => ({
    center,
    zoom: getZoomForRadius(radiusMeters, Boolean(selectedLocation)),
  }))
  const mapRef = useRef(null)
  const cameraAnimationRef = useRef({ frame: null, timer: null })
  const lastCameraTargetRef = useRef(null)
  const targetZoom = getZoomForRadius(radiusMeters, Boolean(selectedLocation))
  const realPanelLayout = useMemo(() => {
    return solarPanels
      .map((panel, index) => ({ ...panel, id: `solar-panel-${index}` }))
      .filter((panel) => getPanelCenter(panel))
      .slice(0, selectedPanelCount)
  }, [solarPanels, selectedPanelCount])

  const thermalHeatLayout = useMemo(() => {
    const sourcePanels = thermalSolarPanels.length ? thermalSolarPanels : solarPanels

    return sourcePanels
      .map((panel, index) => ({ ...panel, id: `thermal-heat-${index}` }))
      .filter((panel) => getPanelCenter(panel))
      .sort((left, right) => (right.yearlyEnergyDcKwh ?? 0) - (left.yearlyEnergyDcKwh ?? 0))
      .slice(0, MAX_THERMAL_HEAT_SPOTS)
  }, [solarPanels, thermalSolarPanels])

  const panelDimensions = useMemo(() => ({
    widthMeters: solarPotential.panelWidthMeters ?? 1,
    heightMeters: solarPotential.panelHeightMeters ?? 1.7,
  }), [solarPotential.panelHeightMeters, solarPotential.panelWidthMeters])

  const roofSegmentAzimuths = useMemo(() => {
    return new Map(
      roofSegments.map((roofSegment) => [
        roofSegment.segmentIndex,
        roofSegment.azimuthDegrees,
      ]),
    )
  }, [roofSegments])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !center) {
      return undefined
    }

    const animationState = cameraAnimationRef.current

    if (animationState.frame) {
      window.cancelAnimationFrame(animationState.frame)
    }

    if (animationState.timer) {
      window.clearTimeout(animationState.timer)
    }

    animationState.frame = null
    animationState.timer = null

    const previousTarget = lastCameraTargetRef.current
    const currentCenter = getMapCenter(map) ?? previousTarget ?? center
    const distanceMiles = getDistanceMiles(currentCenter, center)
    const currentZoom = map.getZoom() ?? targetZoom
    const sameTarget = previousTarget
      && Math.abs(previousTarget.lat - center.lat) < 0.000001
      && Math.abs(previousTarget.lng - center.lng) < 0.000001
      && previousTarget.zoom === targetZoom

    if (sameTarget) {
      return undefined
    }

    const sameCenter = previousTarget
      && Math.abs(previousTarget.lat - center.lat) < 0.000001
      && Math.abs(previousTarget.lng - center.lng) < 0.000001

    lastCameraTargetRef.current = {
      lat: center.lat,
      lng: center.lng,
      zoom: targetZoom,
    }

    if (sameCenter || distanceMiles < 0.04) {
      map.setCenter(center)
      map.setZoom(targetZoom)
      return undefined
    }

    const from = currentCenter
    const to = center
    const startedAt = performance.now()
    const duration = Math.min(1050, Math.max(520, distanceMiles * 26))

    if (distanceMiles > 20 && currentZoom > 16) {
      map.setZoom(16)
    }

    const animate = (time) => {
      const elapsed = time - startedAt
      const progress = Math.min(1, elapsed / duration)
      const eased = easeInOutCubic(progress)

      if (mapRef.current) {
        mapRef.current.setCenter({
          lat: from.lat + ((to.lat - from.lat) * eased),
          lng: from.lng + ((to.lng - from.lng) * eased),
        })
      }

      if (progress < 1) {
        animationState.frame = window.requestAnimationFrame(animate)
        return
      }

      animationState.timer = window.setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.setZoom(targetZoom)
        }
      }, 120)
    }

    animationState.frame = window.requestAnimationFrame(animate)

    return () => {
      if (animationState.frame) {
        window.cancelAnimationFrame(animationState.frame)
      }

      if (animationState.timer) {
        window.clearTimeout(animationState.timer)
      }

      animationState.frame = null
      animationState.timer = null
    }
  }, [center, targetZoom])

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 p-6 text-sm text-rose-100">
        Google Maps failed to load. Check the Maps API key in your environment.
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 p-6 text-sm text-slate-300">
        Loading Google Maps...
      </div>
    )
  }

  return (
    <div className={`relative h-full overflow-hidden bg-slate-950 ${thermalViewEnabled ? 'map-thermal-view' : ''}`}>
      {thermalViewEnabled ? (
        <>
          <div className="thermal-map-overlay" />
          <div className="thermal-view-badge">
            Solar potential heat
          </div>
          <div className="thermal-view-legend">
            <span className="thermal-legend-bar" />
            <span>Blue low</span>
            <span>Red high panel potential</span>
          </div>
        </>
      ) : null}
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={initialMapCamera.center}
        zoom={initialMapCamera.zoom}
        options={mapOptions}
        onLoad={(map) => {
          mapRef.current = map
          setMapZoom(map.getZoom() ?? targetZoom)
        }}
        onIdle={() => {
          const zoom = mapRef.current?.getZoom()

          if (typeof zoom === 'number') {
            setMapZoom(zoom)
          }
        }}
        onClick={(event) => {
          const latitude = event.latLng?.lat()
          const longitude = event.latLng?.lng()

          if (typeof latitude === 'number' && typeof longitude === 'number') {
            onMapClick({ lat: latitude, lng: longitude })
          }
        }}
      >
        {selectedLocation ? (
          <Circle
            center={radiusCenter ?? center}
            radius={radiusMeters}
            options={radiusOptions}
          />
        ) : null}

        {thermalViewEnabled ? thermalHeatLayout.map((panel) => (
          <ThermalHeatOverlay
            key={panel.id}
            panel={panel}
            dimensions={panelDimensions}
            zoom={mapZoom}
          />
        )) : null}

        {!thermalViewEnabled ? realPanelLayout.map((panel) => (
          <SolarPanelOverlay
            key={panel.id}
            panel={panel}
            dimensions={panelDimensions}
            roofSegmentAzimuths={roofSegmentAzimuths}
            zoom={mapZoom}
            thermalViewEnabled={thermalViewEnabled}
          />
        )) : null}

        {markers.map((lead) => {
          const priorityColors = {
            Hot: '#22c55e',
            High: '#38bdf8',
            Medium: '#fbbf24',
            Low: '#ef4444',
          }

          const isActive = lead.id === activeMarkerId
          const color = priorityColors[lead.priority] ?? '#38bdf8'

          return (
            <Marker
              key={lead.id}
              position={{ lat: lead.lat, lng: lead.lng }}
              icon={{
                path: window.google?.maps?.SymbolPath?.CIRCLE,
                fillColor: color,
                fillOpacity: 1,
                strokeColor: isActive ? '#ffffff' : '#0f172a',
                strokeWeight: isActive ? 3 : 1,
                scale: isActive ? 10 : 8,
              }}
              onClick={() => onMarkerSelect?.(lead.id)}
            />
          )
        })}
      </GoogleMap>
    </div>
  )
}

export default memo(MapView)
