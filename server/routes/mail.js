import express from 'express'
import { createSupabaseUserClient } from '../services/supabaseServer.js'

const router = express.Router()

const VALID_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEMP_TEST_RECIPIENT = 'aroraaditya358@gmail.com'

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function isValidEmail(email) {
  return VALID_EMAIL_PATTERN.test(String(email || '').trim())
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getAssessmentValue(assessment, primaryKey, fallbackKey = null) {
  return assessment?.[primaryKey] ?? (fallbackKey ? assessment?.[fallbackKey] : null)
}

function buildLeadEmail({ lead, assessment, senderEmail }) {
  const address = formatAddress(lead)
  const recipientName = cleanText(lead.owner_name) || cleanText(lead.business_name) || 'Property Owner'
  const panelCount = getAssessmentValue(assessment, 'selected_panels', 'max_panels')
  const maxPanels = getAssessmentValue(assessment, 'max_panels')
  const annualEnergy = getAssessmentValue(assessment, 'annual_energy_kwh')
  const annualSavings = getAssessmentValue(assessment, 'annual_savings')
  const installCost = getAssessmentValue(assessment, 'estimated_install_cost')
  const twentyFiveYearSavings = getAssessmentValue(assessment, 'estimated_25_year_savings')
  const roi = getAssessmentValue(assessment, 'roi')
  const roofArea = getAssessmentValue(assessment, 'roof_area_m2')
  const subject = `Solar savings estimate for ${address || 'your property'}`
  const roiLine = Number.isFinite(Number(roi))
    ? `- Estimated ROI: ${formatNumber(roi, { maximumFractionDigits: 1 })}%`
    : '- Estimated ROI: available after utility bill review'

  const text = `Hello ${recipientName},

I am reaching out because we reviewed the rooftop solar potential for ${address || 'your property'} and it appears to be a strong candidate for a commercial solar savings proposal.

Preliminary property estimate:
- Estimated solar panel fit: ${formatNumber(panelCount, { maximumFractionDigits: 0 })} panels${maxPanels ? `, with up to ${formatNumber(maxPanels, { maximumFractionDigits: 0 })} panels possible` : ''}
- Estimated annual production: ${formatNumber(annualEnergy, { maximumFractionDigits: 0 })} kWh
- Estimated annual savings: ${formatCurrency(annualSavings)}
- Estimated upfront installation cost: ${formatCurrency(installCost)}
- Estimated 25-year savings: ${formatCurrency(twentyFiveYearSavings)}
${roiLine}
- Estimated usable roof area: ${formatNumber(roofArea, { maximumFractionDigits: 0 })} sq m

These numbers are based on a remote solar and roof assessment and are meant as a starting point. A final proposal would confirm roof condition, electric usage, utility tariff, incentives, and financing options.

If you are open to it, we can share a short property-specific proposal showing the expected system size, savings range, payback period, and available financing options.

Best regards,
Solar Advisory Team
${senderEmail}`

  const html = `
    <p>Hello ${escapeHtml(recipientName)},</p>
    <p>I am reaching out because we reviewed the rooftop solar potential for <strong>${escapeHtml(address || 'your property')}</strong> and it appears to be a strong candidate for a commercial solar savings proposal.</p>
    <p><strong>Preliminary property estimate:</strong></p>
    <ul>
      <li>Estimated solar panel fit: ${escapeHtml(formatNumber(panelCount, { maximumFractionDigits: 0 }))} panels${maxPanels ? `, with up to ${escapeHtml(formatNumber(maxPanels, { maximumFractionDigits: 0 }))} panels possible` : ''}</li>
      <li>Estimated annual production: ${escapeHtml(formatNumber(annualEnergy, { maximumFractionDigits: 0 }))} kWh</li>
      <li>Estimated annual savings: ${escapeHtml(formatCurrency(annualSavings))}</li>
      <li>Estimated upfront installation cost: ${escapeHtml(formatCurrency(installCost))}</li>
      <li>Estimated 25-year savings: ${escapeHtml(formatCurrency(twentyFiveYearSavings))}</li>
      <li>${escapeHtml(roiLine.replace('- ', ''))}</li>
      <li>Estimated usable roof area: ${escapeHtml(formatNumber(roofArea, { maximumFractionDigits: 0 }))} sq m</li>
    </ul>
    <p>These numbers are based on a remote solar and roof assessment and are meant as a starting point. A final proposal would confirm roof condition, electric usage, utility tariff, incentives, and financing options.</p>
    <p>If you are open to it, we can share a short property-specific proposal showing the expected system size, savings range, payback period, and available financing options.</p>
    <p>Best regards,<br />Solar Advisory Team<br />${escapeHtml(senderEmail)}</p>
  `

  return { subject, text, html }
}

async function sendWithResend({ from, replyTo, to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    return {
      configured: false,
      status: 'queued',
      provider: 'pending_email_provider',
      providerMessageId: null,
      errorMessage: null,
    }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
      reply_to: replyTo || from,
    }),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return {
      configured: true,
      status: 'failed',
      provider: 'resend',
      providerMessageId: null,
      errorMessage: payload?.message || payload?.error || 'Email provider rejected the message.',
    }
  }

  return {
    configured: true,
    status: 'sent',
    provider: 'resend',
    providerMessageId: payload?.id ?? null,
    errorMessage: null,
  }
}

