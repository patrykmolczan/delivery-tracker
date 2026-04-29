import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,        // Keep session across refreshes via localStorage
    autoRefreshToken: true,      // Silently refresh tokens in the background
    detectSessionInUrl: false,   // Not using OAuth redirects, skip URL parsing
    storageKey: 'delivery-tracker-auth', // Namespaced key to avoid conflicts
  },
})
