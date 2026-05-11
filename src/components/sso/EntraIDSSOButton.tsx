/**
 * src/components/sso/EntraIDSSOButton.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Sign in with Microsoft" button for the login page.
 * Used when sso_provider === 'entra' and sso_enabled === true.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react'
import AutorenewRounded from '@mui/icons-material/AutorenewRounded'

interface EntraIDSSOButtonProps {
  loading: boolean
  onClick: () => void
  /** Optional override label. Defaults to "Sign in with Microsoft" */
  label?: string
  /** Visual variant: 'default' (white filled) | 'ghost' (transparent/outlined). Defaults to 'default'. */
  variant?: 'default' | 'ghost' | 'primary' | 'outline'
  /** Optional extra inline styles applied to the button */
  style?: React.CSSProperties
}

/** Microsoft logo — four coloured squares */
const MicrosoftLogo: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0"  y="0"  width="10" height="10" fill="#F25022" />
    <rect x="11" y="0"  width="10" height="10" fill="#7FBA00" />
    <rect x="0"  y="11" width="10" height="10" fill="#00A4EF" />
    <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
  </svg>
)

export const EntraIDSSOButton: React.FC<EntraIDSSOButtonProps> = ({
  loading,
  onClick,
  label = 'Sign in with Microsoft',
  variant = 'default',
  style: extraStyle,
}) => {
  const isGhost = variant === 'ghost' || variant === 'outline'
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        width: '100%',
        padding: '11px 16px',
        border: isGhost ? '1.5px solid rgba(255,255,255,0.25)' : '1.5px solid rgba(0,0,0,0.15)',
        borderRadius: '10px',
        background: isGhost ? 'rgba(255,255,255,0.08)' : '#fff',
        color: isGhost ? '#fff' : '#1a1a1a',
        fontSize: '14px',
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        transition: 'background 0.15s, box-shadow 0.15s, opacity 0.15s',
        boxShadow: isGhost ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
        letterSpacing: '0.01em',
        ...extraStyle,
      }}
      onMouseEnter={e => {
        if (!loading) (e.currentTarget as HTMLButtonElement).style.background =
          isGhost ? 'rgba(255,255,255,0.15)' : '#f5f5f5'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background =
          isGhost ? 'rgba(255,255,255,0.08)' : '#fff'
      }}
      aria-label={label}
    >
      {loading ? (
        <AutorenewRounded
          sx={{ fontSize: 20, color: '#666' }}
          className="animate-spin"
          style={{ animation: 'spin 1s linear infinite' }}
        />
      ) : (
        <MicrosoftLogo size={20} />
      )}
      <span>{loading ? 'Connecting…' : label}</span>
    </button>
  )
}

export default EntraIDSSOButton
