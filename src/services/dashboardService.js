import { isSupabaseConfigured, supabase } from './supabaseClient.js'
import { apiFetch } from './apiClient.js'

const CLOSED_TICKET_STATUSES = ['closed', 'won', 'lost']
// Keep this list backward-compatible with databases that have not run
// database/002_status_and_campaign_migration.sql yet.
const OPEN_TICKET_STATUSES = ['pending', 'visited', 'contacted', 'follow_up']
const VALID_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const LEAD_STATUS_BY_TICKET_STATUS = {
  pending: 'assigned_to_field',
  visited: 'visited',
  contacted: 'contacted',
  follow_up: 'pending',
  interested: 'interested',
  not_interested: 'not_interested',
  closed: 'closed',
  won: 'won',
  lost: 'lost',
}

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isValidEmail(email) {
  return VALID_EMAIL_PATTERN.test(String(email || '').trim())
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.')
  }
}

function latestAssessmentByLead(assessments) {
  return assessments.reduce((latestByLead, assessment) => {
    if (!latestByLead[assessment.lead_id]) {
      latestByLead[assessment.lead_id] = assessment
    }

    return latestByLead
  }, {})
}

function mapProfiles(profiles) {
  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    status: profile.status,
  }))
}

function enrichTickets({ tickets, leads, assessments, parcels = [] }) {
  const leadsById = (leads ?? []).reduce((map, lead) => {
    map[lead.id] = lead
    return map
  }, {})
  const parcelsById = (parcels ?? []).reduce((map, parcel) => {
    map[parcel.id] = parcel
    return map
  }, {})
  const assessmentsByLead = latestAssessmentByLead(assessments ?? [])

  return (tickets ?? []).map((ticket) => ({
    ...ticket,
    lead: leadsById[ticket.lead_id]
      ? {
          ...leadsById[ticket.lead_id],
          parcel: parcelsById[leadsById[ticket.lead_id].parcel_id] ?? null,
        }
      : null,
    assessment: assessmentsByLead[ticket.lead_id] ?? null,
  }))
}

export async function fetchAssignedTickets(userId) {
  assertSupabaseConfigured()

  if (!userId) {
    return []
  }

  const { data: tickets, error: ticketError } = await supabase
    .from('tickets')
    .select('id, lead_id, assigned_to, status, title, notes, next_follow_up_at, closed_at, created_at, updated_at')
    .eq('assigned_to', userId)
    .order('updated_at', { ascending: false })

  if (ticketError) {
    throw new Error(ticketError.message || 'Unable to load assigned tickets.')
  }

  if (!tickets?.length) {
    return []
  }

  const leadIds = [...new Set(tickets.map((ticket) => ticket.lead_id).filter(Boolean))]

  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('id, parcel_id, address, city, state, zip, lat, lng, owner_name, business_name, email, phone, property_type, lead_score, priority, status, source, last_contacted_at, created_at')
    .in('id', leadIds)

  if (leadError) {
    throw new Error(leadError.message || 'Unable to load assigned leads.')
  }

  const { data: assessments, error: assessmentError } = await supabase
    .from('solar_assessments')
    .select('lead_id, max_panels, selected_panels, annual_energy_kwh, annual_savings, estimated_install_cost, roi, assessed_at')
    .in('lead_id', leadIds)
    .order('assessed_at', { ascending: false })

  if (assessmentError) {
    throw new Error(assessmentError.message || 'Unable to load solar assessments.')
  }

  const parcelIds = [...new Set((leads ?? []).map((lead) => lead.parcel_id).filter(Boolean))]
  const { data: parcels, error: parcelError } = parcelIds.length
    ? await supabase
      .from('parcels')
      .select('id, owner_name, owner_mailing_address, property_type, land_use, assessed_value')
      .in('id', parcelIds)
    : { data: [], error: null }

  if (parcelError) {
    throw new Error(parcelError.message || 'Unable to load parcel owner data.')
  }

  return enrichTickets({ tickets, leads, assessments, parcels })
}

