import express from 'express'
import { createSupabaseUserClient } from '../services/supabaseServer.js'
import { registerCallScript } from '../services/callScriptStore.js'

const router = express.Router()

const CALL_SKIP_STATUSES = new Set([
  'do_not_contact',
  'not_interested',
  'closed',
  'won',
  'lost',
])
const DEFAULT_TEST_CALL_PHONE = '+919140819309'
const TWILIO_TRIAL_TEMPLATE_URL = 'https://webhooks.twilio.com/v1/Voice/Template/voice_text_to_speech'

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizePhone(phone) {
  const raw = cleanText(phone)
  const digits = raw.replace(/\D/g, '')

  if (!digits) {
    return ''
  }

  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`
  }

  if (digits.length === 10) {
    return `+1${digits}`
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  return ''
}

function getTestCallPhone() {
  return cleanText(process.env.TEST_CALL_PHONE) || DEFAULT_TEST_CALL_PHONE
}

function formatAddress(lead) {
  return [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ')
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || value === '') {
    return 'not yet estimated'
  }

  const number = Number(value)

  if (!Number.isFinite(number)) {
    return 'not yet estimated'
  }

  return new Intl.NumberFormat('en-US', options).format(number)
}

function formatCurrency(value) {
  return formatNumber(value, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function getAssessmentValue(assessment, primaryKey, fallbackKey = null) {
  return assessment?.[primaryKey] ?? (fallbackKey ? assessment?.[fallbackKey] : null)
}

function buildLeadCallScript({ lead, assessment }) {
  const address = formatAddress(lead) || 'your property'
  const recipientName = cleanText(lead.owner_name) || cleanText(lead.business_name) || 'there'
  const callbackPhone = cleanText(process.env.STRATTON_CALLBACK_PHONE)
  const panelCount = getAssessmentValue(assessment, 'selected_panels', 'max_panels')
  const annualEnergy = getAssessmentValue(assessment, 'annual_energy_kwh')
  const annualSavings = getAssessmentValue(assessment, 'annual_savings')
  const installCost = getAssessmentValue(assessment, 'estimated_install_cost')
  const roi = getAssessmentValue(assessment, 'roi')
  const callbackLine = callbackPhone
    ? `You can call Stratton back at ${callbackPhone}.`
    : 'A Stratton advisor can follow up with a detailed proposal.'
  const roiLine = Number.isFinite(Number(roi))
    ? `The estimated return on investment is ${formatNumber(roi, { maximumFractionDigits: 1 })} percent.`
    : 'The return estimate can be confirmed after a utility bill review.'

  return `Hello ${recipientName}. This is Stratton calling with a brief solar savings estimate for ${address}. Our remote rooftop review shows an estimated fit of ${formatNumber(panelCount, { maximumFractionDigits: 0 })} solar panels, producing about ${formatNumber(annualEnergy, { maximumFractionDigits: 0 })} kilowatt hours per year. The estimated annual savings are ${formatCurrency(annualSavings)}, with an estimated upfront installation cost of ${formatCurrency(installCost)}. ${roiLine} These numbers are preliminary and should be confirmed with roof condition, utility usage, tariff, incentives, and financing. ${callbackLine} If you do not want future calls from Stratton, please tell our team and we will remove this number. Thank you.`
}

function buildTestCallScript() {
  const callbackPhone = cleanText(process.env.STRATTON_CALLBACK_PHONE)
  const callbackLine = callbackPhone
    ? `The Stratton callback number is ${callbackPhone}.`
    : 'No callback number is configured yet.'

  return `Hello. This is a Stratton test call. The automated calling system is connected and ready for consent verified solar leads. In production, this call will explain the property address, estimated solar panel count, annual energy production, annual savings, upfront cost, and return on investment. ${callbackLine} Thank you.`
}

function buildTwiML(script) {
  const voice = cleanText(process.env.TWILIO_VOICE) || 'alice'

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/><Say voice="${escapeXml(voice)}">${escapeXml(script)}</Say></Response>`
}

function getCallProvider() {
  return cleanText(process.env.CALL_PROVIDER).toLowerCase() === 'plivo' ? 'plivo' : 'twilio'
}

function getPublicBaseUrl() {
  const rawUrl = cleanText(process.env.PLIVO_PUBLIC_BASE_URL)
    || cleanText(process.env.APP_PUBLIC_URL)
    || cleanText(process.env.PUBLIC_BASE_URL)

  return rawUrl.replace(/\/+$/, '')
}

function getPlivoAnswerUrl(script) {
  const staticAnswerUrl = cleanText(process.env.PLIVO_ANSWER_URL)

  if (staticAnswerUrl) {
    return staticAnswerUrl
  }

  const publicBaseUrl = getPublicBaseUrl()

  if (!publicBaseUrl) {
    return ''
  }

  const scriptId = registerCallScript(script)
  return `${publicBaseUrl}/api/calls/answer/${scriptId}`
}

