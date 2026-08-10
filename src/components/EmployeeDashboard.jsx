import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAssignedTickets, updateAssignedTicket } from '../services/dashboardService.js'
import { formatCurrency, formatNumber, formatPercentage } from '../utils/solarInsights.js'
import { LogoutIcon } from './HeaderActionIcons.jsx'

const TAB_TRANSITION_MS = 260
const TAB_REVEAL_DELAY_MS = 90

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'visited', label: 'Visited' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'closed', label: 'Closed' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

const TICKET_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'closed', label: 'Closed' },
]

function formatAddress(lead) {
  if (!lead) {
    return 'Lead details unavailable'
  }

  return [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ')
}

function getStatusLabel(status) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function getPriorityClass(priority) {
  if (priority === 'Hot') return 'employee-priority employee-priority-hot'
  if (priority === 'High') return 'employee-priority employee-priority-high'
  if (priority === 'Medium') return 'employee-priority employee-priority-medium'
  return 'employee-priority'
}

function isFollowUpTicket(ticket) {
  return ticket.status === 'follow_up' || Boolean(ticket.next_follow_up_at)
}

function getTicketTab(ticket) {
  if (ticket.status === 'pending') return 'pending'
  if (isFollowUpTicket(ticket)) return 'follow_up'
  return 'closed'
}

function EmployeeStat({ label, value, hint }) {
  return (
    <div className="employee-stat">
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  )
}

function TicketCard({ ticket, isActive, onSelect, index }) {
  const lead = ticket.lead

  return (
    <button
      type="button"
      className={`employee-ticket-card ${isActive ? 'employee-ticket-card-active' : ''}`}
      onClick={() => onSelect(ticket.id)}
      style={{ '--ticket-index': index }}
      aria-pressed={isActive}
    >
      <div className="employee-ticket-card-header">
        <div>
          <p className="employee-ticket-kicker">Score {formatNumber(lead?.lead_score ?? 0)}</p>
          <h3>{formatAddress(lead)}</h3>
        </div>
        <span className={getPriorityClass(lead?.priority)}>{lead?.priority || 'Low'}</span>
      </div>
      <div className="employee-ticket-meta">
        <span>{getStatusLabel(ticket.status)}</span>
        <span>{lead?.phone || 'Phone needed'}</span>
        {ticket.next_follow_up_at ? (
          <span>Follow up {new Date(ticket.next_follow_up_at).toLocaleDateString('en-US')}</span>
        ) : null}
      </div>
    </button>
  )
}

function EmployeeTicketsLoadingState({ label = 'tickets' }) {
  return (
    <div className="admin-crm-loading employee-ticket-loading">
      <div className="admin-crm-loading-ring" aria-hidden="true" />
      <div className="admin-crm-loading-copy">
        <strong>Loading {label.toLowerCase()}</strong>
        <span>Preparing assigned visits...</span>
      </div>
      <div className="admin-crm-loading-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  )
}

function EmployeeDetailsLoadingState({ label = 'tickets' }) {
  return (
    <section className="employee-details employee-details-loading" aria-live="polite" aria-busy="true">
      <div className="admin-crm-loading employee-details-loader">
        <div className="admin-crm-loading-ring" aria-hidden="true" />
        <div className="admin-crm-loading-copy">
          <strong>Loading client details</strong>
          <span>Opening {label.toLowerCase()} client records...</span>
        </div>
        <div className="admin-crm-loading-bar" aria-hidden="true">
          <span />
        </div>
      </div>
      <div className="employee-details-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </section>
  )
}

function getSavedTicketFormValues(ticket) {
  return {
    note: ticket?.notes ?? '',
    email: ticket?.lead?.email ?? '',
    phone: ticket?.lead?.phone ?? '',
  }
}

function TicketDetails({ ticket, onUpdated }) {
  const savedValues = getSavedTicketFormValues(ticket)
  const [status, setStatus] = useState(ticket?.status ?? 'pending')
  const [note, setNote] = useState(savedValues.note)
  const [collectedEmail, setCollectedEmail] = useState(savedValues.email)
  const [collectedPhone, setCollectedPhone] = useState(savedValues.phone)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  if (!ticket) {
    return (
      <section className="employee-details employee-details-ready employee-empty-state">
        <p className="employee-eyebrow">Client details</p>
        <h2>Select a ticket</h2>
        <p>Assigned client visits will appear here after an admin assigns tickets to your profile.</p>
      </section>
    )
  }

  const lead = ticket.lead
  const assessment = ticket.assessment

  const submitUpdate = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      await updateAssignedTicket({
        ticketId: ticket.id,
        leadId: ticket.lead_id,
        status,
        note,
        collectedEmail,
        collectedPhone,
      })
      setMessage('Ticket updated.')
      await onUpdated()
    } catch (error) {
      setMessage(error.message || 'Unable to update ticket.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="employee-details employee-details-ready">
      <div className="employee-details-header">
        <div>
          <p className="employee-eyebrow">Client details</p>
          <h2>{lead?.business_name || lead?.owner_name || 'Potential Client'}</h2>
        </div>
        <span className={getPriorityClass(lead?.priority)}>{lead?.priority || 'Low'}</span>
      </div>

      <div className="employee-info-grid">
        <EmployeeStat label="Address" value={formatAddress(lead)} />
        <EmployeeStat label="Phone" value={lead?.phone || 'Collect in person'} />
        <EmployeeStat label="Email" value={lead?.email || 'Not found online'} />
        <EmployeeStat label="Lead Score" value={formatNumber(lead?.lead_score ?? 0)} hint={lead?.status} />
      </div>

      <div className="employee-info-grid employee-solar-grid">
        <EmployeeStat label="Max Panels" value={formatNumber(assessment?.max_panels ?? 0)} />
        <EmployeeStat label="Annual Energy" value={`${formatNumber(assessment?.annual_energy_kwh ?? 0)} kWh`} />
        <EmployeeStat label="Annual Savings" value={formatCurrency(assessment?.annual_savings ?? 0)} />
        <EmployeeStat label="ROI" value={formatPercentage(assessment?.roi ?? 0)} />
      </div>

      <form className="employee-update-form" onSubmit={submitUpdate}>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Collected email</span>
          <input
            type="email"
            value={collectedEmail}
            onChange={(event) => setCollectedEmail(event.target.value)}
            placeholder="client@example.com"
          />
        </label>

        <label>
          <span>Collected phone</span>
          <input
            type="tel"
            value={collectedPhone}
            onChange={(event) => setCollectedPhone(event.target.value)}
            placeholder="Phone from field visit"
          />
        </label>

        <label>
          <span>Visit notes</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add what happened with this client visit"
            rows={5}
          />
        </label>

        {ticket.notes ? (
          <div className="employee-existing-note">
            <p>Current ticket note</p>
            <span>{ticket.notes}</span>
          </div>
        ) : null}

        {message ? <p className="employee-form-message">{message}</p> : null}

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Update Ticket'}
        </button>
      </form>
    </section>
  )
}

function EmployeeDashboard({ currentUser, onSignOut, theme, onToggleTheme }) {
  const [tickets, setTickets] = useState([])
  const [activeTicketId, setActiveTicketId] = useState(null)
  const [activeTicketTab, setActiveTicketTab] = useState('pending')
  const [renderedTicketTab, setRenderedTicketTab] = useState('pending')
  const [tabTransitioning, setTabTransitioning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const ticketGroupsRef = useRef({
    pending: [],
    follow_up: [],
    closed: [],
  })
  const tabTransitionTimerRef = useRef(null)
  const tabRevealTimerRef = useRef(null)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const assignedTickets = await fetchAssignedTickets(currentUser.id)
      setTickets(assignedTickets)
      setActiveTicketId((currentActiveId) => (
        assignedTickets.some((ticket) => ticket.id === currentActiveId)
          ? currentActiveId
          : assignedTickets[0]?.id ?? null
      ))
    } catch (loadError) {
      setTickets([])
      setError(loadError.message || 'Unable to load employee dashboard.')
    } finally {
      setLoading(false)
    }
  }, [currentUser.id])

  useEffect(() => {
    let active = true

    const loadInitialTickets = async () => {
      try {
        const assignedTickets = await fetchAssignedTickets(currentUser.id)

        if (!active) {
          return
        }

        setTickets(assignedTickets)
        setActiveTicketId((currentActiveId) => (
          assignedTickets.some((ticket) => ticket.id === currentActiveId)
            ? currentActiveId
            : assignedTickets[0]?.id ?? null
        ))
      } catch (loadError) {
        if (!active) {
          return
        }

        setTickets([])
        setError(loadError.message || 'Unable to load employee dashboard.')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadInitialTickets()

    return () => {
      active = false
    }
  }, [currentUser.id])

  const ticketGroups = useMemo(() => tickets.reduce((groups, ticket) => {
    groups[getTicketTab(ticket)].push(ticket)
    return groups
  }, {
    pending: [],
    follow_up: [],
    closed: [],
  }), [tickets])

  useEffect(() => {
    ticketGroupsRef.current = ticketGroups
  }, [ticketGroups])

  useEffect(() => () => {
    window.clearTimeout(tabTransitionTimerRef.current)
    window.clearTimeout(tabRevealTimerRef.current)
  }, [])

  const handleTicketTabChange = useCallback((nextTab) => {
    if (nextTab === activeTicketTab && !tabTransitioning) {
      return
    }

    window.clearTimeout(tabTransitionTimerRef.current)
    window.clearTimeout(tabRevealTimerRef.current)
    setActiveTicketTab(nextTab)
    setTabTransitioning(true)

    tabTransitionTimerRef.current = window.setTimeout(() => {
      const nextTickets = ticketGroupsRef.current[nextTab] ?? []

      setRenderedTicketTab(nextTab)
      setActiveTicketId(nextTickets[0]?.id ?? null)

      tabRevealTimerRef.current = window.setTimeout(() => {
        setTabTransitioning(false)
      }, TAB_REVEAL_DELAY_MS)
    }, TAB_TRANSITION_MS)
  }, [activeTicketTab, tabTransitioning])

  const visibleTickets = useMemo(
    () => ticketGroups[renderedTicketTab] ?? [],
    [renderedTicketTab, ticketGroups],
  )

  const selectedTicketId = visibleTickets.some((ticket) => ticket.id === activeTicketId)
    ? activeTicketId
    : visibleTickets[0]?.id ?? null

  const activeTicket = useMemo(
    () => visibleTickets.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, visibleTickets],
  )

  const stats = useMemo(() => {
    return {
      pendingTickets: ticketGroups.pending.length,
      followUpTickets: ticketGroups.follow_up.length,
      closedTickets: ticketGroups.closed.length,
    }
  }, [ticketGroups])

  const activeTabLabel = TICKET_TABS.find((tab) => tab.value === activeTicketTab)?.label ?? 'Tickets'
  const ticketAreaLoading = loading || tabTransitioning

  return (
    <main className="employee-dashboard page-transition page-transition-dashboard" data-theme={theme}>
      <header className="employee-topbar">
        <div>
          <div className="app-brand app-brand-header">
            <img src="/LOGO.jpeg" alt="Stratton logo" />
            <div>
              <p>STRATTON</p>
              <span>Agent dashboard</span>
            </div>
          </div>
          <h1>Assigned Client Visits</h1>
        </div>
        <div className="employee-user-card">
          <div>
            <strong>{currentUser.name}</strong>
            <span>{currentUser.email}</span>
          </div>
          <button
            type="button"
            className="theme-toggle theme-toggle-compact"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span className="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="icon-action-button"
            aria-label="Logout"
            title="Logout"
          >
            <LogoutIcon />
          </button>
        </div>
      </header>

      <section className="employee-summary-grid">
        <EmployeeStat label="Assigned Tickets" value={formatNumber(tickets.length)} />
        <EmployeeStat label="Pending" value={formatNumber(stats.pendingTickets)} />
        <EmployeeStat label="Follow Up" value={formatNumber(stats.followUpTickets)} />
        <EmployeeStat label="Closed" value={formatNumber(stats.closedTickets)} />
      </section>

      {error ? <p className="employee-error">{error}</p> : null}

      <div className="employee-dashboard-grid">
        <section className="employee-ticket-list">
          <div className="employee-section-heading">
            <div>
              <p className="employee-eyebrow">Field queue</p>
              <h2>My Tickets</h2>
            </div>
            <button type="button" onClick={loadTickets} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className="employee-ticket-tabs" role="tablist" aria-label="Ticket status tabs">
            {TICKET_TABS.map((tab) => (
              <button
                type="button"
                key={tab.value}
                role="tab"
                aria-selected={activeTicketTab === tab.value}
                className={`employee-ticket-tab ${activeTicketTab === tab.value ? 'employee-ticket-tab-active' : ''}`}
                onClick={() => handleTicketTabChange(tab.value)}
                disabled={ticketAreaLoading}
              >
                <span>{tab.label}</span>
                <strong>{formatNumber(ticketGroups[tab.value]?.length ?? 0)}</strong>
              </button>
            ))}
          </div>

          {!ticketAreaLoading && !tickets.length ? (
            <div className="employee-empty-state">
              <p>No assigned tickets yet.</p>
              <span>Ask an admin to assign no-email leads to this agent account.</span>
            </div>
          ) : null}

          {!ticketAreaLoading && tickets.length > 0 && !visibleTickets.length ? (
            <div className="employee-empty-state">
              <p>No {activeTabLabel.toLowerCase()} tickets.</p>
              <span>Switch tabs to review other assigned client visits.</span>
            </div>
          ) : null}

          <div
            key={ticketAreaLoading ? `loading-${activeTicketTab}` : renderedTicketTab}
            className={`employee-ticket-stack ${ticketAreaLoading ? 'employee-ticket-stack-loading' : 'employee-ticket-stack-ready'}`}
          >
            {ticketAreaLoading ? (
              <EmployeeTicketsLoadingState label={activeTabLabel} />
            ) : visibleTickets.map((ticket, index) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  index={index}
                  isActive={ticket.id === selectedTicketId}
                  onSelect={setActiveTicketId}
                />
            ))}
          </div>
        </section>

        {ticketAreaLoading ? (
          <EmployeeDetailsLoadingState label={activeTabLabel} />
        ) : (
          <TicketDetails
            key={activeTicket ? `${activeTicket.id}-${activeTicket.status}-${activeTicket.updated_at}` : 'no-ticket'}
            ticket={activeTicket}
            onUpdated={loadTickets}
          />
        )}
      </div>
    </main>
  )
}

export default EmployeeDashboard