router.post('/mail/send-leads', async (request, response, next) => {
  try {
    const senderEmail = cleanText(request.body?.senderEmail).toLowerCase()
    const testRecipient = request.body?.testRecipient === TEMP_TEST_RECIPIENT
      ? TEMP_TEST_RECIPIENT
      : ''
    const leadIds = Array.isArray(request.body?.leadIds)
      ? [...new Set(request.body.leadIds.filter(Boolean))]
      : []

    if (!isValidEmail(senderEmail)) {
      response.status(400).json({ error: 'Enter a valid sender email address.' })
      return
    }

    if (!leadIds.length) {
      response.status(400).json({ error: 'No leads were selected for mailing.' })
      return
    }

    const supabase = createSupabaseUserClient(request.accessToken)
    const { data: leads, error: leadError } = await supabase
      .from('leads')
      .select('id, address, city, state, zip, owner_name, business_name, email, status')
      .in('id', leadIds)

    if (leadError) {
      throw leadError
    }

    const testMode = Boolean(testRecipient)
    const validLeads = (leads ?? []).filter((lead) => (
      testMode
        ? lead.status !== 'do_not_contact'
        : isValidEmail(lead.email) && lead.status !== 'do_not_contact'
    ))
    const emails = [...new Set(validLeads.map((lead) => cleanText(lead.email).toLowerCase()).filter(Boolean))]
    const { data: suppressed, error: suppressionError } = !testMode && emails.length
      ? await supabase
        .from('suppression_list')
        .select('email')
        .in('email', emails)
      : { data: [], error: null }

    if (suppressionError) {
      throw suppressionError
    }

    const suppressedEmails = new Set((suppressed ?? []).map((entry) => entry.email.toLowerCase()))
    const eligibleLeads = testMode
      ? validLeads.slice(0, 1)
      : validLeads.filter((lead) => !suppressedEmails.has(lead.email.toLowerCase()))

    if (!eligibleLeads.length) {
      response.status(400).json({
        error: 'No leads in this tab have eligible, non-suppressed email addresses.',
      })
      return
    }

    const eligibleLeadIds = eligibleLeads.map((lead) => lead.id)
    const { data: assessments, error: assessmentError } = await supabase
      .from('solar_assessments')
      .select('lead_id, max_panels, selected_panels, annual_energy_kwh, annual_savings, estimated_install_cost, estimated_25_year_savings, roi, roof_area_m2, assessed_at')
      .in('lead_id', eligibleLeadIds)
      .order('assessed_at', { ascending: false })

    if (assessmentError) {
      throw assessmentError
    }

    const assessmentByLead = (assessments ?? []).reduce((map, assessment) => {
      if (!map[assessment.lead_id]) {
        map[assessment.lead_id] = assessment
      }

      return map
    }, {})
    const providerConfigured = Boolean(process.env.RESEND_API_KEY)
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .insert({
        name: `${testMode ? 'TEST - ' : ''}Solar savings outreach - ${new Date().toLocaleDateString('en-US')}`,
        template_subject: 'Property-specific solar savings estimate',
        template_body: 'Generated individually from each lead solar assessment.',
        sender_email: senderEmail,
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
      sent: 0,
      queued: 0,
      failed: 0,
      skipped: leadIds.length - eligibleLeads.length,
      providerConfigured,
      testRecipient: testRecipient || null,
      errors: [],
    }
    const eventRows = []
    const sentLeadIds = []

    for (const lead of eligibleLeads) {
      const message = buildLeadEmail({
        lead,
        assessment: assessmentByLead[lead.id],
        senderEmail,
      })
      const actualFromEmail = testMode
        ? (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev')
        : senderEmail
      const delivery = await sendWithResend({
        from: actualFromEmail,
        replyTo: senderEmail,
        to: testRecipient || lead.email,
        subject: testMode ? `[TEST] ${message.subject}` : message.subject,
        text: message.text,
        html: message.html,
      })

      if (delivery.status === 'sent') {
        summary.sent += 1
        sentLeadIds.push(lead.id)
      } else if (delivery.status === 'queued') {
        summary.queued += 1
      } else {
        summary.failed += 1
        summary.errors.push({
          leadId: lead.id,
          to: testRecipient || lead.email,
          message: delivery.errorMessage,
        })
      }

      eventRows.push({
        lead_id: lead.id,
        campaign_id: campaign.id,
        to_email: (testRecipient || lead.email).toLowerCase(),
        from_email: actualFromEmail,
        subject: testMode ? `[TEST] ${message.subject}` : message.subject,
        body: testMode
          ? `TEST EMAIL: This message was generated from lead ${lead.id} and delivered to ${testRecipient}.\n\n${message.text}`
          : message.text,
        html_body: message.html,
        status: delivery.status,
        provider: delivery.provider,
        provider_message_id: delivery.providerMessageId,
        error_message: delivery.errorMessage,
        sent_at: delivery.status === 'sent' ? new Date().toISOString() : null,
      })
    }

    const { error: eventError } = await supabase
      .from('email_events')
      .insert(eventRows)

    if (eventError) {
      throw eventError
    }

    if (sentLeadIds.length && !testMode) {
      const { error: leadUpdateError } = await supabase
        .from('leads')
        .update({
          status: 'email_sent',
          last_contacted_at: new Date().toISOString(),
        })
        .in('id', sentLeadIds)

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
