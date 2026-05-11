/**
 * src/components/sso/EntraIDSSOButton.tsx
 * "Sign in with Microsoft" button — two variants:
 *   'primary'  → full blue button (SSO is the main path)
 *   'outline'  → ghost button (alternate / fallback option)
 * Uses only @mui/icons-material (already in the project via LoginPage).
 */

import React from 'react'
import AutorenewRounded from '@mui/icons-material/AutorenewRounded'

// Microsoft four-square logo (inline SVG — no external asset dep)
const MicrosoftLogo: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 21 21"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <rect x="0"  y="0"  width="10" height="10" fill="#F25022" />
    <rect x="11" y="0"  width="10" height="10" fill="#7FBA00" />
    <rect x="0"  y="11" width="10" height="10" fill="#00A4EF" />
    <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
  </svg>
)

export interface EntraIDSSOButtonProps {
  onClick: () => void
  loading?: boolean
  variant?: 'primary' | 'outline'
  label?: string
  style?: React.CSSProperties
}

export const EntraIDSSOButton: React.FC<EntraIDSSOButtonProps> = ({
  onClick,
  loading = false,
  variant = 'primary',
  label,
  style,
}) => {
  const buttonLabel = label ?? (loading ? 'Redirecting to Microsoft…' : 'Sign in with Microsoft')

  const sharedContent = (
    <>
      {loading
        ? <AutorenewRounded sx={{ fontSize: 17 }} className="animate-spin" />
        : <MicrosoftLogo size={variant === 'primary' ? 18 : 16} />
      }
      {buttonLabel}
    </>
  )

  if (variant === 'primary') {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={onClick}
        aria-label={buttonLabel}
        style={{
          width: '100%',
          padding: '10px 16px',
          background: loading ? 'rgba(0,114,239,0.7)' : '#0072EF',
          border: 'none',
          borderRadius: 8,
          color: '#ffffff',
          fontSize: 14,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          letterSpacing: '0.01em',
          transition: 'background 0.2s, opacity 0.2s',
          opacity: loading ? 0.75 : 1,
          ...style,
        }}
      >
        {sharedContent}
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      aria-label={buttonLabel}
      style={{
        width: '100%',
        padding: '9px',
        background: 'transparent',
        border: '1px solid rgba(0,114,239,0.4)',
        borderRadius: 8,
        color: '#0072EF',
        fontSize: 13,
        fontWeight: 500,
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'border-color 0.2s, color 0.35s',
        opacity: loading ? 0.6 : 1,
        ...style,
      }}
    >
      {sharedContent}
    </button>
  )
}

export default EntraIDSSOButton
