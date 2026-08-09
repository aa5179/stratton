import { Autocomplete } from '@react-google-maps/api'
import { useState } from 'react'

function SearchBar({ onPlaceSelected, disabled = false, isLoaded = false }) {
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
      address: place.formatted_address || place.name || 'Selected place on the map',
      city: getComponent(['locality', 'sublocality', 'postal_town'])?.long_name || '',
      state: getComponent(['administrative_area_level_1'])?.short_name || '',
      zip: getComponent(['postal_code'])?.long_name || '',
      country: getComponent(['country'])?.short_name || 'US',
    })
  }

  return isLoaded ? (
    <Autocomplete onLoad={setAutocomplete} onPlaceChanged={handlePlaceChanged}>
      <input
        type="text"
        disabled={disabled}
        placeholder="Search City / ZIP / Address"
        className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-9 pr-4 text-sm font-medium text-slate-900 outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
    </Autocomplete>
  ) : (
    <input
      type="text"
      disabled
      value="Loading Google Maps..."
      aria-label="Loading Google Maps"
      className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-9 pr-4 text-sm font-medium text-slate-500 outline-none"
    />
  )
}

export default SearchBar
