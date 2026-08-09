import { apiFetch } from './apiClient.js'

function cleanLeadForEnrichment(lead) {
  return {
    id: lead?.id,
    ownerName: lead?.owner_name || lead?.ownerName || lead?.parcel?.owner_name,
    businessName: lead?.business_name || lead?.businessName,
    contactName: lead?.owner_name || lead?.ownerName || lead?.parcel?.owner_name,
    address: lead?.address,
    city: lead?.city,
    state: lead?.state,
    zip: lead?.zip,
    phone: lead?.phone || lead?.phoneNumber,
    propertyType: lead?.property_type || lead?.propertyType || lead?.parcel?.property_type,
    ownerMailingAddress: lead?.parcel?.owner_mailing_address,
    landUse: lead?.parcel?.land_use,
  }
}

export async function enrichLeadContact(lead) {
  const response = await apiFetch('/api/enrichment/contact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      lead: cleanLeadForEnrichment(lead),
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to enrich lead contact.')
  }

  return payload
}
