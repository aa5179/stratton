import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addSuppressionEntry,
  fetchAdminCrmDashboard,
  saveEnrichedLeadContact,
  sendLeadCallCampaign,
  sendLeadEmailCampaign,
  sendTestCall,
  verifyLeadPhoneConsent,
} from '../services/dashboardService.js'
import { enrichLeadContact } from '../services/enrichmentService.js'
import { formatCurrency, formatNumber, formatPercentage } from '../utils/solarInsights.js'

const STATUS_LABELS = {
  new: 'New',
  scored: 'Scored',
  email_found: 'Email Found',
  email_sent: 'Email Sent',
  contact_ready: 'Contact Ready',
  no_email_found: 'No Email Found',
  assigned_to_field: 'Assigned',
  visited: 'Visited',
  contacted: 'Contacted',
  pending: 'Pending',
  interested: 'Interested',
  not_interested: 'Not Interested',
  closed: 'Closed',
  won: 'Won',
  lost: 'Lost',
  do_not_contact: 'Do Not Contact',
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All leads' },
  { value: 'email_ready', label: 'Email ready' },
  { value: 'contact_ready', label: 'Contact ready' },
  { value: 'call_ready', label: 'Call ready' },
  { value: 'field_needed', label: 'Field needed' },
  { value: 'interested', label: 'Interested' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'do_not_contact', label: 'Do not contact' },
]

