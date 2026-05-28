/**
 * splitStorage.ts
 * Custom Cognito storage adapter (implements ICognitoStorage).
 *
 * AUTH-1 Sprint N (complete): access/ID tokens → sessionStorage.
 * AUTH-1 Sprint N+1 (this change): refresh token and LastAuthUser are no
 * longer written to localStorage at all. The refresh token is issued as an
 * HttpOnly Secure cookie by the /api/session Lambda. LastAuthUser is kept
 * in sessionStorage so the Cognito SDK can look up the right key prefix —
 * session-scoped is fine because /api/session handles cross-tab renewal.
 *
 * Storage routing after N+1:
 *   sessionStorage → idToken, accessToken, clockDrift, LastAuthUser
 *   HttpOnly cookie → refreshToken  (written by /api/session Lambda)
 *   localStorage   → nothing Cognito-related
 *
 * The getItem() method returns null for refreshToken keys so the Cognito SDK
 * falls through to its own token-refresh path, which we intercept by
 * overriding refreshSession() in cognitoAuth.ts to call /api/session instead.
 */

// All Cognito keys go to sessionStorage. The refresh token key is intercepted
// at the cognitoAuth layer — the SDK never writes it here.
const BLOCK_FROM_STORAGE = ['.refreshToken']

function isBlocked(key: string): boolean {
  return BLOCK_FROM_STORAGE.some(suffix => key.endsWith(suffix))
}

class SplitCognitoStorage {
  setItem(key: string, value: string): void {
    // Block refresh token — it lives in the HttpOnly cookie only
    if (isBlocked(key)) return
    try {
      sessionStorage.setItem(key, value)
    } catch {
      // Safari private-mode / storage-quota — degrade silently
    }
  }

  getItem(key: string): string | null {
    // Return null for refreshToken — signals the SDK to use its refresh path,
    // which we intercept in cognitoAuth.refreshSession()
    if (isBlocked(key)) return null
    try {
      return sessionStorage.getItem(key)
    } catch {
      return null
    }
  }

  removeItem(key: string): void {
    if (isBlocked(key)) return
    try {
      sessionStorage.removeItem(key)
      // Also sweep localStorage in case any legacy data remains from Sprint N
      localStorage.removeItem(key)
    } catch {
      // Safari private-mode safe
    }
  }

  /**
   * Called by the Cognito SDK on signOut(). Clears all Cognito session keys.
   * The HttpOnly cookie is cleared separately via POST /api/session { action: 'clear' }
   * in AuthContext.signOut().
   */
  clear(): void {
    try {
      const prefix = 'CognitoIdentityServiceProvider'
      ;[...Object.keys(sessionStorage)]
        .filter(k => k.startsWith(prefix))
        .forEach(k => sessionStorage.removeItem(k))
      // Also sweep localStorage for any Sprint N legacy data
      ;[...Object.keys(localStorage)]
        .filter(k => k.startsWith(prefix))
        .forEach(k => localStorage.removeItem(k))
    } catch {
      // Safari private-mode safe
    }
  }
}

export const splitStorage = new SplitCognitoStorage()
