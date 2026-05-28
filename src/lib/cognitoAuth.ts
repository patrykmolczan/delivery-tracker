/**
 * cognitoAuth.ts
 * AWS Cognito authentication — the sole auth implementation for this app.
 * Uses amazon-cognito-identity-js (already available via aws-amplify)
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { splitStorage } from './splitStorage';

// ─── Config ──────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[name]
  if (!v) {
    // Fail loudly at app load. Prior to this fix LoginPage.tsx silently fell
    // back to a hardcoded production client ID — that fallback is gone now.
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return v
}

export const COGNITO_CONFIG = {
  UserPoolId: requireEnv('VITE_COGNITO_USER_POOL_ID'),
  ClientId: requireEnv('VITE_COGNITO_CLIENT_ID'),
  Region: import.meta.env.VITE_AWS_REGION ?? 'us-east-2',
};

/**
 * Cognito hosted-UI domain. Used by the SSO flow to build the /oauth2/authorize URL.
 * Centralised here so the value lives in exactly one place — see audit M-4.
 */
export const COGNITO_DOMAIN =
  import.meta.env.VITE_COGNITO_DOMAIN
  ?? `https://${COGNITO_CONFIG.UserPoolId.toLowerCase().replace('_', '-')}.auth.${COGNITO_CONFIG.Region}.amazoncognito.com`;

const userPool = new CognitoUserPool({
  UserPoolId: COGNITO_CONFIG.UserPoolId,
  ClientId: COGNITO_CONFIG.ClientId,
  // AUTH-1 fix: use split storage so access/ID tokens go to sessionStorage
  // and only the refresh token + LastAuthUser go to localStorage.
  Storage: splitStorage,
});

// ─── Pending NEW_PASSWORD_REQUIRED user (module-scoped, not on window) ───────
// Prior to this fix the CognitoUser instance was stashed on `window` so the
// forced-password-change UI could pick it up. Module scope is equivalent for
// same-origin scripts and keeps the global namespace clean (audit L-2).

let pendingNewPasswordUser: CognitoUser | null = null;

export function getPendingNewPasswordUser(): CognitoUser | null {
  return pendingNewPasswordUser;
}

export function clearPendingNewPasswordUser(): void {
  pendingNewPasswordUser = null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;           // Cognito sub (UUID)
  email: string;
  role: string;
  full_name: string;
  cognitoUser: CognitoUser;
  session: CognitoUserSession;
  accessToken: string;
  idToken: string;
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
}

// ─── Sign In ─────────────────────────────────────────────────────────────────

export function signIn(email: string, password: string): Promise<AuthResult> {
  return new Promise((resolve) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const idPayload = session.getIdToken().decodePayload();
        resolve({
          user: {
            id: idPayload.sub,
            email: idPayload.email,
            role: idPayload['custom:role'] ?? 'user',
            full_name: idPayload['custom:full_name'] ?? '',
            cognitoUser,
            session,
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
          },
          error: null,
        });
      },
      onFailure: (err) => {
        // Return a generic message regardless of the underlying Cognito error
        // (UserNotFoundException vs NotAuthorizedException vs other) to prevent
        // username enumeration — see security finding APP-3.
        const raw = err.message ?? String(err)
        const isNewPasswordFlow = raw.includes('NEW_PASSWORD_REQUIRED')
        resolve({
          user: null,
          error: isNewPasswordFlow ? raw : 'Invalid email or password',
        });
      },
      newPasswordRequired: (_userAttributes, _requiredAttributes) => {
        // Stash the CognitoUser for the forced-password-change UI to pick up.
        // Module-scoped — was previously on window (audit L-2). Consumer reads
        // it via getPendingNewPasswordUser() and clears via clearPendingNewPasswordUser().
        pendingNewPasswordUser = cognitoUser;
        resolve({ user: null, error: 'NEW_PASSWORD_REQUIRED' });
      },
    });
  });
}

// ─── Sign Out ────────────────────────────────────────────────────────────────

export function signOut(): void {
  const user = userPool.getCurrentUser();
  if (user) user.signOut();
  // Clear stored session data
  localStorage.removeItem('cognitoSession');
}