function getCallProviderStatus() {
  const provider = getCallProvider()

  if (provider === 'plivo') {
    const hasCredentials = Boolean(
      cleanText(process.env.PLIVO_AUTH_ID)
      && cleanText(process.env.PLIVO_AUTH_TOKEN)
      && normalizePhone(process.env.PLIVO_FROM_NUMBER),
    )
    const hasAnswerUrl = Boolean(cleanText(process.env.PLIVO_ANSWER_URL) || getPublicBaseUrl())

    return {
      provider,
      configured: hasCredentials && hasAnswerUrl,
      campaignProvider: hasCredentials && hasAnswerUrl
        ? 'plivo'
        : hasCredentials
          ? 'pending_plivo_public_url'
          : 'pending_plivo_config',
    }
  }

  const configured = Boolean(
    cleanText(process.env.TWILIO_ACCOUNT_SID)
    && cleanText(process.env.TWILIO_AUTH_TOKEN)
    && normalizePhone(process.env.TWILIO_FROM_NUMBER),
  )

  return {
    provider,
    configured,
    campaignProvider: configured ? 'twilio' : 'pending_twilio_config',
  }
}

function isTrialParameterLimitError(message) {
  return /trial accounts have limited parameter access|disallowed parameters/i.test(message || '')
}

async function postTwilioCall({ accountSid, authToken, body }) {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const payload = await response.json().catch(() => null)

  return { response, payload }
}

async function sendWithTwilio({ to, twiml, allowTrialTemplateFallback = false }) {
  const accountSid = cleanText(process.env.TWILIO_ACCOUNT_SID)
  const authToken = cleanText(process.env.TWILIO_AUTH_TOKEN)
  const from = normalizePhone(process.env.TWILIO_FROM_NUMBER)

  if (!accountSid || !authToken || !from) {
    return {
      configured: false,
      status: 'queued',
      provider: 'pending_twilio_config',
      providerCallId: null,
      fromPhone: from || null,
      errorMessage: null,
    }
  }

  const body = new URLSearchParams({
    To: to,
    From: from,
    Twiml: twiml,
  })
  const { response, payload } = await postTwilioCall({ accountSid, authToken, body })

  if (!response.ok) {
    const errorMessage = payload?.message || payload?.error_message || 'Twilio rejected the outbound call.'

    if (allowTrialTemplateFallback && isTrialParameterLimitError(errorMessage)) {
      const trialBody = new URLSearchParams({
        To: to,
        From: from,
        Url: TWILIO_TRIAL_TEMPLATE_URL,
      })
      const trialDelivery = await postTwilioCall({
        accountSid,
        authToken,
        body: trialBody,
      })
      const trialPayload = trialDelivery.payload

      if (trialDelivery.response.ok) {
        return {
          configured: true,
          status: 'initiated',
          provider: 'twilio_trial_template',
          providerCallId: trialPayload?.sid ?? null,
          fromPhone: from,
          errorMessage: null,
        }
      }

      return {
        configured: true,
        status: 'failed',
        provider: 'twilio_trial_template',
        providerCallId: null,
        fromPhone: from,
        errorMessage: trialPayload?.message || trialPayload?.error_message || errorMessage,
      }
    }

    return {
      configured: true,
      status: 'failed',
      provider: 'twilio',
      providerCallId: null,
      fromPhone: from,
      errorMessage,
    }
  }

  return {
    configured: true,
    status: 'initiated',
    provider: 'twilio',
    providerCallId: payload?.sid ?? null,
    fromPhone: from,
    errorMessage: null,
  }
}

