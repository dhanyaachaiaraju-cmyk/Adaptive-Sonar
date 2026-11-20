import { env } from './env'
import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function getAccessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Fetch wrapper for the PayPilot backend.
 * - Attaches the current Supabase access token as a Bearer token.
 * - Serialises JSON bodies, parses JSON responses.
 * - Normalises backend errors ({ error: { code, message, details } }) into ApiError.
 */
export async function apiRequest(path, { method = 'GET', body, headers = {}, signal, auth = true } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers }

  if (auth) {
    const token = await getAccessToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  let payload = body
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, { method, headers: finalHeaders, body: payload, signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Unable to reach the PayPilot server.', { status: 0, code: 'network_error' })
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json().catch(() => null) : null

  if (!response.ok) {
    const err = data?.error ?? {}
    throw new ApiError(err.message || `Request failed (${response.status})`, {
      status: response.status,
      code: err.code,
      details: err.details,
    })
  }

  return data
}

export const api = {
  get: (path, opts) => apiRequest(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => apiRequest(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => apiRequest(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => apiRequest(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => apiRequest(path, { ...opts, method: 'DELETE' }),
}
