/**
 * Client for the Adaptive Sonar FastAPI backend (/api/v1, proxied by Vite).
 * Normalises the backend's error envelope: { error: { code, message, details } }.
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

const BASE = '/api/v1'
const TIMEOUT_MS = 6000

export async function apiRequest<T>(
  path: string,
  {
    method = 'GET',
    body,
    signal,
    timeoutMs = TIMEOUT_MS,
  }: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  signal?.addEventListener('abort', () => controller.abort())

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Unable to reach the simulation backend.')
  } finally {
    window.clearTimeout(timer)
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json().catch(() => null) : null
  if (!response.ok) {
    if (!isJson && response.status >= 500)
      throw new ApiError(response.status, 'backend_unavailable', 'The simulation backend is not running.')
    const error = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
    let message = error?.message ?? `Request failed (${response.status}).`
    if (error?.code === 'validation_error' && Array.isArray(error.details) && error.details[0]?.msg)
      message = String(error.details[0].msg).replace(/^Value error, /, '')
    throw new ApiError(response.status, error?.code ?? 'request_failed', message, error?.details)
  }
  return data as T
}
