import { isSupabaseConfigured, supabase } from './supabaseClient.js'
import { saveEnrichedLeadContact, sendLeadEmailCampaign } from './dashboardService.js'
import { enrichLeadContact } from './enrichmentService.js'

const OPEN_TICKET_STATUSES = ['pending', 'visited', 'contacted', 'follow_up']
const AUTO_MAIL_SKIP_STATUSES = new Set([
  'email_sent',
  'do_not_contact',
  'not_interested',
  'closed',
  'won',
  'lost',
])
const AUTO_MAIL_TEST_RECIPIENTS = [
  'adityavbs22@gmail.com',
  'aa5179@srmist.edu.in',
]

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.')
  }
}

function cleanNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeAddress(value) {
  return cleanText(value)?.replace(/\s+/g, ' ').toLowerCase() ?? null
}

function normalizeUpper(value) {
  return cleanText(value)?.toUpperCase() ?? null
}

function getCoordinateKey(value) {
  const number = cleanNumber(value)
  return number === null ? null : Number(number.toFixed(5))
}

function getInitialLeadStatus(lead) {
  if (cleanText(lead.email)) return 'email_found'
  if (cleanText(lead.phoneNumber)) return 'contact_ready'
  return 'no_email_found'
}

function mapLeadRow({ lead, currentUser, source }) {
  const solarData = lead.solarData ?? {}

  return {
    google_solar_building_name: cleanText(solarData.buildingName),
    address: cleanText(lead.address) ?? 'Address unavailable',
    city: cleanText(lead.city),
    state: cleanText(lead.state),
    zip: cleanText(lead.zip),
    lat: cleanNumber(lead.lat),
    lng: cleanNumber(lead.lng),
    owner_name: cleanText(lead.ownerName),
    business_name: cleanText(lead.businessName ?? solarData.placeName),
    email: cleanText(lead.email),
    phone: cleanText(lead.phoneNumber),
    email_source: cleanText(lead.emailSource),
    phone_source: cleanText(lead.phoneSource),
    property_type: cleanText(lead.propertyType),
    lead_score: Math.round(cleanNumber(lead.leadScore) ?? 0),
    priority: cleanText(lead.priority) ?? 'Low',
    status: getInitialLeadStatus(lead),
    source,
    created_by: currentUser.id,
  }
}

function mapAssessmentRow({ lead, leadId }) {
  const solarData = lead.solarData ?? {}
  const solarPotential = solarData.solarPotential ?? {}

  return {
    lead_id: leadId,
    google_solar_building_name: cleanText(solarData.buildingName),
    max_panels: cleanNumber(lead.availablePanels),
    selected_panels: cleanNumber(lead.maxPanels),
    annual_energy_kwh: cleanNumber(lead.annualEnergy),
    annual_savings: cleanNumber(lead.annualRevenue),
    roof_area_m2: cleanNumber(lead.roofArea),
    building_area_m2: cleanNumber(solarData.buildingArea),
    solar_score: cleanNumber(lead.solarPotential),
    panel_capacity_watts: cleanNumber(solarPotential.panelCapacityWatts),
    panel_width_meters: cleanNumber(solarPotential.panelWidthMeters),
    panel_height_meters: cleanNumber(solarPotential.panelHeightMeters),
    estimated_install_cost: cleanNumber(lead.estimatedInstallCost),
    estimated_25_year_savings: cleanNumber(lead.estimated25YearRevenue),
    roi: cleanNumber(lead.roi),
    raw_google_solar_json: solarData,
  }
}

function getNextLeadStatus({ existingStatus, incomingStatus }) {
  const protectedStatuses = new Set([
    'email_sent',
    'interested',
    'not_interested',
    'closed',
    'won',
    'lost',
    'do_not_contact',
  ])

  return protectedStatuses.has(existingStatus) ? existingStatus : incomingStatus
}

function matchesAddressLocationKey(lead, leadRow) {
  return normalizeAddress(lead.address) === normalizeAddress(leadRow.address)
    && normalizeUpper(lead.city) === normalizeUpper(leadRow.city)
    && normalizeUpper(lead.state) === normalizeUpper(leadRow.state)
    && cleanText(lead.zip) === cleanText(leadRow.zip)
    && getCoordinateKey(lead.lat) === getCoordinateKey(leadRow.lat)
    && getCoordinateKey(lead.lng) === getCoordinateKey(leadRow.lng)
}