// ─── Get Current Session ─────────────────────────────────────────────────────

export function getSession(): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return resolve(null);

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) return resolve(null);

      const idPayload = session.getIdToken().decodePayload();
      resolve({
        id: idPayload.sub,
        email: idPayload.email,
        role: idPayload['custom:role'] ?? 'user',
        full_name: idPayload['custom:full_name'] ?? '',
        cognitoUser,
        session,
        accessToken: session.getAccessToken().getJwtToken(),
        idToken: session.getIdToken().getJwtToken(),
      });
    });
  });
}

// ─── Forgot Password ─────────────────────────────────────────────────────────

export function forgotPassword(email: string): Promise<{ error: string | null }> {
  return new Promise((resolve) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.forgotPassword({
      onSuccess: () => resolve({ error: null }),
      onFailure: (err) => resolve({ error: err.message }),
    });
  });
}

// ─── Confirm Forgot Password ─────────────────────────────────────────────────

export function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<{ error: string | null }> {
  return new Promise((resolve) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: () => resolve({ error: null }),
      onFailure: (err) => resolve({ error: err.message }),
    });
  });
}

// ─── Change Password (authenticated) ─────────────────────────────────────────

export function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<{ error: string | null }> {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return resolve({ error: 'Not signed in' });

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) return resolve({ error: 'Session expired' });
      cognitoUser.changePassword(oldPassword, newPassword, (err2) => {
        if (err2) return resolve({ error: err2.message });
        resolve({ error: null });
      });
    });
  });
}

// -- Refresh Session (AUTH-1 Sprint N+1) ---------------------
// Calls /api/session { action: 'refresh' } which reads the HttpOnly cookie
// and calls Cognito InitiateAuth server-side. New access + ID tokens are
// returned in the JSON body and written into sessionStorage via splitStorage.
// The refresh token never transits JavaScript.

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';

export async function refreshSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session`, {
      method: 'POST',
      credentials: 'include', // send the __rt HttpOnly cookie
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh' }),
    });

    if (!res.ok) return null;

    const { accessToken, idToken } = await res.json() as {
      accessToken: string;
      idToken: string;
      expiresIn: number;
    };

    if (!accessToken || !idToken) return null;

    // Write new short-lived tokens into sessionStorage via splitStorage
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return null;

    const username = cognitoUser.getUsername();
    const prefix = `CognitoIdentityServiceProvider.${COGNITO_CONFIG.ClientId}`;
    splitStorage.setItem(`${prefix}.${username}.accessToken`, accessToken);
    splitStorage.setItem(`${prefix}.${username}.idToken`, idToken);
    splitStorage.setItem(`${prefix}.${username}.clockDrift`, '0');

    // Decode ID token to build AuthUser
    const b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const idPayload = JSON.parse(atob(b64));

    return {
      id: idPayload.sub,
      email: idPayload.email,
      role: idPayload['custom:role'] ?? 'user',
      full_name: idPayload['custom:full_name'] ?? '',
      cognitoUser,
      session: null as any, // session object not available via this path
      accessToken,
      idToken,
    };
  } catch {
    return null;
  }
}




// ─── Update User Attributes ───────────────────────────────────────────────────

export function updateUserAttributes(
  attributes: Record<string, string>
): Promise<{ error: string | null }> {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return resolve({ error: 'Not signed in' });

    cognitoUser.getSession((err: Error | null) => {
      if (err) return resolve({ error: 'Session expired' });

      const attrs = Object.entries(attributes).map(
        ([Name, Value]) => new CognitoUserAttribute({ Name, Value })
      );

      cognitoUser.updateAttributes(attrs, (err2) => {
        if (err2) return resolve({ error: err2.message });
        resolve({ error: null });
      });
    });
  });
}

// ─── Get Auth Headers (for Lambda API calls) ─────────────────────────────────

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = await getSession();
  if (!user) return {};
  return {
    'Authorization': `Bearer ${user.idToken}`,
    'Content-Type': 'application/json',
  };
}

export { userPool };
