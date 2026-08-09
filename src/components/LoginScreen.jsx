import { useState } from 'react'
import { isSupabaseConfigured } from '../services/supabaseClient.js'

function LoginScreen({ onLogin, authError, theme, onToggleTheme }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submitLogin = async (event) => {
    event.preventDefault()

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }

    if (!email.trim()) {
      setError('Email is required.')
      return
    }

    if (!password.trim()) {
      setError('Password is required.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await onLogin({
        email: email.trim(),
        password,
      })
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-shell" data-theme={theme}>
      <section className="login-panel">
        <div className="login-panel-top">
          <div className="app-brand app-brand-login">
            <img src="/LOGO.jpeg" alt="Stratton logo" />
            <div>
              <p className="login-eyebrow">STRATTON</p>
              <span>Solar CRM</span>
            </div>
          </div>
          <button type="button" className="theme-toggle theme-toggle-compact" onClick={onToggleTheme}>
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>

        <div>
          <h1 className="login-title">Sign in to continue</h1>
          <p className="login-copy">
            Admins manage leads and campaigns. Ground employees see assigned client visits and tickets.
          </p>
        </div>

        <div className="login-role-switch" aria-label="Available account roles">
          <span>Admin</span>
          <span>Ground Employee</span>
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="name@company.com"
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter password"
            />
          </label>

          {error ? <p className="login-error">{error}</p> : null}
          {authError ? <p className="login-error">{authError}</p> : null}

          <button type="submit" className="login-submit" disabled={submitting || !isSupabaseConfigured}>
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="login-note">
          Your role is loaded from the database profile after login.
        </p>
      </section>
    </main>
  )
}

export default LoginScreen
