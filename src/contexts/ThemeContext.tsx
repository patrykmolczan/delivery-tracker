import React, { createContext, useContext, useEffect, useState } from 'react'

/**
 * Color scheme is a base mode (light/dark) with an independent "Glass"
 * visual treatment that can layer onto either one — NOT four flat,
 * mutually-exclusive options. That distinction matters for the UI: a flat
 * enum grows a new button every time a variant is added (which is exactly
 * what overflowed the sidebar's Appearance control when "Glass" first
 * shipped as dark-only, and would overflow it again the moment a
 * light-glass variant needed a fifth button). Modeling it as two orthogonal
 * toggles — base mode, and a Glass switch — means the UI never grows past
 * "a 2-button switch plus one small toggle," regardless of how many visual
 * treatments Glass-like features gain later.
 */
export type ThemeMode = 'light' | 'dark'
/** The actual `data-theme` value applied to <html>, derived from mode + glass. */
export type Theme = 'light' | 'dark' | 'glass' | 'glass-light'

interface ThemeContextType {
  /** Effective data-theme — what CSS actually keys off. */
  theme: Theme
  /** Base color scheme, independent of whether Glass is layered on top. */
  mode: ThemeMode
  /** Whether the Glass visual treatment is layered onto the current mode. */
  glass: boolean
  /** True when mode is 'dark' — unaffected by `glass`. Drives LoginPage/
   *  ChangePasswordPage's existing isDark-branched inline styles; those two
   *  pre-auth, custom-styled pages don't have a glass variant, so they
   *  simply follow the base mode regardless of the Glass toggle. */
  isDark: boolean
  /** Strict light/dark flip, ignoring `glass`. Used only by LoginPage's
   *  small sun/moon icon, which predates Glass and isn't about it. */
  toggleTheme: () => void
  setMode: (m: ThemeMode) => void
  setGlass: (g: boolean) => void
}

function deriveTheme(mode: ThemeMode, glass: boolean): Theme {
  if (!glass) return mode
  return mode === 'dark' ? 'glass' : 'glass-light'
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  mode: 'light',
  glass: false,
  isDark: false,
  toggleTheme: () => {},
  setMode: () => {},
  setGlass: () => {},
})

export const useTheme = () => useContext(ThemeContext)

const MODE_KEY = 'delivery-tracker-theme-mode'
const GLASS_KEY = 'delivery-tracker-theme-glass'
/** Pre-existing key from before mode/glass were split apart. Read once, for
 *  migration only — never written to again. */
const LEGACY_KEY = 'delivery-tracker-theme'

function loadInitialState(): { mode: ThemeMode; glass: boolean } {
  try {
    const savedMode = localStorage.getItem(MODE_KEY)
    const savedGlass = localStorage.getItem(GLASS_KEY)
    if (savedMode === 'light' || savedMode === 'dark') {
      return { mode: savedMode, glass: savedGlass === '1' }
    }

    // Migrate a pre-split value: old 'glass' meant "dark + glass" (the only
    // glass variant that existed then); old 'light'/'dark' map straight across.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy === 'glass') return { mode: 'dark', glass: true }
    if (legacy === 'dark') return { mode: 'dark', glass: false }
    if (legacy === 'light') return { mode: 'light', glass: false }

    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return { mode: 'dark', glass: false }
    }
    return { mode: 'light', glass: false }
  } catch {
    return { mode: 'light', glass: false }
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [{ mode, glass }, setState] = useState(loadInitialState)

  const theme = deriveTheme(mode, glass)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(MODE_KEY, mode)
      localStorage.setItem(GLASS_KEY, glass ? '1' : '0')
    } catch {
      /* non-fatal — preference just won't persist across reloads */
    }
  }, [theme, mode, glass])

  const setMode = (m: ThemeMode) => setState(s => ({ ...s, mode: m }))
  const setGlass = (g: boolean) => setState(s => ({ ...s, glass: g }))
  // Strict light/dark flip, deliberately untouched by `glass` — see the
  // field's doc comment above.
  const toggleTheme = () => setState(s => ({ ...s, mode: s.mode === 'light' ? 'dark' : 'light' }))
  const isDark = mode === 'dark'

  return (
    <ThemeContext.Provider value={{ theme, mode, glass, isDark, toggleTheme, setMode, setGlass }}>
      {children}
    </ThemeContext.Provider>
  )
}
