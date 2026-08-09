import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addSuppressionEntry,
  fetchAdminCrmDashboard,
  saveEnrichedLeadContact,
  sendLeadEmailCampaign,
} from '../services/dashboardService.js'
import { enrichLeadContact } from '../services/enrichmentService.js'
import { formatCurrency, formatNumber } from '../utils/solarInsights.js'

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

const TEMP_TEST_RECIPIENT = 'aroraaditya358@gmail.com'

function formatAddress(lead) {
  return [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ')
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
  const [bulkFinding, setBulkFinding] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [sendingEmails, setSendingEmails] = useState(false)
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
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
    if (filter === 'field_needed') return !lead.email && !lead.phone
    return lead.status === filter
  }), [filter, scoreFilteredLeads])

  const stats = useMemo(() => {
    const emailReady = scoreFilteredLeads.filter((lead) => Boolean(lead.email)).length
    const contactReady = scoreFilteredLeads.filter((lead) => (
      lead.status === 'contact_ready' || (!lead.email && Boolean(lead.phone))
    )).length
    const fieldNeeded = scoreFilteredLeads.filter((lead) => !lead.email && !lead.phone).length
    const visibleLeadIds = new Set(scoreFilteredLeads.map((lead) => lead.id))
    const openTickets = tickets.filter((ticket) => (
      visibleLeadIds.has(ticket.lead_id) && !['closed', 'won', 'lost'].includes(ticket.status)
    )).length
    const queuedEmails = scoreFilteredLeads.reduce((sum, lead) => (
      sum + lead.emailEvents.filter((event) => event.status === 'queued').length
    ), 0)
    const totalSavings = scoreFilteredLeads.reduce((sum, lead) => sum + (Number(lead.assessment?.annual_savings) || 0), 0)

    return { emailReady, contactReady, fieldNeeded, openTickets, queuedEmails, totalSavings }
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

  const sendTestMail = async () => {
    const testLead = scoreFilteredLeads.find((lead) => lead.status !== 'do_not_contact')

    if (!testLead) {
      setMessage('No lead is available in this tab for a test email.')
      return
    }

    setSendingTestEmail(true)
    setMessage('')
    setError('')

    try {
      const summary = await sendLeadEmailCampaign({
        senderEmail,
        leadIds: [testLead.id],
        testRecipient: TEMP_TEST_RECIPIENT,
      })
      const deliveryText = summary.providerConfigured
        ? `${formatNumber(summary.sent)} test email sent, ${formatNumber(summary.failed)} failed`
        : `${formatNumber(summary.queued)} test email queued because no email provider is configured`
      const providerError = summary.errors?.[0]?.message ? ` Provider message: ${summary.errors[0].message}` : ''

      setMessage(`${deliveryText} to ${TEMP_TEST_RECIPIENT}.${providerError}`)
      await loadDashboard()
    } catch (sendError) {
      setError(sendError.message || 'Unable to send the test email.')
    } finally {
      setSendingTestEmail(false)
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
        <MiniStat label="Field Needed" value={formatNumber(stats.fieldNeeded)} />
        <MiniStat label="Open Tickets" value={formatNumber(stats.openTickets)} />
        <MiniStat label="Queued Emails" value={formatNumber(stats.queuedEmails)} />
        <MiniStat label="Annual Savings" value={formatCurrency(stats.totalSavings)} />
      </div>

      {message ? <p className="admin-assignment-message">{message}</p> : null}
      {error ? <p className="admin-assignment-error">{error}</p> : null}

      <div className="admin-crm-toolbar">
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All leads</option>
          <option value="email_ready">Email ready</option>
          <option value="contact_ready">Contact ready</option>
          <option value="field_needed">Field needed</option>
          <option value="interested">Interested</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="do_not_contact">Do not contact</option>
        </select>
        <button type="button" onClick={() => downloadCsv('solar-leads.csv', filteredLeads)}>
          Export CSV
        </button>
        <button type="button" onClick={sendMailsToAllLeads} disabled={sendingEmails || !senderEmail}>
          {sendingEmails ? 'Sending...' : 'Send Mails To All'}
        </button>
        <button type="button" onClick={sendTestMail} disabled={sendingTestEmail || !senderEmail}>
          {sendingTestEmail ? 'Testing...' : 'Send Test Mail'}
        </button>
        {showBulkContactFinder ? (
          <button type="button" onClick={findContactsForVisibleLeads} disabled={bulkFinding}>
            {bulkFinding ? 'Finding...' : 'Find Contacts For All'}
          </button>
        ) : null}
      </div>

      {bulkProgress ? (
        <p className="admin-crm-progress">
          Checking {formatNumber(bulkProgress.current)} of {formatNumber(bulkProgress.total)}: {bulkProgress.address}
        </p>
      ) : null}

      <div className="admin-crm-list">
        {filteredLeads.slice(0, listLimit).map((lead) => (
          <div key={lead.id} className="admin-crm-lead-row">
            <div>
              <p>{formatNumber(lead.lead_score)} · {lead.priority} · {STATUS_LABELS[lead.status] ?? lead.status}</p>
              <strong>{formatAddress(lead)}</strong>
              <span>
                {lead.email || 'email missing'} · {lead.phone || 'phone missing'} · {lead.owner_name || lead.parcel?.owner_name || 'owner needed'}
              </span>
            </div>
          </div>
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
