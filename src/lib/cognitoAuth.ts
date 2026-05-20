/**
 * cognitoAuth.ts
 * Drop-in replacement for supabase.auth.* using AWS Cognito
 * Uses amazon-cognito-identity-js (already available via aws-amplify)
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

// ─── Config ──────────────────────────────────────────────────────────────────

export const COGNITO_CONFIG = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  Region: import.meta.env.VITE_AWS_REGION ?? 'us-east-2',
};

const userPool = new CognitoUserPool({
  UserPoolId: COGNITO_CONFIG.UserPoolId,
  ClientId: COGNITO_CONFIG.ClientId,
});

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
        resolve({ user: null, error: err.message ?? String(err) });
      },
      newPasswordRequired: (_userAttributes, _requiredAttributes) => {
        // Return a special error so the UI can handle forced password change
        resolve({ user: null, error: 'NEW_PASSWORD_REQUIRED' });
        // Store cognitoUser on window for the change-password flow
        (window as unknown as Record<string, unknown>)._cognitoNewPasswordUser = cognitoUser;
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

// ─── Refresh Session ─────────────────────────────────────────────────────────

export function refreshSession(): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) return resolve(null);

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) return resolve(null);

      const refreshToken = session.getRefreshToken();
      cognitoUser.refreshSession(refreshToken, (err2, newSession) => {
        if (err2 || !newSession) return resolve(null);

        const idPayload = newSession.getIdToken().decodePayload();
        resolve({
          id: idPayload.sub,
          email: idPayload.email,
          role: idPayload['custom:role'] ?? 'user',
          full_name: idPayload['custom:full_name'] ?? '',
          cognitoUser,
          session: newSession,
          accessToken: newSession.getAccessToken().getJwtToken(),
          idToken: newSession.getIdToken().getJwtToken(),
        });
      });
    });
  });
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
