import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../types'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  isAdmin: boolean
  isSuperAdmin: boolean
  passwordChangeRequired: boolean
  isPasswordRecovery: boolean
  clearPasswordRecovery: () => void
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithSSO: (domain: string) => Promise<{ error: Error | null }>
  signOut: () => void
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Detect Supabase JWT / auth errors that mean the session is dead.
// These are returned as error objects from .from().select() calls.
function isAuthError(error: any): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  const code = String(error.code || '')
  const status = error.status ?? error.statusCode
  return (
    status === 401 ||
    code === 'PGRST301' ||         // PostgREST: JWT expired
    msg.includes('jwt expired') ||
    msg.includes('jwt invalid') ||
    msg.includes('invalid jwt') ||
    msg.includes('jwtsignaturemismatch') ||
    msg.includes('not authenticated') ||
    msg.includes('invalid claim')
  )
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  // Detect recovery URL on mount BEFORE any auth events fire — used to suppress
  // the SIGNED_OUT redirect that Supabase fires when exchanging a recovery token
  // (Supabase fires SIGNED_OUT to clear old session BEFORE firing PASSWORD_RECOVERY)
  const isRecoveryUrl = useRef(
    typeof window !== 'undefined' &&
    (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery'))
  )

  // Wipe all Supabase auth keys and force redirect to login.
  // Identical clean-up path to signOut() — reusable for auth error recovery.
  const forceSignOut = () => {
    setUser(null)
    setSession(null)
    setProfile(null)
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') || k === 'delivery-tracker-auth')
        .forEach(k => localStorage.removeItem(k))
    } catch { /* Safari private-mode safe */ }
    supabase.auth.signOut().catch(() => {})
    window.location.href = '/'
  }

  // Returns true if profile was fetched successfully (or error was non-auth).
  // Returns false if the error was an auth/JWT failure — caller must sign out.
  const fetchProfile = async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      if (isAuthError(error)) return false  // session is dead
      return true                            // non-auth error (profile not found etc.) — stay logged in
    }
    if (data) setProfile(data as UserProfile)
    return true
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  const clearPasswordRecovery = () => setIsPasswordRecovery(false)

  useEffect(() => {
    // CRITICAL: Register onAuthStateChange FIRST.
    // Supabase v2 fires INITIAL_SESSION synchronously from localStorage —
    // no network call, no hang. getSession() called first triggers a
    // token-refresh network request that can block 8+ seconds on refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          try {
            const authOk = await fetchProfile(session.user.id)
            if (!authOk) {
              // Profile fetch returned a JWT/auth error — the session stored in
              // localStorage is corrupt or the token is expired/rotated away.
              // TOKEN_REFRESH_FAILED may never fire for this class of corruption,
              // so we handle it here: wipe storage and force re-login immediately.
              forceSignOut()
              return
            }
          } catch {
            // Unexpected exception — don't block the UI
          }
        } else {
          setProfile(null)
        }

        // PASSWORD_RECOVERY: user clicked a password-reset link — show the change-password form
        if (event === 'PASSWORD_RECOVERY') {
          isRecoveryUrl.current = true
          setIsPasswordRecovery(true)
        }

        // INITIAL_SESSION fires on mount — this is our signal that auth is ready.
        // All other events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED) keep loading false.
        if (event === 'INITIAL_SESSION') {
          setLoading(false)
        }

        // SAFARI / INACTIVITY FIX: supabase-js bug — when a proactive token refresh
        // fails (e.g. after Safari freezes a tab for 2-3h), _callRefreshToken silently
        // deletes the session and fires SIGNED_OUT even though the user never signed out.
        // Without this redirect the app shows an infinite "Loading delivery data…" spinner.
        if (event === 'SIGNED_OUT') {
          // Don't redirect if we're in a password recovery flow.
          // Supabase fires SIGNED_OUT to clear the old session BEFORE firing PASSWORD_RECOVERY.
          // Redirecting here wipes the recovery token from the URL — user lands on login page.
          if (!isRecoveryUrl.current) {
            window.location.href = '/'
          }
          return
        }

        // When the refresh token is invalid/rotated-away, Supabase clears the
        // session automatically but leaves the UI in a zombie auth state.
        // Redirect to login immediately so the user gets a clean sign-in screen.
        if ((event as string) === 'TOKEN_REFRESH_FAILED') {
          forceSignOut()
        }
      }
    )

    // SAFARI TAB VISIBILITY FIX: Safari aggressively throttles background tabs.
    // When the user returns to the tab after 2-3h, the token may have expired and
    // the SDK's auto-refresh timer may not have fired. Re-validate the session the
    // moment the tab becomes visible so we catch dead sessions before data fetching.
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (!currentSession) {
          // Tab was hidden, session is now gone — clean up and redirect to login
          try {
            Object.keys(localStorage)
              .filter(k => k.startsWith('sb-') || k === 'delivery-tracker-auth')
              .forEach(k => localStorage.removeItem(k))
          } catch { /* Safari private-mode safe */ }
          window.location.href = '/'
        }
      } catch { /* safe to ignore — don't block UI */ }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Safety net: if INITIAL_SESSION never fires (e.g. no stored session at all
    // and Supabase doesn't emit the event), unblock after 3 seconds.
    const timeout = setTimeout(() => setLoading(false), 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data.user) {
      // Log login event (non-blocking)
      void (async () => {
        try {
          await supabase.from('audit_log').insert({
            project_id: null,
            user_id: data.user!.id,
            action: 'USER_LOGIN',
            field_changed: null,
            old_value: null,
            new_value: null,
            metadata: { email, login_at: new Date().toISOString() },
          })
        } catch { /* non-blocking */ }
      })()
    }
    return { error }
  }

  const signInWithSSO = async (domain: string): Promise<{ error: Error | null }> => {
    try {
      // signInWithSSO redirects the browser to the identity provider.
      // On return, Supabase handles the callback and fires onAuthStateChange(SIGNED_IN).
      const { error } = await (supabase.auth as any).signInWithSSO({ domain })
      return { error: error as Error | null }
    } catch (e) {
      return { error: e as Error }
    }
  }

  const signOut = () => {
    // SAFARI FIX: Safari blocks navigation that fires after an `await` (async-initiated
    // navigation is suppressed by ITP unless it originates directly from a user gesture).
    // Solution: do everything synchronously first, THEN fire signOut in the background.

    // 1. Immediately clear React state
    setUser(null)
    setSession(null)
    setProfile(null)

    // 2. Wipe all Supabase auth keys from localStorage synchronously
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') || k === 'delivery-tracker-auth')
        .forEach(k => localStorage.removeItem(k))
    } catch {
      // localStorage may be restricted in Safari private-mode — safe to ignore
    }

    // 3. Fire Supabase signOut in background (don't await — avoids async navigation block)
    supabase.auth.signOut().catch(() => {})

    // 4. Hard redirect immediately — synchronous, always works in Safari
    window.location.href = '/'
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const isSuperAdmin = profile?.role === 'super_admin'
  const passwordChangeRequired = !!(profile?.password_change_required)

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, isSuperAdmin, passwordChangeRequired, isPasswordRecovery, clearPasswordRecovery, loading, signIn, signInWithSSO, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
