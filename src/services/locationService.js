export async function reverseGeocodeLocation(lat, lng) {
  if (!window.google?.maps?.Geocoder) {
    return {
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      city: '',
      state: '',
      zip: '',
      country: 'US',
    }
  }

  const geocoder = new window.google.maps.Geocoder()

  return new Promise((resolve) => {
    geocoder.geocode(
      {
        location: { lat, lng },
      },
      (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const addressComponents = results[0].address_components ?? []
          const getComponent = (types) =>
            addressComponents.find((component) => types.some((type) => component.types.includes(type)))

          resolve({
            address: results[0].formatted_address,
            city: getComponent(['locality', 'sublocality', 'postal_town'])?.long_name || '',
            state: getComponent(['administrative_area_level_1'])?.short_name || '',
            zip: getComponent(['postal_code'])?.long_name || '',
            country: getComponent(['country'])?.short_name || 'US',
          })
          return
        }

        resolve({
          address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          city: '',
          state: '',
          zip: '',
          country: 'US',
        })
      },
    )
  })
}
