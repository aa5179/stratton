import { isSupabaseConfigured, supabase } from './supabaseClient.js'

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
}

function mapProfile(session, profile) {
  const user = session?.user

  if (!user || !profile) {
    return null
  }

  return {
    id: user.id,
    email: profile.email || user.email,
    name: profile.full_name || user.email,
    role: profile.role,
    status: profile.status,
    loggedInAt: new Date().toISOString(),
  }
}

export async function fetchCurrentProfile(session) {
  assertSupabaseConfigured()

  if (!session?.user?.id) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status')
    .eq('id', session.user.id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Unable to load user profile.')
  }

  if (!data) {
    throw new Error('Login succeeded, but no profile row exists for this user.')
  }

  if (data.status !== 'active') {
    throw new Error('This user is inactive. Ask an admin to reactivate the account.')
  }

  return mapProfile(session, data)
}

export async function getCurrentUserProfile() {
  assertSupabaseConfigured()

  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw new Error(error.message || 'Unable to read current session.')
  }

  if (!data.session) {
    return null
  }

  return fetchCurrentProfile(data.session)
}

export async function signInWithEmail({ email, password }) {
  assertSupabaseConfigured()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message || 'Unable to sign in.')
  }

  return fetchCurrentProfile(data.session)
}

export async function signOut() {
  assertSupabaseConfigured()

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(error.message || 'Unable to sign out.')
  }
}

export function onAuthChange(callback) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {}
  }

  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) {
      callback(null, null)
      return
    }

    try {
      const profile = await fetchCurrentProfile(session)
      callback(profile, null)
    } catch (error) {
      callback(null, error)
    }
  })

  return () => data.subscription.unsubscribe()
}
