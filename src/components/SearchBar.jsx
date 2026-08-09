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
        className="map-search-input"
      />
    </Autocomplete>
  ) : (
    <input
      type="text"
      disabled
      value="Loading Google Maps..."
      aria-label="Loading Google Maps"
      className="map-search-input"
    />
  )
}

export default SearchBar
