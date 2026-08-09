import { isSupabaseConfigured, supabase } from './supabaseClient.js'

async function getAccessToken({ forceRefresh = false } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Sign in is required for API access.')
  }

  if (forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession()

    if (error || !data.session?.access_token) {
      throw new Error(error?.message || 'Your session expired. Please sign in again.')
    }

    return data.session.access_token
  }

  const { data, error } = await supabase.auth.getSession()

  if (error || !data.session?.access_token) {
    throw new Error(error?.message || 'Your session expired. Please sign in again.')
  }

  return data.session.access_token
}

async function buildHeaders(options, authOptions = {}) {
  const accessToken = await getAccessToken(authOptions)

  return {
    ...(options.headers ?? {}),
    Authorization: `Bearer ${accessToken}`,
  }
}

export async function apiFetch(url, options = {}) {
  const firstHeaders = await buildHeaders(options)
  const firstResponse = await fetch(url, {
    ...options,
    headers: firstHeaders,
  })

  if (firstResponse.status !== 401) {
    return firstResponse
  }

  const retryHeaders = await buildHeaders(options, { forceRefresh: true })

  return fetch(url, {
    ...options,
    headers: retryHeaders,
  })
}
