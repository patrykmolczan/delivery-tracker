import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../types'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  isAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) setProfile(data as UserProfile)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

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
          try { await fetchProfile(session.user.id) } catch {}
        } else {
          setProfile(null)
        }

        // INITIAL_SESSION fires on mount — this is our signal that auth is ready.
        // All other events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED) keep loading false.
        if (event === 'INITIAL_SESSION') {
          setLoading(false)
        }
      }
    )

    // Safety net: if INITIAL_SESSION never fires (e.g. no stored session at all
    // and Supabase doesn't emit the event), unblock after 3 seconds.
    const timeout = setTimeout(() => setLoading(false), 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // Safari may throw or silently fail — continue regardless
    }

    // Immediately clear local state — don't wait for onAuthStateChange
    // Safari's ITP can suppress the SIGNED_OUT event, so we force it here.
    setUser(null)
    setSession(null)
    setProfile(null)

    // Wipe all Supabase auth keys from localStorage (Safari-safe)
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') || k === 'delivery-tracker-auth')
        .forEach(k => localStorage.removeItem(k))
    } catch {
      // localStorage may be restricted in some Safari private-mode contexts
    }

    // Hard redirect as final fallback — guarantees the login page shows
    // even if React state update doesn't trigger a re-render in Safari
    window.location.href = '/'
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
