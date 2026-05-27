/**
 * src/components/sso/AdminEntraSSO.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * SSO status panel — read-only information card.
 * SSO is now managed entirely via AWS Cognito + IAM Identity Center (SAML).
 * There is nothing to configure from the UI — the DevOps team manages it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react'
import { Key, CheckCircle2, Shield, ExternalLink } from 'lucide-react'
import { COGNITO_CONFIG } from '../../lib/cognitoAuth'

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-base-300 last:border-0">
    <span className="text-xs text-base-content/50 shrink-0 w-36">{label}</span>
    <span className={`text-xs text-base-content/80 text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
)

export const AdminEntraSSO: React.FC = () => {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body gap-4">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Key size={18} className="text-primary" />
            <h2 className="font-semibold text-base-content">SSO / Authentication</h2>
          </div>
          <span className="badge badge-success badge-sm gap-1">
            <CheckCircle2 size={10} /> Active
          </span>
        </div>

        <p className="text-xs text-base-content/50 -mt-2">
          Single Sign-On is fully operational via{' '}
          <strong className="text-base-content/70">AWS Cognito + IAM Identity Center (SAML)</strong>.
          Configuration is managed by the DevOps team — no changes required from this panel.
        </p>

        {/* Status card */}
        <div className="bg-success/5 border border-success/20 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
            <Shield size={16} className="text-success" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-base-content">SSO Enabled & Configured</p>
            <p className="text-xs text-base-content/60">
              Users can sign in via the "Sign in with SSO" button on the login page.
              The button redirects to the Cognito hosted UI, which handles the SAML handshake
              with IAM Identity Center → Microsoft Entra ID → your corporate directory.
            </p>
          </div>
        </div>

        {/* Architecture details */}
        <div>
          <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">Architecture</p>
          <div className="bg-base-200 rounded-xl px-4 py-1">
            <InfoRow label="Auth Provider" value="AWS Cognito User Pool" />
            <InfoRow label="SSO Method" value="SAML 2.0 via IAM Identity Center" />
            <InfoRow label="Identity Provider" value="Microsoft Entra ID (Azure AD)" />
            <InfoRow label="User Pool" value={COGNITO_CONFIG.UserPoolId} mono />
            <InfoRow label="Callback URL" value="/auth/callback" mono />
            <InfoRow label="Password Login" value="Always available as fallback" />
          </div>
        </div>

        {/* Footer note */}
        <div className="flex items-start gap-2 p-3 bg-base-200 rounded-xl">
          <ExternalLink size={13} className="text-base-content/40 mt-0.5 shrink-0" />
          <p className="text-xs text-base-content/50 leading-relaxed">
            To modify SSO configuration (add users, update SAML mapping, rotate certificates),
            contact your DevOps Engineer or manage directly in the{' '}
            <strong>AWS IAM Identity Center</strong> and <strong>Cognito User Pool</strong> consoles.
          </p>
        </div>

      </div>
    </div>
  )
}

export default AdminEntraSSO
