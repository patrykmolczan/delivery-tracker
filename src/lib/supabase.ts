/**
 * supabase.ts — AWS migration shim
 *
 * @supabase/supabase-js is no longer used. The Supabase client has been
 * decommissioned per company policy (full AWS-native stack).
 *
 * This file re-exports auth helpers from cognitoAuth so that existing
 * `import { getAuthHeaders } from './supabase'` calls continue to resolve
 * without requiring mass import updates across every file.
 *
 * Do NOT add Supabase client creation back here.
 */

export { getAuthHeaders } from './cognitoAuth'

/**
 * Legacy no-op — kept so any stray import of ensureFreshSession doesn't break.
 * @deprecated Use getAuthHeaders() instead.
 */
export async function ensureFreshSession(): Promise<null> {
  return null
}
