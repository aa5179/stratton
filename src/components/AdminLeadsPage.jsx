import { useState } from 'react'
import AdminCrmPanel from './AdminCrmPanel.jsx'
import AdminFieldAssignments from './AdminFieldAssignments.jsx'
import { LogoutIcon } from './HeaderActionIcons.jsx'

function AdminLeadsPage({ currentUser, onBackToMap, onSignOut, theme, onToggleTheme }) {
  const [activeTab, setActiveTab] = useState('leads')
  const [senderEmail, setSenderEmail] = useState(currentUser.email || '')

  return (
    <main className="admin-leads-page page-transition page-transition-dashboard" data-theme={theme}>
      <header className="admin-leads-topbar">
        <div>
          <div className="app-brand app-brand-header">
            <img src="/LOGO.jpeg" alt="Stratton logo" />
            <div>
              <p>STRATTON</p>
              <span>Admin CRM</span>
            </div>
          </div>
          <h1>Leads & Campaigns</h1>
          <p>Manage saved leads, contact discovery, suppression list, exports, and direct property-specific outreach.</p>
        </div>
        <div className="admin-leads-actions">
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
          <button type="button" onClick={onBackToMap}>Map</button>
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

      <section className="admin-leads-content">
        <label className="admin-mail-sender">
          <span>Send mails from</span>
          <input
            type="email"
            value={senderEmail}
            onChange={(event) => setSenderEmail(event.target.value)}
            placeholder="sales@yourcompany.com"
          />
        </label>

        <div className="admin-leads-tabs">
          <button
            type="button"
            onClick={() => setActiveTab('leads')}
            className={activeTab === 'leads' ? 'admin-leads-tab-active' : ''}
          >
            High Score Leads
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('field')}
            className={activeTab === 'field' ? 'admin-leads-tab-active' : ''}
          >
            No-Email Queue
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('low')}
            className={activeTab === 'low' ? 'admin-leads-tab-active' : ''}
          >
            Low Score Leads
          </button>
        </div>

        <div key={activeTab} className="admin-tab-stage">
          {activeTab === 'leads' ? (
            <AdminCrmPanel
              currentUser={currentUser}
              senderEmail={senderEmail}
              listLimit={100}
              minScore={65}
              title="High Score Leads"
              description="Automatically find contacts for the strongest solar opportunities, then send property-specific outreach to verified emails."
              showBulkContactFinder
            />
          ) : null}

          {activeTab === 'field' ? (
            <AdminFieldAssignments currentUser={currentUser} senderEmail={senderEmail} />
          ) : null}

          {activeTab === 'low' ? (
            <AdminCrmPanel
              currentUser={currentUser}
              senderEmail={senderEmail}
              listLimit={100}
              maxScore={64}
              title="Low Score Leads"
              description="Lower-priority leads are separated here so admins can review, export, or manually qualify them without slowing down the main queue."
              showBulkContactFinder
            />
          ) : null}
        </div>
      </section>
    </main>
  )
}

export default AdminLeadsPage
