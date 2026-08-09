import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAssignedTickets, updateAssignedTicket } from '../services/dashboardService.js'
import { formatCurrency, formatNumber, formatPercentage } from '../utils/solarInsights.js'

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

function EmployeeStat({ label, value, hint }) {
  return (
    <div className="employee-stat">
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  )
}

function TicketCard({ ticket, isActive, onSelect }) {
  const lead = ticket.lead

  return (
    <button
      type="button"
      className={`employee-ticket-card ${isActive ? 'employee-ticket-card-active' : ''}`}
      onClick={() => onSelect(ticket.id)}
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
      </div>
    </button>
  )
}

function TicketDetails({ ticket, onUpdated }) {
  const [status, setStatus] = useState(ticket?.status ?? 'pending')
  const [note, setNote] = useState('')
  const [collectedEmail, setCollectedEmail] = useState('')
  const [collectedPhone, setCollectedPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  if (!ticket) {
    return (
      <section className="employee-details employee-empty-state">
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
      setNote('')
      setCollectedEmail('')
      setCollectedPhone('')
      await onUpdated()
    } catch (error) {
      setMessage(error.message || 'Unable to update ticket.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="employee-details">
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const activeTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === activeTicketId) ?? null,
    [activeTicketId, tickets],
  )

  const stats = useMemo(() => {
    const openTickets = tickets.filter((ticket) => !['closed', 'won', 'lost'].includes(ticket.status)).length
    const contactedTickets = tickets.filter((ticket) => ['contacted', 'follow_up', 'won'].includes(ticket.status)).length
    const averageScore = tickets.length
      ? tickets.reduce((sum, ticket) => sum + (ticket.lead?.lead_score ?? 0), 0) / tickets.length
      : 0

    return { openTickets, contactedTickets, averageScore }
  }, [tickets])

  return (
    <main className="employee-dashboard page-transition page-transition-dashboard" data-theme={theme}>
      <header className="employee-topbar">
        <div>
          <div className="app-brand app-brand-header">
            <img src="/LOGO.jpeg" alt="Stratton logo" />
            <div>
              <p>STRATTON</p>
              <span>Ground employee dashboard</span>
            </div>
          </div>
          <h1>Assigned Client Visits</h1>
        </div>
        <div className="employee-user-card">
          <div>
            <strong>{currentUser.name}</strong>
            <span>{currentUser.email}</span>
          </div>
          <button type="button" onClick={onToggleTheme}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
          <button type="button" onClick={onSignOut}>Logout</button>
        </div>
      </header>

      <section className="employee-summary-grid">
        <EmployeeStat label="Assigned Tickets" value={formatNumber(tickets.length)} />
        <EmployeeStat label="Open Visits" value={formatNumber(stats.openTickets)} />
        <EmployeeStat label="Contacted" value={formatNumber(stats.contactedTickets)} />
        <EmployeeStat label="Average Score" value={formatNumber(stats.averageScore, 1)} />
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

          {loading ? (
            <div className="employee-empty-state">
              <p>Loading assigned tickets...</p>
            </div>
          ) : null}

          {!loading && !tickets.length ? (
            <div className="employee-empty-state">
              <p>No assigned tickets yet.</p>
              <span>Ask an admin to assign no-email leads to this ground employee account.</span>
            </div>
          ) : null}

          <div className="employee-ticket-stack">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                isActive={ticket.id === activeTicketId}
                onSelect={setActiveTicketId}
              />
            ))}
          </div>
        </section>

        <TicketDetails
          key={activeTicket ? `${activeTicket.id}-${activeTicket.status}` : 'no-ticket'}
          ticket={activeTicket}
          onUpdated={loadTickets}
        />
      </div>
    </main>
  )
}

export default EmployeeDashboard
