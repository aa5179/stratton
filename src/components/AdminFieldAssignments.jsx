import { useCallback, useEffect, useMemo, useState } from 'react'
import { enrichLeadContact } from '../services/enrichmentService.js'
import {
  assignNoEmailTicket,
  fetchFieldAssignmentQueue,
  saveEnrichedLeadContact,
  sendLeadEmailCampaign,
} from '../services/dashboardService.js'
import { formatCurrency, formatNumber } from '../utils/solarInsights.js'

function formatAddress(lead) {
  if (!lead) {
    return 'Lead details unavailable'
  }

  return [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ')
}

function AssignmentLoadingState() {
  return (
    <div className="admin-crm-loading admin-assignment-loading">
      <div className="admin-crm-loading-ring" aria-hidden="true" />
      <div className="admin-crm-loading-copy">
        <strong>Loading no-email queue</strong>
        <span>Preparing field assignment leads...</span>
      </div>
      <div className="admin-crm-loading-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  )
}

function AdminFieldAssignments({ currentUser, senderEmail }) {
  const [employees, setEmployees] = useState([])
  const [tickets, setTickets] = useState([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigningTicketId, setAssigningTicketId] = useState('')
  const [enrichingTicketId, setEnrichingTicketId] = useState('')
  const [bulkFinding, setBulkFinding] = useState(false)
  const [bulkProgress, setBulkProgress] = useState(null)
  const [sendingEmails, setSendingEmails] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const queue = await fetchFieldAssignmentQueue()
      setEmployees(queue.employees)
      setTickets(queue.tickets)
      setSelectedEmployeeId((currentEmployeeId) => (
        queue.employees.some((employee) => employee.id === currentEmployeeId)
          ? currentEmployeeId
          : queue.employees[0]?.id ?? ''
      ))
    } catch (loadError) {
      setEmployees([])
      setTickets([])
      setError(loadError.message || 'Unable to load assignment queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadInitialQueue = async () => {
      try {
        const queue = await fetchFieldAssignmentQueue()

        if (!active) {
          return
        }

        setEmployees(queue.employees)
        setTickets(queue.tickets)
        setSelectedEmployeeId(queue.employees[0]?.id ?? '')
      } catch (loadError) {
        if (!active) {
          return
        }

        setEmployees([])
        setTickets([])
        setError(loadError.message || 'Unable to load assignment queue.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadInitialQueue()

    return () => {
      active = false
    }
  }, [])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  )

  const assignTicket = async (ticket) => {
    if (!selectedEmployeeId) {
      setError('Select a ground employee first.')
      return
    }

    setAssigningTicketId(ticket.id)
    setMessage('')
    setError('')

    try {
      await assignNoEmailTicket({
        ticketId: ticket.id,
        leadId: ticket.lead_id,
        employeeId: selectedEmployeeId,
        adminId: currentUser.id,
      })
      setMessage(`Assigned lead to ${selectedEmployee?.name || 'employee'}.`)
      await loadQueue()
    } catch (assignError) {
      setError(assignError.message || 'Unable to assign lead.')
    } finally {
      setAssigningTicketId('')
    }
  }

  const enrichTicket = async (ticket) => {
    setEnrichingTicketId(ticket.id)
    setMessage('')
    setError('')

    try {
      const enrichment = await enrichLeadContact(ticket.lead)

      if (!enrichment.configured) {
        setError('No contact provider is configured. Add Google Places, PDL_API_KEY, HUNTER_API_KEY, or ENRICHMENT_API_URL to the server .env.')
        return
      }

      if (!enrichment.email && !enrichment.phone) {
        setMessage('No online contact was found. Keep this lead in the field assignment queue.')
        return
      }

      await saveEnrichedLeadContact({
        ticketId: ticket.id,
        leadId: ticket.lead_id,
        email: enrichment.email,
        phone: enrichment.phone,
        source: enrichment.source,
        confidence: enrichment.confidence,
        adminId: currentUser.id,
      })

      setMessage(enrichment.email
        ? `Email found and saved from ${enrichment.provider}.`
        : `Phone found from ${enrichment.provider}; lead moved to contact ready.`)
      await loadQueue()
    } catch (enrichmentError) {
      setError(enrichmentError.message || 'Unable to enrich this lead.')
    } finally {
      setEnrichingTicketId('')
    }
  }

  const findContactsForAll = async () => {
    if (!tickets.length) {
      setMessage('No no-email leads are available for contact discovery.')
      return
    }

    setBulkFinding(true)
    setMessage('')
    setError('')

    const summary = {
      checked: 0,
      emails: 0,
      phones: 0,
      missed: 0,
      failed: 0,
    }

    try {
      for (const ticket of tickets) {
        setBulkProgress({
          current: summary.checked + 1,
          total: tickets.length,
          address: formatAddress(ticket.lead),
        })

        try {
          const enrichment = await enrichLeadContact(ticket.lead)

          if (!enrichment.email && !enrichment.phone) {
            summary.missed += 1
          } else {
            await saveEnrichedLeadContact({
              ticketId: ticket.id,
              leadId: ticket.lead_id,
              email: enrichment.email,
              phone: enrichment.phone,
              source: enrichment.source,
              confidence: enrichment.confidence,
              adminId: currentUser.id,
            })

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
      await loadQueue()
    } finally {
      setBulkFinding(false)
      setBulkProgress(null)
    }
  }

  const sendMailsToAll = async () => {
    const leadIds = tickets
      .map((ticket) => ticket.lead)
      .filter((lead) => lead?.email)
      .map((lead) => lead.id)

    if (!leadIds.length) {
      setMessage('No email-ready leads are available in the no-email queue.')
      return
    }

    setSendingEmails(true)
    setMessage('')
    setError('')

    try {
      const summary = await sendLeadEmailCampaign({ senderEmail, leadIds })
      const deliveryText = summary.providerConfigured
        ? `${formatNumber(summary.sent)} sent, ${formatNumber(summary.failed)} failed`
        : `${formatNumber(summary.queued)} queued because no email provider is configured`
      const providerError = summary.errors?.[0]?.message ? ` Provider message: ${summary.errors[0].message}` : ''

      setMessage(`${deliveryText}. ${formatNumber(summary.skipped)} skipped by missing/suppressed email or do-not-contact status.${providerError}`)
      await loadQueue()
    } catch (sendError) {
      setError(sendError.message || 'Unable to send lead emails.')
    } finally {
      setSendingEmails(false)
    }
  }

  return (
    <div className="admin-assignment-card">
      <div className="admin-assignment-header">
        <div>
          <p className="admin-assignment-eyebrow">Field assignments</p>
          <h2>No-Email Leads</h2>
          <p>Find contacts with business/domain or parcel-owner enrichment, then assign leads with no email or phone to field employees.</p>
        </div>
        <div className="admin-assignment-header-actions">
          <button type="button" onClick={sendMailsToAll} disabled={sendingEmails || !senderEmail}>
            {sendingEmails ? 'Sending...' : 'Send Mails To All'}
          </button>
          <button type="button" onClick={findContactsForAll} disabled={loading || bulkFinding || !tickets.length}>
            {bulkFinding ? 'Finding...' : 'Find Contacts For All'}
          </button>
          <button type="button" onClick={loadQueue} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="admin-assignment-controls">
        <label>
          <span>Ground employee</span>
          <select
            value={selectedEmployeeId}
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
            disabled={!employees.length}
          >
            {employees.length ? null : <option value="">No active employees</option>}
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} - {employee.email}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-assignment-count">
          <strong>{formatNumber(tickets.length)}</strong>
          <span>unassigned no-email leads</span>
        </div>
      </div>

      {message ? <p className="admin-assignment-message">{message}</p> : null}
      {error ? <p className="admin-assignment-error">{error}</p> : null}
      {bulkProgress ? (
        <p className="admin-crm-progress">
          Checking {formatNumber(bulkProgress.current)} of {formatNumber(bulkProgress.total)}: {bulkProgress.address}
        </p>
      ) : null}

      {!loading && !tickets.length ? (
        <div className="admin-assignment-empty">
          <p>No no-email tickets need assignment.</p>
          <span>Save scanned leads first; any lead without email or phone creates a field ticket.</span>
        </div>
      ) : null}

      <div className={`admin-assignment-list ${loading ? 'admin-assignment-list-loading' : 'admin-assignment-list-ready'}`}>
        {loading ? (
          <AssignmentLoadingState />
        ) : tickets.slice(0, 8).map((ticket, index) => {
          const lead = ticket.lead
          const assessment = ticket.assessment

          return (
            <div className="admin-assignment-item" key={ticket.id} style={{ '--ticket-index': index }}>
              <div className="admin-assignment-item-main">
                <p>Score {formatNumber(lead?.lead_score ?? 0)} - {lead?.priority || 'Low'}</p>
                <h3>{formatAddress(lead)}</h3>
                <div>
                  <span>{lead?.owner_name || lead?.parcel?.owner_name || 'owner needed'}</span>
                  <span>{formatNumber(assessment?.max_panels ?? 0)} panels</span>
                  <span>{formatCurrency(assessment?.annual_savings ?? 0)} annual savings</span>
                  <span>{lead?.phone || 'phone needed'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => assignTicket(ticket)}
                disabled={!selectedEmployeeId || assigningTicketId === ticket.id}
              >
                {assigningTicketId === ticket.id ? 'Assigning...' : 'Assign'}
              </button>
              <button
                type="button"
                className="admin-assignment-secondary"
                onClick={() => enrichTicket(ticket)}
                disabled={enrichingTicketId === ticket.id || bulkFinding}
              >
                {enrichingTicketId === ticket.id ? 'Checking...' : 'Find Contact'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AdminFieldAssignments
