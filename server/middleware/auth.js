import { createSupabaseUserClient, getSupabaseServerClient } from '../services/supabaseServer.js'

function getBearerToken(request) {
  const header = request.headers.authorization ?? ''
  const [scheme, token] = header.split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

export async function requireUser(request, response, next) {
  try {
    const token = getBearerToken(request)

    if (!token) {
      response.status(401).json({
        error: 'Authentication is required.',
        code: 'AUTH_REQUIRED',
      })
      return
    }

    const supabase = getSupabaseServerClient()
    const { data: userData, error: userError } = await supabase.auth.getUser(token)

    if (userError || !userData?.user?.id) {
      response.status(401).json({
        error: 'Invalid or expired session.',
        code: 'AUTH_INVALID',
        reason: userError?.message || 'No authenticated user returned.',
      })
      return
    }

    const userSupabase = createSupabaseUserClient(token)
    const { data: profile, error: profileError } = await userSupabase
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    if (!profile || profile.status !== 'active') {
      response.status(403).json({
        error: 'This account is not active.',
        code: 'USER_INACTIVE',
      })
      return
    }

    request.user = {
      id: userData.user.id,
      email: profile.email || userData.user.email,
      name: profile.full_name,
      role: profile.role,
    }
    request.accessToken = token

    next()
  } catch (error) {
    next(error)
  }
}

export function requireAdmin(request, response, next) {
  if (request.user?.role !== 'admin') {
    response.status(403).json({
      error: 'Admin access is required.',
      code: 'ADMIN_REQUIRED',
    })
    return
  }

  next()
}
