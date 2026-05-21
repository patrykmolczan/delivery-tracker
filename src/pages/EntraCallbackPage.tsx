/**
 * src/pages/EntraCallbackPage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Legacy route: /auth/entra/callback
 *
 * This page handled the old Microsoft Entra OIDC → Supabase bridge flow.
 * That flow has been fully decommissioned (no Supabase, per company policy).
 *
 * SSO now uses the Cognito SAML flow:
 *   Sign in with SSO → Cognito hosted UI → IAM Identity Center → Entra ID
 *   → /auth/callback (CognitoCallbackPage)
 *
 * Any request that still lands here is redirected to the login page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect } from 'react'

export const EntraCallbackPage: React.FC = () => {
  useEffect(() => {
    window.location.replace('/')
  }, [])

  return null
}

export default EntraCallbackPage
