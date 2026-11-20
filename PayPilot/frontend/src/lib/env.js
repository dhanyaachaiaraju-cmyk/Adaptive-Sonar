// Centralised, validated access to public (VITE_) environment variables.
// Never read import.meta.env directly elsewhere in the app.

const raw = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
}

const required = {
  VITE_SUPABASE_URL: raw.supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: raw.supabasePublishableKey,
}

export const missingEnvVars = Object.entries(required)
  .filter(([, value]) => !value || String(value).includes('your-'))
  .map(([name]) => name)

export const isEnvConfigured = missingEnvVars.length === 0

export const env = Object.freeze({
  ...raw,
  apiBaseUrl: raw.apiBaseUrl.replace(/\/+$/, ''),
})