async function findExistingLead(leadRow) {
  if (leadRow.google_solar_building_name) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, status')
      .eq('google_solar_building_name', leadRow.google_solar_building_name)
      .maybeSingle()

    if (error) {
      throw new Error(error.message || 'Unable to check existing lead.')
    }

    return data
  }

  if (leadRow.lat === null || leadRow.lng === null) {
    return null
  }

  const minLat = leadRow.lat - 0.00002
  const maxLat = leadRow.lat + 0.00002
  const minLng = leadRow.lng - 0.00002
  const maxLng = leadRow.lng + 0.00002

  const { data, error } = await supabase
    .from('leads')
    .select('id, status, address, city, state, zip, lat, lng')
    .gte('lat', minLat)
    .lte('lat', maxLat)
    .gte('lng', minLng)
    .lte('lng', maxLng)
    .limit(20)

  if (error) {
    throw new Error(error.message || 'Unable to check existing lead.')
  }

  return data?.find((lead) => matchesAddressLocationKey(lead, leadRow)) ?? null
}

async function upsertLead({ lead, currentUser, source }) {
  const leadRow = mapLeadRow({ lead, currentUser, source })
  const existingLead = await findExistingLead(leadRow)

  if (existingLead) {
    const { data, error } = await supabase
      .from('leads')
      .update({
        address: leadRow.address,
        city: leadRow.city,
        state: leadRow.state,
        zip: leadRow.zip,
        lat: leadRow.lat,
        lng: leadRow.lng,
        owner_name: leadRow.owner_name,
        business_name: leadRow.business_name,
        email: leadRow.email,
        phone: leadRow.phone,
        email_source: leadRow.email_source,
        phone_source: leadRow.phone_source,
        property_type: leadRow.property_type,
        lead_score: leadRow.lead_score,
        priority: leadRow.priority,
        status: getNextLeadStatus({
          existingStatus: existingLead.status,
          incomingStatus: leadRow.status,
        }),
        source: leadRow.source,
      })
      .eq('id', existingLead.id)
      .select('id, status')
      .single()

    if (error) {
      throw new Error(error.message || 'Unable to update lead.')
    }

    return { leadId: data.id, status: data.status, created: false }
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(leadRow)
    .select('id, status')
    .single()

  if (error) {
    throw new Error(error.message || 'Unable to save lead.')
  }

  return { leadId: data.id, status: data.status, created: true }
}

async function insertAssessment({ lead, leadId }) {
  const assessmentRow = mapAssessmentRow({ lead, leadId })
  const { error } = await supabase
    .from('solar_assessments')
    .insert(assessmentRow)

  if (error) {
    throw new Error(error.message || 'Unable to save solar assessment.')
  }
}

async function createTicketIfNeeded({ lead, leadId, currentUser }) {
  if (cleanText(lead.email) || cleanText(lead.phoneNumber)) {
    return { created: false, ticketId: null }
  }

  const { data: existingTicket, error: ticketCheckError } = await supabase
    .from('tickets')
    .select('id')
    .eq('lead_id', leadId)
    .in('status', OPEN_TICKET_STATUSES)
    .limit(1)

  if (ticketCheckError) {
    throw new Error(ticketCheckError.message || 'Unable to check existing tickets.')
  }

  if (existingTicket?.length) {
    return { created: false, ticketId: existingTicket[0].id }
  }

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      lead_id: leadId,
      status: 'pending',
      title: 'Collect client contact details',
      notes: 'No email was found online. Assign this lead to a ground employee for in-person contact.',
      created_by: currentUser.id,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(error.message || 'Unable to create field ticket.')
  }

  return { created: true, ticketId: data.id }
}

async function autoFindContactForLead({ lead, leadId, ticketId, currentUser }) {
  if (cleanText(lead.email)) {
    return {
      attempted: false,
      foundEmail: false,
      foundPhone: false,
    }
  }

  const enrichment = await enrichLeadContact({
    ...lead,
    id: leadId,
  })

  if (!enrichment.email && !enrichment.phone) {
    return {
      attempted: true,
      foundEmail: false,
      foundPhone: false,
    }
  }

  await saveEnrichedLeadContact({
    ticketId,
    leadId,
    email: enrichment.email,
    phone: enrichment.phone,
    source: enrichment.source,
    confidence: enrichment.confidence,
    adminId: currentUser.id,
  })

  return {
    attempted: true,
    foundEmail: Boolean(enrichment.email),
    foundPhone: Boolean(enrichment.phone),
  }
}