async function sendWithPlivo({ to, script }) {
  const authId = cleanText(process.env.PLIVO_AUTH_ID)
  const authToken = cleanText(process.env.PLIVO_AUTH_TOKEN)
  const from = normalizePhone(process.env.PLIVO_FROM_NUMBER)

  if (!authId || !authToken || !from) {
    return {
      configured: false,
      status: 'queued',
      provider: 'pending_plivo_config',
      providerCallId: null,
      fromPhone: from || null,
      errorMessage: null,
    }
  }

  const answerUrl = getPlivoAnswerUrl(script)

  if (!answerUrl) {
    return {
      configured: false,
      status: 'queued',
      provider: 'pending_plivo_public_url',
      providerCallId: null,
      fromPhone: from,
      errorMessage: 'Set APP_PUBLIC_URL or PLIVO_PUBLIC_BASE_URL to a public backend URL so Plivo can fetch the call script.',
    }
  }

  const auth = Buffer.from(`${authId}:${authToken}`).toString('base64')
  const response = await fetch(`https://api.plivo.com/v1/Account/${authId}/Call/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      answer_url: answerUrl,
      answer_method: 'GET',
    }),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      configured: true,
      status: 'failed',
      provider: 'plivo',
      providerCallId: null,
      fromPhone: from,
      errorMessage: payload?.message || payload?.error || payload?.error_message || 'Plivo rejected the outbound call.',
    }
  }

  return {
    configured: true,
    status: 'initiated',
    provider: 'plivo',
    providerCallId: payload?.request_uuid ?? payload?.requestUuid ?? payload?.api_id ?? null,
    fromPhone: from,
    errorMessage: null,
  }
}

async function sendCall({ to, script, allowTrialTemplateFallback = false }) {
  if (getCallProvider() === 'plivo') {
    return sendWithPlivo({ to, script })
  }

  return sendWithTwilio({
    to,
    twiml: buildTwiML(script),
    allowTrialTemplateFallback,
  })
}

export async function sendTestCallPayload() {
  const normalizedPhone = normalizePhone(getTestCallPhone())

  if (!normalizedPhone) {
    const error = new Error('The configured test phone number is invalid.')
    error.status = 400
    throw error
  }

  const delivery = await sendWithTwilio({
    to: normalizedPhone,
    twiml: buildTwiML(buildTestCallScript()),
    allowTrialTemplateFallback: true,
  })

  return {
    to: normalizedPhone,
    providerConfigured: delivery.configured,
    status: delivery.status,
    provider: delivery.provider,
    providerCallId: delivery.providerCallId,
    errorMessage: delivery.errorMessage,
  }
}

router.post('/calls/test', async (_request, response, next) => {
  try {
    response.json(await sendTestCallPayload())
  } catch (error) {
    next(error)
  }
})

function isMissingCallTablesError(error) {
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || /lead_call_consents|call_events|call_campaigns|phone_suppression_list/i.test(error?.message || '')
}

async function loadLatestAssessments(supabase, leadIds) {
  const { data, error } = leadIds.length
    ? await supabase
      .from('solar_assessments')
      .select('lead_id, max_panels, selected_panels, annual_energy_kwh, annual_savings, estimated_install_cost, estimated_25_year_savings, roi, roof_area_m2, assessed_at')
      .in('lead_id', leadIds)
      .order('assessed_at', { ascending: false })
    : { data: [], error: null }

  if (error) {
    throw error
  }

  return (data ?? []).reduce((map, assessment) => {
    if (!map[assessment.lead_id]) {
      map[assessment.lead_id] = assessment
    }

    return map
  }, {})
}

router.post('/calls/verify-consent', async (request, response, next) => {
  try {
    const leadId = cleanText(request.body?.leadId)
    const requestedPhone = cleanText(request.body?.phone)
    const source = cleanText(request.body?.source) || 'manual_admin'
    const note = cleanText(request.body?.note)

    if (!leadId) {
      response.status(400).json({ error: 'Lead is required.' })
      return
    }

    const supabase = createSupabaseUserClient(request.accessToken)
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, phone, status')
      .eq('id', leadId)
      .single()

    if (leadError) {
      throw leadError
    }

    const normalizedPhone = normalizePhone(requestedPhone || lead.phone)

    if (!normalizedPhone) {
      response.status(400).json({ error: 'A valid phone number is required before consent can be verified.' })
      return
    }

    const { data: consent, error: consentError } = await supabase
      .from('lead_call_consents')
      .upsert({
        lead_id: leadId,
        phone: normalizedPhone,
        status: 'verified',
        source,
        note: note || null,
        consented_at: new Date().toISOString(),
        revoked_at: null,
        created_by: request.user.id,
      }, { onConflict: 'lead_id,phone' })
      .select('id, lead_id, phone, status, source, consented_at')
      .single()

    if (consentError) {
      if (isMissingCallTablesError(consentError)) {
        response.status(400).json({ error: 'Run database/008_call_campaigns.sql in Supabase before verifying phone consent.' })
        return
      }

      throw consentError
    }

    const leadPatch = {
      phone: normalizedPhone,
    }

    if (lead.status !== 'do_not_contact' && lead.status !== 'email_sent') {
      leadPatch.status = lead.status === 'new' || lead.status === 'scored' || lead.status === 'no_email_found'
        ? 'contact_ready'
        : lead.status
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(leadPatch)
      .eq('id', leadId)

    if (updateError) {
      throw updateError
    }

    response.json({ consent })
  } catch (error) {
    next(error)
  }
})

router.post('/calls/send-leads', async (request, response, next) => {
  try {
    const leadIds = Array.isArray(request.body?.leadIds)
      ? [...new Set(request.body.leadIds.filter(Boolean))]
      : []

    if (!leadIds.length) {
      response.status(400).json({ error: 'No leads were selected for calling.' })
      return
    }

    const supabase = createSupabaseUserClient(request.accessToken)
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('id, address, city, state, zip, owner_name, business_name, phone, status')
      .in('id', leadIds)

    if (leadError) {
      throw leadError
    }

    const normalizedLeadPhones = (leads ?? []).map((lead) => ({
      ...lead,
      normalizedPhone: normalizePhone(lead.phone),
    }))
    const callablePhones = [...new Set(normalizedLeadPhones.map((lead) => lead.normalizedPhone).filter(Boolean))]

    const { data: consents, error: consentError } = leadIds.length
      ? await supabase
        .from('lead_call_consents')
        .select('lead_id, phone, status, consented_at, revoked_at')
        .in('lead_id', leadIds)
        .eq('status', 'verified')
      : { data: [], error: null }

    if (consentError) {
      if (isMissingCallTablesError(consentError)) {
        response.status(400).json({ error: 'Run database/008_call_campaigns.sql in Supabase before sending calls.' })
        return
      }

      throw consentError
    }

    const { data: suppressedPhones, error: suppressionError } = callablePhones.length
      ? await supabase
        .from('phone_suppression_list')
        .select('phone')
        .in('phone', callablePhones)
      : { data: [], error: null }

    if (suppressionError) {
      if (isMissingCallTablesError(suppressionError)) {
        response.status(400).json({ error: 'Run database/008_call_campaigns.sql in Supabase before sending calls.' })
        return
      }

      throw suppressionError
    }

    const consentKeys = new Set((consents ?? [])
      .filter((consent) => !consent.revoked_at)
      .map((consent) => `${consent.lead_id}:${normalizePhone(consent.phone)}`))
    const suppressedSet = new Set((suppressedPhones ?? []).map((entry) => normalizePhone(entry.phone)))
    const eligibleLeads = normalizedLeadPhones.filter((lead) => (
      lead.normalizedPhone
      && !CALL_SKIP_STATUSES.has(lead.status)
      && consentKeys.has(`${lead.id}:${lead.normalizedPhone}`)
      && !suppressedSet.has(lead.normalizedPhone)
    ))

    if (!eligibleLeads.length) {
      response.status(400).json({
        error: 'No selected leads are phone-ready, consent-verified, and not phone-suppressed.',
      })
      return
    }

    const assessmentByLead = await loadLatestAssessments(supabase, eligibleLeads.map((lead) => lead.id))
    const providerStatus = getCallProviderStatus()
    const { data: campaign, error: campaignError } = await supabase
      .from('call_campaigns')
      .insert({
        name: `Solar savings phone outreach - ${new Date().toLocaleDateString('en-US')}`,
        template_body: 'Generated individually from each lead solar assessment.',
        provider: providerStatus.campaignProvider,
        created_by: request.user.id,
      })
      .select('id')
      .single()

    if (campaignError) {
      throw campaignError
    }

    const summary = {
      requested: leadIds.length,
      eligible: eligibleLeads.length,
      initiated: 0,
      queued: 0,
      failed: 0,
      skipped: leadIds.length - eligibleLeads.length,
      provider: providerStatus.provider,
      providerConfigured: providerStatus.configured,
      errors: [],
    }
    const eventRows = []
    const contactedLeadIds = []

    for (const lead of eligibleLeads) {
      const script = buildLeadCallScript({
        lead,
        assessment: assessmentByLead[lead.id],
      })
      const delivery = await sendCall({
        to: lead.normalizedPhone,
        script,
      })

      if (delivery.status === 'initiated') {
        summary.initiated += 1
        contactedLeadIds.push(lead.id)
      } else if (delivery.status === 'queued') {
        summary.queued += 1
      } else {
        summary.failed += 1
        summary.errors.push({
          leadId: lead.id,
          to: lead.normalizedPhone,
          message: delivery.errorMessage,
        })
      }

      eventRows.push({
        lead_id: lead.id,
        campaign_id: campaign.id,
        to_phone: lead.normalizedPhone,
        from_phone: delivery.fromPhone,
        script,
        status: delivery.status,
        provider: delivery.provider,
        provider_call_id: delivery.providerCallId,
        error_message: delivery.errorMessage,
        initiated_at: delivery.status === 'initiated' ? new Date().toISOString() : null,
      })
    }

    const { error: eventError } = await supabase
      .from('call_events')
      .insert(eventRows)

    if (eventError) {
      throw eventError
    }

    if (contactedLeadIds.length) {
      const { error: leadUpdateError } = await supabase
        .from('leads')
        .update({
          last_contacted_at: new Date().toISOString(),
        })
        .in('id', contactedLeadIds)

      if (leadUpdateError) {
        throw leadUpdateError
      }
    }

    response.json(summary)
  } catch (error) {
    next(error)
  }
})

export default router
