import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  signIn as cognitoSignIn,
  signOut as cognitoSignOut,
  getSession,
  COGNITO_CONFIG,
} from '../lib/cognitoAuth'
import type { UserProfile } from '../types'

// ── App-level user type (replaces @supabase/supabase-js User) ────────────────
// Only fields actually consumed by the app are included.
export interface AppUser {
  id: string
  email: string
  user_metadata: {
    sso_provider?: string   // 'entra' for SSO users (disables Change Password in App.tsx)
    full_name?: string
  }
}

interface AuthContextType {
  user: AppUser | null
  session: null                     // kept for interface compat — always null in Cognito world
  profile: UserProfile | null
  isAdmin: boolean
  isSuperAdmin: boolean
  passwordChangeRequired: boolean
  isPasswordRecovery: boolean       // always false — Cognito uses code-based reset flow
  clearPasswordRecovery: () => void // no-op — kept for compat
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithSSO: (domain: string) => Promise<{ error: Error | null }>
  signOut: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

// Decode a JWT payload without network verification (reads claims only)
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64))
  } catch {
    return {}
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const initialized = useRef(false)

  // ── Helpers ────────────────────────────────────────────────────────────────

  type CogUser = NonNullable<Awaited<ReturnType<typeof getSession>>>

  const buildAppUser = (cogUser: CogUser, profileData: UserProfile | null): AppUser => {
    const claims = decodeJwtPayload(cogUser.idToken)
    // Federated (SSO) users have an 'identities' claim in their Cognito ID token
    const isSSOUser = Array.isArray(claims.identities) && (claims.identities as unknown[]).length > 0
    return {
      id: cogUser.id,
      email: cogUser.email,
      user_metadata: {
        full_name: profileData?.full_name ?? cogUser.full_name ?? '',
        sso_provider: isSSOUser ? 'entra' : undefined,
      },
    }
  }

  const fetchProfileFromLambda = async (idToken: string): Promise<UserProfile | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      })
      if (res.ok) return await res.json()
    } catch { /* safe */ }
    return null
  }

  // ── Mount: initialize from existing Cognito session ────────────────────────

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      try {
        const cogUser = await getSession()
        if (cogUser) {
          const profileData = await fetchProfileFromLambda(cogUser.idToken)
          setProfile(profileData)
          setUser(buildAppUser(cogUser, profileData))
        }
      } catch { /* safe — unauthenticated state */ }
      setLoading(false)
    }

    void init()

    // Tab visibility: re-validate Cognito session when tab comes back into focus.
    // Catches expired sessions after device sleep / long inactivity.
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const cogUser = await getSession()
        if (!cogUser) {
          // Session expired while tab was in background — clean up and redirect
          cognitoSignOut()
          try {
            Object.keys(localStorage)
              .filter(k => k.startsWith('CognitoIdentityServiceProvider'))
              .forEach(k => localStorage.removeItem(k))
          } catch { /* Safari private-mode safe */ }
          window.location.href = '/'
        }
      } catch { /* safe */ }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // ── Auth actions ───────────────────────────────────────────────────────────

  const refreshProfile = async () => {
    try {
      const cogUser = await getSession()
      if (!cogUser) return
      const profileData = await fetchProfileFromLambda(cogUser.idToken)
      setProfile(profileData)
      if (profileData) setUser(buildAppUser(cogUser, profileData))
    } catch { /* safe */ }
  }

  const signIn = async (email: string, password: string): Promise<{ error: Error | null }> => {
    const { user: cogUser, error } = await cognitoSignIn(email, password)
    if (error || !cogUser) {
      return { error: new Error(error ?? 'Sign-in failed') }
    }
    const profileData = await fetchProfileFromLambda(cogUser.idToken)
    setProfile(profileData)
    setUser(buildAppUser(cogUser, profileData))
    return { error: null }
  }

  const signInWithSSO = async (_domain: string): Promise<{ error: Error | null }> => {
    try {
      const cognitoDomain = 'https://delivery-tracker-auth.auth.us-east-2.amazoncognito.com'
      const clientId = COGNITO_CONFIG.ClientId
      const redirectUri = encodeURIComponent(`${window.location.origin}/auth/callback`)
      window.location.href = `${cognitoDomain}/oauth2/authorize?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}&identity_provider=IAMIdentityCenter`
      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  }

  const signOut = () => {
    // 1. Clear React state immediately (synchronous — Safari-safe)
    setUser(null)
    setProfile(null)

    // 2. Clear Cognito localStorage keys synchronously
    try {
      Object.keys(localStorage)
        .filter(k =>
          k.startsWith('CognitoIdentityServiceProvider') ||
          k.startsWith('sb-') ||
          k === 'delivery-tracker-auth'
        )
        .forEach(k => localStorage.removeItem(k))
    } catch { /* Safari private-mode safe */ }

    // 3. Cognito sign-out (clears SDK session)
    cognitoSignOut()

    // 4. Hard redirect — synchronous, always works in Safari
    window.location.href = '/'
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const isSuperAdmin = profile?.role === 'super_admin'
  const passwordChangeRequired = !!(profile?.password_change_required)

  return (
    <AuthContext.Provider value={{
      user,
      session: null,
      profile,
      isAdmin,
      isSuperAdmin,
      passwordChangeRequired,
      isPasswordRecovery: false,
      clearPasswordRecovery: () => {},
      loading,
      signIn,
      signInWithSSO,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
