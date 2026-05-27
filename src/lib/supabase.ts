/**
 * auth-shim.ts (published as supabase.ts for import-path compatibility)
 *
 * Re-exports auth helpers from cognitoAuth so that existing
 * `import { getAuthHeaders } from './supabase'` call sites continue to
 * resolve without requiring a mass import rename across every file.
 *
 * Do NOT add any third-party auth client here — all auth goes through
 * cognitoAuth.ts (AWS Cognito).
 */

export { getAuthHeaders } from './cognitoAuth'

/**
 * Legacy no-op — retained so any stray import of ensureFreshSession compiles.
 * @deprecated Use getAuthHeaders() instead.
 */
export async function ensureFreshSession(): Promise<null> {
  return null
}