export async function fetchAdminCrmDashboard() {
  assertSupabaseConfigured()

  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('id, parcel_id, address, city, state, zip, lat, lng, owner_name, business_name, email, phone, email_source, phone_source, property_type, lead_score, priority, status, assigned_to, source, last_contacted_at, created_at, updated_at')
    .order('lead_score', { ascending: false })
    .limit(200)

  if (leadError) {
    throw new Error(leadError.message || 'Unable to load CRM leads.')
  }

  const leadIds = [...new Set((leads ?? []).map((lead) => lead.id).filter(Boolean))]
  const parcelIds = [...new Set((leads ?? []).map((lead) => lead.parcel_id).filter(Boolean))]

  const { data: tickets, error: ticketError } = await supabase
    .from('tickets')
    .select('id, lead_id, assigned_to, status, title, notes, next_follow_up_at, closed_at, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (ticketError) {
    throw new Error(ticketError.message || 'Unable to load tickets.')
  }

  const { data: assessments, error: assessmentError } = leadIds.length
    ? await supabase
      .from('solar_assessments')
      .select('lead_id, max_panels, selected_panels, annual_energy_kwh, annual_savings, estimated_install_cost, roi, assessed_at')
      .in('lead_id', leadIds)
      .order('assessed_at', { ascending: false })
    : { data: [], error: null }

  if (assessmentError) {
    throw new Error(assessmentError.message || 'Unable to load solar assessments.')
  }

  const { data: parcels, error: parcelError } = parcelIds.length
    ? await supabase
      .from('parcels')
      .select('id, owner_name, owner_mailing_address, property_type, land_use, assessed_value')
      .in('id', parcelIds)
    : { data: [], error: null }

  if (parcelError) {
    throw new Error(parcelError.message || 'Unable to load parcel data.')
  }

  const { data: emailEvents, error: emailEventError } = leadIds.length
    ? await supabase
      .from('email_events')
      .select('id, lead_id, campaign_id, to_email, status, provider, provider_message_id, sent_at, created_at')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: false })
      .limit(300)
    : { data: [], error: null }

  if (emailEventError) {
    throw new Error(emailEventError.message || 'Unable to load email events.')
  }

  const { data: suppressionList, error: suppressionError } = await supabase
    .from('suppression_list')
    .select('id, email, reason, note, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (suppressionError) {
    throw new Error(suppressionError.message || 'Unable to load suppression list.')
  }

  const { data: employees, error: employeeError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status')
    .eq('role', 'ground_employee')

  if (employeeError) {
    throw new Error(employeeError.message || 'Unable to load employees.')
  }

  const parcelsById = (parcels ?? []).reduce((map, parcel) => {
    map[parcel.id] = parcel
    return map
  }, {})
  const assessmentsByLead = latestAssessmentByLead(assessments ?? [])
  const ticketsByLead = (tickets ?? []).reduce((map, ticket) => {
    if (!map[ticket.lead_id]) {
      map[ticket.lead_id] = []
    }
    map[ticket.lead_id].push(ticket)
    return map
  }, {})
  const emailEventsByLead = (emailEvents ?? []).reduce((map, event) => {
    if (!map[event.lead_id]) {
      map[event.lead_id] = []
    }
    map[event.lead_id].push(event)
    return map
  }, {})

  return {
    leads: (leads ?? []).map((lead) => ({
      ...lead,
      parcel: parcelsById[lead.parcel_id] ?? null,
      assessment: assessmentsByLead[lead.id] ?? null,
      tickets: ticketsByLead[lead.id] ?? [],
      emailEvents: emailEventsByLead[lead.id] ?? [],
    })),
    tickets: tickets ?? [],
    employees: employees ?? [],
    suppressionList: suppressionList ?? [],
  }
}

export async function addSuppressionEntry({ email, reason = 'manual', note = '' }) {
  assertSupabaseConfigured()

  const normalizedEmail = cleanText(email)?.toLowerCase()

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Enter a valid email address.')
  }

  const { error } = await supabase
    .from('suppression_list')
    .upsert({
      email: normalizedEmail,
      reason,
      note: cleanText(note),
    }, { onConflict: 'email' })

  if (error) {
    throw new Error(error.message || 'Unable to update suppression list.')
  }
}