export async function saveLeadBatch({
  leads,
  currentUser,
  source = 'google_solar_scan',
  autoSendHotEmails = false,
  autoSendHotEmailTestMode = false,
}) {
  assertSupabaseConfigured()

  if (currentUser?.role !== 'admin') {
    throw new Error('Only admins can save scanned leads.')
  }

  const summary = {
    created: 0,
    updated: 0,
    assessments: 0,
    ticketsCreated: 0,
    contactAttempts: 0,
    emailsFound: 0,
    phonesFound: 0,
    contactFailed: 0,
    hotMailRequested: 0,
    hotMailSent: 0,
    hotMailQueued: 0,
    hotMailFailed: 0,
    hotMailSkipped: 0,
    hotMailTestMode: false,
    hotMailTestRecipients: [],
    hotMailError: '',
    failed: 0,
    errors: [],
  }
  const hotLeadIdsForMail = []

  for (const lead of leads) {
    try {
      const savedLead = await upsertLead({ lead, currentUser, source })
      await insertAssessment({ lead, leadId: savedLead.leadId })
      const ticketResult = await createTicketIfNeeded({
        lead,
        leadId: savedLead.leadId,
        currentUser,
      })
      let contactResult = {
        attempted: false,
        foundEmail: false,
        foundPhone: false,
      }

      try {
        contactResult = await autoFindContactForLead({
          lead,
          leadId: savedLead.leadId,
          ticketId: ticketResult.ticketId,
          currentUser,
        })
      } catch {
        summary.contactFailed += 1
      }

      if (savedLead.created) {
        summary.created += 1
      } else {
        summary.updated += 1
      }

      summary.assessments += 1

      if (ticketResult.created) {
        summary.ticketsCreated += 1
      }

      if (contactResult.attempted) {
        summary.contactAttempts += 1
      }

      if (contactResult.foundEmail) {
        summary.emailsFound += 1
      }

      if (contactResult.foundPhone) {
        summary.phonesFound += 1
      }

      const hasEmailForOutreach = Boolean(cleanText(lead.email) || contactResult.foundEmail)
      const canAutoMail = lead.priority === 'Hot'
        && (autoSendHotEmailTestMode || hasEmailForOutreach)
        && (autoSendHotEmailTestMode || !AUTO_MAIL_SKIP_STATUSES.has(savedLead.status))

      if (canAutoMail) {
        hotLeadIdsForMail.push(savedLead.leadId)
      }
    } catch (error) {
      summary.failed += 1
      summary.errors.push({
        address: lead.address,
        message: error.message || 'Save failed.',
      })
    }
  }

  const uniqueHotLeadIds = [...new Set(hotLeadIdsForMail)]

  if ((autoSendHotEmails || autoSendHotEmailTestMode) && uniqueHotLeadIds.length) {
    summary.hotMailRequested = uniqueHotLeadIds.length
    summary.hotMailTestMode = autoSendHotEmailTestMode
    summary.hotMailTestRecipients = autoSendHotEmailTestMode ? AUTO_MAIL_TEST_RECIPIENTS : []

    try {
      const mailSummary = await sendLeadEmailCampaign({
        senderEmail: currentUser.email,
        leadIds: uniqueHotLeadIds,
        testRecipients: autoSendHotEmailTestMode ? AUTO_MAIL_TEST_RECIPIENTS : [],
      })

      summary.hotMailSent = mailSummary.sent ?? 0
      summary.hotMailQueued = mailSummary.queued ?? 0
      summary.hotMailFailed = mailSummary.failed ?? 0
      summary.hotMailSkipped = mailSummary.skipped ?? 0
      summary.hotMailTestRecipients = mailSummary.testRecipients ?? []
    } catch (error) {
      summary.hotMailFailed = uniqueHotLeadIds.length
      summary.hotMailError = error.message || 'Unable to send hot lead emails.'
    }
  }

  return summary
}