function formatAddress(lead) {
  return [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ')
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatValue(value, formatter = (item) => item) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  return formatter(value)
}

function getOpenTicket(lead) {
  return lead.tickets?.find((ticket) => !['closed', 'won', 'lost'].includes(ticket.status)) ?? lead.tickets?.[0] ?? null
}

function getLatestEmailEvent(lead) {
  return lead.emailEvents?.[0] ?? null
}

function getLatestCallEvent(lead) {
  return lead.callEvents?.[0] ?? null
}

function getLatestPhoneConsent(lead) {
  return lead.callConsents?.[0] ?? null
}

function isCallReadyLead(lead) {
  const consent = getLatestPhoneConsent(lead)
  const blockedStatuses = new Set(['do_not_contact', 'not_interested', 'closed', 'won', 'lost'])

  return Boolean(lead.phone)
    && consent?.status === 'verified'
    && !consent.revoked_at
    && !blockedStatuses.has(lead.status)
}

function downloadCsv(filename, rows) {
  const headers = [
    'address',
    'city',
    'state',
    'zip',
    'owner_name',
    'business_name',
    'email',
    'phone',
    'lead_score',
    'priority',
    'status',
    'annual_savings',
    'max_panels',
  ]
  const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [
    headers.join(','),
    ...rows.map((lead) => headers.map((header) => {
      if (header === 'annual_savings') return escapeCsv(lead.assessment?.annual_savings)
      if (header === 'max_panels') return escapeCsv(lead.assessment?.max_panels)
      return escapeCsv(lead[header])
    }).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function MiniStat({ label, value, hint }) {
  return (
    <div className="admin-crm-stat">
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  )
}

function DetailStat({ label, value }) {
  return (
    <div className="admin-crm-detail-stat">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  )
}

function LeadDetailPanel({
  lead,
  onVerifyConsent,
  onCallLead,
  verifyingConsent,
  callingLead,
}) {
  const assessment = lead.assessment ?? {}
  const ticket = getOpenTicket(lead)
  const emailEvent = getLatestEmailEvent(lead)
  const callEvent = getLatestCallEvent(lead)
  const phoneConsent = getLatestPhoneConsent(lead)
  const lat = toNumber(lead.lat)
  const lng = toNumber(lead.lng)
  const callReady = isCallReadyLead(lead)

  return (
    <div className="admin-crm-lead-detail">
      <div className="admin-crm-detail-grid">
        <DetailStat label="Owner" value={lead.owner_name || lead.parcel?.owner_name || 'Owner needed'} />
        <DetailStat label="Business" value={lead.business_name || '-'} />
        <DetailStat label="Email" value={lead.email || 'Missing'} />
        <DetailStat label="Phone" value={lead.phone || 'Missing'} />
        <DetailStat label="Phone Consent" value={phoneConsent?.status === 'verified' && !phoneConsent.revoked_at ? 'Verified' : 'Missing'} />
        <DetailStat label="Latest Call" value={callEvent ? callEvent.status : 'No call event'} />
        <DetailStat label="Property Type" value={lead.property_type || lead.parcel?.property_type || '-'} />
        <DetailStat label="Source" value={lead.source || '-'} />
      </div>

      <div className="admin-crm-detail-grid admin-crm-detail-grid-solar">
        <DetailStat label="Max Panels" value={formatValue(toNumber(assessment.max_panels), formatNumber)} />
        <DetailStat label="Selected Panels" value={formatValue(toNumber(assessment.selected_panels), formatNumber)} />
        <DetailStat label="Annual Energy" value={`${formatValue(toNumber(assessment.annual_energy_kwh), formatNumber)} kWh`} />
        <DetailStat label="Annual Savings" value={formatValue(toNumber(assessment.annual_savings), formatCurrency)} />
        <DetailStat label="Install Cost" value={formatValue(toNumber(assessment.estimated_install_cost), formatCurrency)} />
        <DetailStat label="ROI" value={formatValue(toNumber(assessment.roi), formatPercentage)} />
      </div>

      <div className="admin-crm-detail-footer">
        <span>Ticket: {ticket ? STATUS_LABELS[ticket.status] ?? ticket.status : 'No open ticket'}</span>
        <span>Email: {emailEvent ? STATUS_LABELS[emailEvent.status] ?? emailEvent.status : 'No email event'}</span>
        <span>Call: {callEvent ? callEvent.status : 'No call event'}</span>
        <span>Location: {lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '-'}</span>
        <span>Created: {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-US') : '-'}</span>
      </div>

      <div className="admin-crm-detail-actions">
        <button
          type="button"
          onClick={() => onVerifyConsent(lead)}
          disabled={!lead.phone || verifyingConsent}
        >
          {verifyingConsent ? 'Verifying...' : phoneConsent?.status === 'verified' ? 'Consent Verified' : 'Verify Phone Consent'}
        </button>
        <button
          type="button"
          onClick={() => onCallLead(lead)}
          disabled={!callReady || callingLead}
        >
          {callingLead ? 'Calling...' : 'Call This Lead'}
        </button>
      </div>
    </div>
  )
}

function LeadsLoadingState() {
  return (
    <div className="admin-crm-loading">
      <div className="admin-crm-loading-ring" aria-hidden="true" />
      <div className="admin-crm-loading-copy">
        <strong>Loading leads</strong>
        <span>Preparing the CRM list...</span>
      </div>
      <div className="admin-crm-loading-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  )
}

function CrmFilterDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const selectedOption = FILTER_OPTIONS.find((option) => option.value === value) ?? FILTER_OPTIONS[0]

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const closeOnOutsideClick = (event) => {
      if (!dropdownRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const selectOption = (option) => {
    onChange(option.value)
    setOpen(false)
  }

  return (
    <div
      className={`crm-filter-shell ${open ? 'crm-filter-shell-open' : ''}`}
      ref={dropdownRef}
    >
      <span>Filter</span>
      <button
        type="button"
        className="crm-filter-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption.label}</span>
      </button>
      {open ? (
        <div className="crm-filter-menu" role="listbox" aria-label="Lead filter">
          {FILTER_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`crm-filter-option ${option.value === value ? 'crm-filter-option-active' : ''}`}
              onClick={() => selectOption(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LeadRow({
  lead,
  expanded,
  onToggle,
  index,
  onVerifyConsent,
  onCallLead,
  verifyingConsent,
  callingLead,
}) {
  return (
    <div
      className={`admin-crm-lead-row ${expanded ? 'admin-crm-lead-row-expanded' : ''}`}
      style={{ '--lead-index': index }}
    >
      <button type="button" className="admin-crm-lead-main" onClick={onToggle}>
        <div className="admin-crm-lead-copy">
          <div className="admin-crm-lead-meta">
            <span>{formatNumber(toNumber(lead.lead_score) ?? 0)}</span>
            <span>{lead.priority}</span>
            <span>{STATUS_LABELS[lead.status] ?? lead.status}</span>
          </div>
          <strong>{formatAddress(lead)}</strong>
          <small>
            {lead.email || 'email missing'} - {lead.phone || 'phone missing'} - {lead.owner_name || lead.parcel?.owner_name || 'owner needed'}
          </small>
        </div>
        <span className="admin-crm-expand-indicator">{expanded ? 'Hide' : 'Open'}</span>
      </button>
      {expanded ? (
        <LeadDetailPanel
          lead={lead}
          onVerifyConsent={onVerifyConsent}
          onCallLead={onCallLead}
          verifyingConsent={verifyingConsent}
          callingLead={callingLead}
        />
      ) : null}
    </div>
  )
}

function AdminCrmPanel({
  currentUser,
  senderEmail,
  listLimit = 10,
  minScore = null,
  maxScore = null,
  title = 'Lead Pipeline',
  description = 'Stored leads, campaign queue, suppression checks, and field status in one place.',
  showBulkContactFinder = false,
}) {
  const [leads, setLeads] = useState([])
  const [tickets, setTickets] = useState([])
  const [suppressionList, setSuppressionList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('all')
  const [expandedLeadId, setExpandedLeadId] = useState(null)
  const [bulkFinding, setBulkFinding] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [sendingEmails, setSendingEmails] = useState(false)
  const [callingLeads, setCallingLeads] = useState(false)
  const [testCalling, setTestCalling] = useState(false)
  const [callingLeadId, setCallingLeadId] = useState('')
  const [verifyingConsentId, setVerifyingConsentId] = useState('')
  const [suppressionEmail, setSuppressionEmail] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const dashboard = await fetchAdminCrmDashboard()
      setLeads(dashboard.leads)
      setTickets(dashboard.tickets)
      setSuppressionList(dashboard.suppressionList)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load CRM dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadInitialDashboard = async () => {
      try {
        const dashboard = await fetchAdminCrmDashboard()

        if (!active) return

        setLeads(dashboard.leads)
        setTickets(dashboard.tickets)
        setSuppressionList(dashboard.suppressionList)
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Unable to load CRM dashboard.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadInitialDashboard()

    return () => {
      active = false
    }
  }, [])

  const scoreFilteredLeads = useMemo(() => leads.filter((lead) => {
    const score = Number(lead.lead_score) || 0

    if (typeof minScore === 'number' && score < minScore) return false
    if (typeof maxScore === 'number' && score > maxScore) return false
    return true
  }), [leads, maxScore, minScore])

  const filteredLeads = useMemo(() => scoreFilteredLeads.filter((lead) => {
    if (filter === 'all') return true
    if (filter === 'email_ready') return Boolean(lead.email)
    if (filter === 'contact_ready') return lead.status === 'contact_ready' || (!lead.email && Boolean(lead.phone))
    if (filter === 'call_ready') return isCallReadyLead(lead)
    if (filter === 'field_needed') return !lead.email && !lead.phone
    return lead.status === filter
  }), [filter, scoreFilteredLeads])

  const stats = useMemo(() => {
    const emailReady = scoreFilteredLeads.filter((lead) => Boolean(lead.email)).length
    const contactReady = scoreFilteredLeads.filter((lead) => (
      lead.status === 'contact_ready' || (!lead.email && Boolean(lead.phone))
    )).length
    const callReady = scoreFilteredLeads.filter(isCallReadyLead).length
    const fieldNeeded = scoreFilteredLeads.filter((lead) => !lead.email && !lead.phone).length
    const visibleLeadIds = new Set(scoreFilteredLeads.map((lead) => lead.id))
    const openTickets = tickets.filter((ticket) => (
      visibleLeadIds.has(ticket.lead_id) && !['closed', 'won', 'lost'].includes(ticket.status)
    )).length
    const queuedEmails = scoreFilteredLeads.reduce((sum, lead) => (
      sum + lead.emailEvents.filter((event) => event.status === 'queued').length
    ), 0)
    const totalSavings = scoreFilteredLeads.reduce((sum, lead) => sum + (Number(lead.assessment?.annual_savings) || 0), 0)

    return { emailReady, contactReady, callReady, fieldNeeded, openTickets, queuedEmails, totalSavings }
  }, [scoreFilteredLeads, tickets])

  const findContactsForVisibleLeads = async () => {
    const candidates = scoreFilteredLeads.filter((lead) => !lead.email || !lead.phone)

    if (!candidates.length) {
      setMessage('All leads in this tab already have contact details.')
      return
    }

    setBulkFinding(true)
    setMessage('')
    setError('')

    const summary = {
      checked: 0,
      updated: 0,
      emails: 0,
      phones: 0,
      missed: 0,
      failed: 0,
    }

    try {
      for (const lead of candidates) {
        setBulkProgress({
          current: summary.checked + 1,
          total: candidates.length,
          address: formatAddress(lead),
        })

        try {
          const enrichment = await enrichLeadContact(lead)

          if (!enrichment.email && !enrichment.phone) {
            summary.missed += 1
          } else {
            const openTicket = lead.tickets?.find((ticket) => !['closed', 'won', 'lost'].includes(ticket.status))

            await saveEnrichedLeadContact({
              ticketId: openTicket?.id,
              leadId: lead.id,
              email: enrichment.email,
              phone: enrichment.phone,
              source: enrichment.source,
              confidence: enrichment.confidence,
              adminId: currentUser.id,
            })

            summary.updated += 1
            if (enrichment.email) summary.emails += 1
            if (enrichment.phone) summary.phones += 1
          }
        } catch {
          summary.failed += 1
        } finally {
          summary.checked += 1
        }
      }

      setMessage(`${formatNumber(summary.checked)} leads checked. ${formatNumber(summary.emails)} emails and ${formatNumber(summary.phones)} phones found. ${formatNumber(summary.missed)} had no match. ${formatNumber(summary.failed)} failed.`)
      await loadDashboard()
    } finally {
      setBulkFinding(false)
      setBulkProgress(null)
    }
  }

  const sendMailsToAllLeads = async () => {
    const leadIds = scoreFilteredLeads
      .filter((lead) => lead.email)
      .map((lead) => lead.id)

    if (!leadIds.length) {
      setMessage('No email-ready leads are available in this tab.')
      return
    }

    setSendingEmails(true)
    setMessage('')
    setError('')

    try {
      const summary = await sendLeadEmailCampaign({
        senderEmail,
        leadIds,
      })
      const deliveryText = summary.providerConfigured
        ? `${formatNumber(summary.sent)} sent, ${formatNumber(summary.failed)} failed`
        : `${formatNumber(summary.queued)} queued because no email provider is configured`
      const providerError = summary.errors?.[0]?.message ? ` Provider message: ${summary.errors[0].message}` : ''

      setMessage(`${deliveryText}. ${formatNumber(summary.skipped)} skipped by missing/suppressed email or do-not-contact status.${providerError}`)
      await loadDashboard()
    } catch (sendError) {
      setError(sendError.message || 'Unable to send lead emails.')
    } finally {
      setSendingEmails(false)
    }
  }

  const verifyPhoneConsent = async (lead) => {
    if (!lead?.phone) {
      setMessage('This lead needs a phone number before consent can be verified.')
      return
    }

    setVerifyingConsentId(lead.id)
    setMessage('')
    setError('')

    try {
      await verifyLeadPhoneConsent({
        leadId: lead.id,
        phone: lead.phone,
        source: 'manual_admin',
        note: 'Admin verified prior consent before outbound automated calling.',
      })
      setMessage('Phone consent verified for this lead.')
      await loadDashboard()
    } catch (consentError) {
      setError(consentError.message || 'Unable to verify phone consent.')
    } finally {
      setVerifyingConsentId('')
    }
  }

  const callLeadBatch = async (leadIds) => {
    setCallingLeads(true)
    setMessage('')
    setError('')

    try {
      const summary = await sendLeadCallCampaign({ leadIds })
      const deliveryText = summary.providerConfigured
        ? `${formatNumber(summary.initiated)} initiated, ${formatNumber(summary.failed)} failed`
        : `${formatNumber(summary.queued)} queued because the selected call provider is not fully configured`
      const providerError = summary.errors?.[0]?.message ? ` Provider message: ${summary.errors[0].message}` : ''

      setMessage(`${deliveryText}. ${formatNumber(summary.skipped)} skipped by missing phone consent, phone suppression, or blocked status.${providerError}`)
      await loadDashboard()
    } catch (callError) {
      setError(callError.message || 'Unable to start lead calls.')
    } finally {
      setCallingLeads(false)
    }
  }

  const callConsentedLeads = async () => {
    const leadIds = scoreFilteredLeads
      .filter(isCallReadyLead)
      .map((lead) => lead.id)

    if (!leadIds.length) {
      setMessage('No call-ready leads are available in this tab. Verify phone consent first.')
      return
    }

    await callLeadBatch(leadIds)
  }

  const callSingleLead = async (lead) => {
    if (!isCallReadyLead(lead)) {
      setMessage('This lead needs phone_ready + consent_verified + not_suppressed before calling.')
      return
    }

    setCallingLeadId(lead.id)

    try {
      await callLeadBatch([lead.id])
    } finally {
      setCallingLeadId('')
    }
  }

  const sendTestCallToConfiguredNumber = async () => {
    setTestCalling(true)
    setMessage('')
    setError('')

    try {
      const summary = await sendTestCall()
      const deliveryText = summary.providerConfigured
        ? `Test call ${summary.status} to ${summary.to}`
        : `Test call queued for ${summary.to} because the selected call provider is not fully configured`
      const providerError = summary.errorMessage ? ` Provider message: ${summary.errorMessage}` : ''

      setMessage(`${deliveryText}.${providerError}`)
    } catch (callError) {
      setError(callError.message || 'Unable to send the test call.')
    } finally {
      setTestCalling(false)
    }
  }

  const submitSuppression = async (event) => {
    event.preventDefault()
    setMessage('')
    setError('')

    try {
      await addSuppressionEntry({
        email: suppressionEmail,
        reason: 'manual',
        note: 'Added by admin from CRM dashboard.',
      })
      setSuppressionEmail('')
      setMessage('Suppression list updated.')
      await loadDashboard()
    } catch (suppressionError) {
      setError(suppressionError.message || 'Unable to update suppression list.')
    }
  }

  return (
    <div className="admin-crm-card">
      <div className="admin-crm-header">
        <div>
          <p className="admin-assignment-eyebrow">CRM command center</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button type="button" onClick={loadDashboard} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="admin-crm-stats">
        <MiniStat label="Leads" value={formatNumber(scoreFilteredLeads.length)} />
        <MiniStat label="Email Ready" value={formatNumber(stats.emailReady)} />
        <MiniStat label="Contact Ready" value={formatNumber(stats.contactReady)} />
        <MiniStat label="Call Ready" value={formatNumber(stats.callReady)} />
        <MiniStat label="Field Needed" value={formatNumber(stats.fieldNeeded)} />
        <MiniStat label="Open Tickets" value={formatNumber(stats.openTickets)} />
        <MiniStat label="Queued Emails" value={formatNumber(stats.queuedEmails)} />
        <MiniStat label="Annual Savings" value={formatCurrency(stats.totalSavings)} />
      </div>

      {message ? <p className="admin-assignment-message">{message}</p> : null}
      {error ? <p className="admin-assignment-error">{error}</p> : null}

      <div className="admin-crm-toolbar">
        <CrmFilterDropdown value={filter} onChange={setFilter} />
        <div className="admin-crm-toolbar-actions">
          <button type="button" onClick={() => downloadCsv('solar-leads.csv', filteredLeads)}>
            Export CSV
          </button>
          <button type="button" onClick={sendMailsToAllLeads} disabled={sendingEmails || !senderEmail}>
            {sendingEmails ? 'Sending...' : 'Send Mails To All'}
          </button>
          <button type="button" onClick={callConsentedLeads} disabled={callingLeads}>
            {callingLeads ? 'Calling...' : 'Call Consented Leads'}
          </button>
          <button type="button" onClick={sendTestCallToConfiguredNumber} disabled={testCalling}>
            {testCalling ? 'Calling Test...' : 'Test Call'}
          </button>
          {showBulkContactFinder ? (
            <button type="button" onClick={findContactsForVisibleLeads} disabled={bulkFinding}>
              {bulkFinding ? 'Finding...' : 'Find Contacts For All'}
            </button>
          ) : null}
        </div>
      </div>

      {bulkProgress ? (
        <p className="admin-crm-progress">
          Checking {formatNumber(bulkProgress.current)} of {formatNumber(bulkProgress.total)}: {bulkProgress.address}
        </p>
      ) : null}

      <div className={`admin-crm-list ${loading ? 'admin-crm-list-loading' : 'admin-crm-list-ready'}`}>
        {loading ? (
          <LeadsLoadingState />
        ) : filteredLeads.slice(0, listLimit).map((lead, index) => (
          <LeadRow
            key={lead.id}
            lead={lead}
            index={index}
            expanded={expandedLeadId === lead.id}
            onToggle={() => setExpandedLeadId((currentId) => (currentId === lead.id ? null : lead.id))}
            onVerifyConsent={verifyPhoneConsent}
            onCallLead={callSingleLead}
            verifyingConsent={verifyingConsentId === lead.id}
            callingLead={callingLeadId === lead.id}
          />
        ))}
      </div>

      <form className="admin-crm-suppression" onSubmit={submitSuppression}>
        <label>
          <span>Suppress email</span>
          <input
            type="email"
            value={suppressionEmail}
            onChange={(event) => setSuppressionEmail(event.target.value)}
            placeholder="client@example.com"
          />
        </label>
        <button type="submit">Add Suppression</button>
        <span>{formatNumber(suppressionList.length)} suppressed</span>
      </form>
    </div>
  )
}

export default AdminCrmPanel
