import { createClient } from '@supabase/supabase-js'

let serverClient = null

export function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error('Missing SUPABASE_URL/SUPABASE_ANON_KEY or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.')
    error.status = 500
    error.code = 'SUPABASE_SERVER_CONFIG_MISSING'
    throw error
  }

  return { supabaseUrl, supabaseAnonKey }
}

export function getSupabaseServerClient() {
  if (!serverClient) {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig()
    serverClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return serverClient
}

export function createSupabaseUserClient(accessToken) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig()

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}