export async function sendLeadEmailCampaign({ senderEmail, leadIds, testRecipient = '' }) {
  if (!isValidEmail(senderEmail)) {
    throw new Error('Enter a valid sender email address.')
  }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    throw new Error('No leads are available for mailing.')
  }

  const response = await apiFetch('/api/mail/send-leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      senderEmail,
      leadIds,
      testRecipient,
    }),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to send lead emails.')
  }

  return payload
}

export async function fetchFieldAssignmentQueue() {
  assertSupabaseConfigured()

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, status')
    .eq('role', 'ground_employee')
    .eq('status', 'active')
    .order('full_name', { ascending: true })

  if (profileError) {
    throw new Error(profileError.message || 'Unable to load ground employees.')
  }

  const { data: tickets, error: ticketError } = await supabase
    .from('tickets')
    .select('id, lead_id, assigned_to, status, title, notes, next_follow_up_at, closed_at, created_at, updated_at')
    .is('assigned_to', null)
    .in('status', OPEN_TICKET_STATUSES)
    .order('created_at', { ascending: false })
    .limit(200)

  if (ticketError) {
    throw new Error(ticketError.message || 'Unable to load no-email tickets.')
  }

  if (!tickets?.length) {
    return {
      employees: mapProfiles(profiles),
      tickets: [],
    }
  }

  const leadIds = [...new Set(tickets.map((ticket) => ticket.lead_id).filter(Boolean))]

  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('id, parcel_id, address, city, state, zip, lat, lng, owner_name, business_name, email, phone, property_type, lead_score, priority, status, source, last_contacted_at, created_at')
    .in('id', leadIds)

  if (leadError) {
    throw new Error(leadError.message || 'Unable to load no-email leads.')
  }

  const { data: assessments, error: assessmentError } = await supabase
    .from('solar_assessments')
    .select('lead_id, max_panels, selected_panels, annual_energy_kwh, annual_savings, estimated_install_cost, roi, assessed_at')
    .in('lead_id', leadIds)
    .order('assessed_at', { ascending: false })

  if (assessmentError) {
    throw new Error(assessmentError.message || 'Unable to load lead assessments.')
  }

  const parcelIds = [...new Set((leads ?? []).map((lead) => lead.parcel_id).filter(Boolean))]
  const { data: parcels, error: parcelError } = parcelIds.length
    ? await supabase
      .from('parcels')
      .select('id, owner_name, owner_mailing_address, property_type, land_use, assessed_value')
      .in('id', parcelIds)
    : { data: [], error: null }

  if (parcelError) {
    throw new Error(parcelError.message || 'Unable to load parcel owner data.')
  }

  return {
    employees: mapProfiles(profiles),
    tickets: enrichTickets({ tickets, leads, assessments, parcels })
      .filter((ticket) => !ticket.lead?.email && !ticket.lead?.phone),
  }
}

export async function assignNoEmailTicket({ ticketId, leadId, employeeId, adminId }) {
  assertSupabaseConfigured()

  if (!ticketId || !leadId || !employeeId) {
    throw new Error('Ticket, lead, and employee are required.')
  }

  const { error: ticketError } = await supabase
    .from('tickets')
    .update({
      assigned_to: employeeId,
      status: 'pending',
    })
    .eq('id', ticketId)

  if (ticketError) {
    throw new Error(ticketError.message || 'Unable to assign ticket.')
  }

  const { error: leadError } = await supabase
    .from('leads')
    .update({
      assigned_to: employeeId,
      status: 'assigned_to_field',
    })
    .eq('id', leadId)

  if (leadError) {
    throw new Error(leadError.message || 'Unable to assign lead.')
  }

  const { error: updateLogError } = await supabase
    .from('ticket_updates')
    .insert({
      ticket_id: ticketId,
      lead_id: leadId,
      created_by: adminId,
      old_status: 'pending',
      new_status: 'pending',
      note: 'Assigned to a ground employee for in-person email collection.',
    })

  if (updateLogError) {
    throw new Error(updateLogError.message || 'Unable to save assignment history.')
  }
}

