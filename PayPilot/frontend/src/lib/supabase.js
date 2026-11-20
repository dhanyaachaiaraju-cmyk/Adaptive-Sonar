import { createClient } from '@supabase/supabase-js'
import { env, isEnvConfigured } from './env'

// Browser Supabase client. Uses only the publishable (anon) key; all data
// access from the browser is constrained by Row Level Security policies.
export const supabase = isEnvConfigured
  ? createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
