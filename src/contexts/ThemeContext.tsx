import React, { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'glass'

interface ThemeContextType {
  theme: Theme
  isDark: boolean
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('delivery-tracker-theme') as Theme | null
      if (saved === 'dark' || saved === 'glass') return saved
      // Check OS preference if no saved preference
      if (!saved && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
      return 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('delivery-tracker-theme', theme)
  }, [theme])

  const setTheme = (t: Theme) => setThemeState(t)
  // Unchanged from before 'glass' existed: this is a strict light/dark flip,
  // used only by LoginPage's small sun/moon toggle. Glass is selected
  // explicitly via setTheme('glass') from the sidebar's 3-way control, never
  // by toggling — so if someone lands on the login page with 'glass' saved,
  // clicking that icon takes them to 'dark', matching what a person clicking
  // "the other mode" would expect.
  const toggleTheme = () => setThemeState(prev => prev === 'light' ? 'dark' : 'light')
  // 'glass' is deliberately its own thing, not a dark variant — this keeps
  // LoginPage/ChangePasswordPage's existing isDark-branched inline styles
  // working unchanged: those two pre-auth, custom-styled pages simply render
  // their light variant under Glass, same as they would under Light.
  const isDark = theme === 'dark'

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