export async function saveEnrichedLeadContact({ ticketId, leadId, email, phone, source, confidence, adminId }) {
  assertSupabaseConfigured()

  if (!leadId) {
    throw new Error('Lead is required.')
  }

  if (!email && !phone) {
    throw new Error('No contact details were returned by enrichment.')
  }

  const leadPatch = {
    status: email ? 'email_found' : 'contact_ready',
  }

  if (email) {
    leadPatch.email = email
    leadPatch.email_source = source || 'contact_enrichment'
  }

  if (phone) {
    leadPatch.phone = phone
    leadPatch.phone_source = source || 'contact_enrichment'
  }

  const { error: leadError } = await supabase
    .from('leads')
    .update(leadPatch)
    .eq('id', leadId)

  if (leadError) {
    throw new Error(leadError.message || 'Unable to save enriched contact.')
  }

  if ((email || phone) && ticketId) {
    const { error: ticketError } = await supabase
      .from('tickets')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', ticketId)

    if (ticketError) {
      throw new Error(ticketError.message || 'Unable to close enriched ticket.')
    }
  }

  if (ticketId) {
    const { error: updateLogError } = await supabase
      .from('ticket_updates')
      .insert({
        ticket_id: ticketId,
        lead_id: leadId,
        created_by: adminId,
        old_status: 'pending',
        new_status: email || phone ? 'closed' : 'pending',
        note: email
          ? `Email found by ${source || 'contact enrichment'}${confidence ? ` with confidence ${confidence}` : ''}.`
          : `Phone found by ${source || 'contact enrichment'}; lead moved to contact ready.`,
      })

    if (updateLogError) {
      throw new Error(updateLogError.message || 'Unable to save enrichment history.')
    }
  }
}

export async function updateAssignedTicket({
  ticketId,
  leadId,
  status,
  note,
  collectedEmail,
  collectedPhone,
}) {
  assertSupabaseConfigured()

  if (!ticketId || !leadId || !status) {
    throw new Error('Ticket, lead, and status are required.')
  }

  const { data: currentTicket, error: readError } = await supabase
    .from('tickets')
    .select('id, status')
    .eq('id', ticketId)
    .single()

  if (readError) {
    throw new Error(readError.message || 'Unable to read ticket before updating.')
  }

  const trimmedNote = typeof note === 'string' && note.trim() ? note.trim() : null
  const email = cleanText(collectedEmail)?.toLowerCase()
  const phone = cleanText(collectedPhone)

  if (email && !isValidEmail(email)) {
    throw new Error('Enter a valid collected email address.')
  }

  const ticketPatch = {
    status,
    closed_at: CLOSED_TICKET_STATUSES.includes(status) ? new Date().toISOString() : null,
  }

  if (trimmedNote) {
    ticketPatch.notes = trimmedNote
  }

  const { error: updateError } = await supabase
    .from('tickets')
    .update(ticketPatch)
    .eq('id', ticketId)

  if (updateError) {
    throw new Error(updateError.message || 'Unable to update ticket.')
  }

  const { error: updateLogError } = await supabase
    .from('ticket_updates')
    .insert({
      ticket_id: ticketId,
      lead_id: leadId,
      old_status: currentTicket.status,
      new_status: status,
      note: trimmedNote,
    })

  if (updateLogError) {
    throw new Error(updateLogError.message || 'Unable to save ticket update.')
  }

  const leadStatus = LEAD_STATUS_BY_TICKET_STATUS[status]

  if (leadStatus) {
    const leadPatch = {
      status: email ? 'email_found' : phone ? 'contact_ready' : leadStatus,
      last_contacted_at: ['contacted', 'follow_up', 'interested', 'not_interested', 'closed', 'won', 'lost'].includes(status)
        ? new Date().toISOString()
        : undefined,
    }

    if (email) {
      leadPatch.email = email
      leadPatch.email_source = 'field_collection'
    }

    if (phone) {
      leadPatch.phone = phone
      leadPatch.phone_source = 'field_collection'
    }

    const { error: leadUpdateError } = await supabase
      .from('leads')
      .update(leadPatch)
      .eq('id', leadId)

    if (leadUpdateError) {
      throw new Error(leadUpdateError.message || 'Unable to update lead status.')
    }
  }
}
