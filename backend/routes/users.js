"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = getUsers;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.resetUserPassword = resetUserPassword;
exports.bulkDeactivateUsers = bulkDeactivateUsers;
exports.changeOwnPassword = changeOwnPassword;

const { query, queryOne } = require('../shared/db');
const { ok, err, serverError } = require('../shared/response');
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-2' });
// ── Per-user rate limit for password changes ───────────────────────────────
const _pwRlStore = new Map();
const PW_RL_MAX = 10;
const PW_RL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
function _checkPwRateLimit(sub) {
  if (!sub) return false;
  const now = Date.now();
  const entry = _pwRlStore.get(sub);
  if (!entry || (now - entry.windowStart) > PW_RL_WINDOW_MS) {
    _pwRlStore.set(sub, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= PW_RL_MAX) return true;
  entry.count++;
  return false;
}
// ── Structured auth event logging (appears in CloudWatch Logs) ─────────────
function logAuthEvent(event, sub, email, success, detail) {
  console.log(JSON.stringify({ type: 'AUTH_EVENT', event, sub, email, success, detail, ts: new Date().toISOString() }));
}

function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'super_admin';
}

async function getUsers(_params, user) {
  try {
    if (!user) return err('Unauthorized', 401);
    if (!isAdmin(user)) return err('Forbidden', 403);
    const rows = await query(
      `SELECT id, email, full_name, role, is_active, cognito_id, created_at, updated_at
       FROM profiles ORDER BY created_at DESC`,
      []
    );
    return ok(rows);
  } catch (e) {
    return serverError(e);
  }
}

async function createUser(body, user) {
  try {
    if (!user) return err('Unauthorized', 401);
    if (!isAdmin(user)) return err('Forbidden', 403);
    const { email, full_name, role, password } = body || {};
    if (!email || !full_name) return err('Missing required fields: email, full_name');

    // Use the admin-supplied password if provided (matches Create User form field);
    // fall back to a server-generated one only if the caller omits it entirely.
    const crypto = require('crypto');
    let generatedPassword;
    if (password) {
      if (typeof password !== 'string' || password.length < 8) {
        return err('Password must be at least 8 characters');
      }
      generatedPassword = password;
    } else {
      const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const lower   = 'abcdefghjkmnpqrstuvwxyz';
      const digits  = '23456789';
      const special = '!@#$%^&*';
      const all     = upper + lower + digits + special;
      const pick    = (charset) => charset[crypto.randomInt(charset.length)];
      const required = [pick(upper), pick(upper), pick(lower), pick(lower), pick(digits), pick(digits), pick(special), pick(special)];
      const remaining = Array.from({ length: 4 }, () => pick(all));
      const combined = [...required, ...remaining];
      for (let i = combined.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [combined[i], combined[j]] = [combined[j], combined[i]];
      }
      generatedPassword = combined.join('');
    }

    // Create in Cognito
    let cognitoId = '';
    try {
      const cognitoResult = await cognito.send(new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        TemporaryPassword: generatedPassword,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: full_name },
        ],
      }));
      cognitoId = cognitoResult.User?.Attributes?.find(a => a.Name === 'sub')?.Value || '';

      // Set permanent password (skip force-change in Cognito; we control it via password_change_required)
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: generatedPassword,
        Permanent: true,
      }));
    } catch (cognitoErr) {
      if (cognitoErr.name === 'UsernameExistsException') {
        return err('A user with this email already exists.', 409);
      }
      throw cognitoErr;
    }

    // Insert into Aurora (id has no DB default — must generate explicitly, same as profile.js auto-provision)
    const row = await queryOne(
      `INSERT INTO profiles (id, email, full_name, role, cognito_id, is_active, password_change_required, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, true, true, NOW(), NOW()) RETURNING *`,
      [email, full_name, role || 'user', cognitoId]
    );

    // Store temp password in welcome_pending for the hardened send-welcome flow (audit H-2)
    if (row) {
      const adminProfile = await queryOne('SELECT id FROM profiles WHERE cognito_id = $1', [user.sub]).catch(() => null);
      if (adminProfile) {
        await queryOne(
          `INSERT INTO welcome_pending (user_id, temp_password, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE SET temp_password = $2, expires_at = NOW() + interval '24 hours'`,
          [row.id, generatedPassword, adminProfile.id]
        ).catch(() => {}); // non-fatal — welcome email can still be sent manually
      }
    }

    return ok({ ...row, tempPassword: generatedPassword });
  } catch (e) {
    return serverError(e);
  }
}

async function updateUser(userId, body, user) {
  try {
    if (!user) return err('Unauthorized', 401);
    if (!isAdmin(user)) return err('Forbidden', 403);
    const { full_name, role, is_active } = body || {};

    const target = await queryOne(`SELECT role FROM profiles WHERE id = $1`, [userId]);
    if (!target) return err('User not found', 404);
    if (target.role === 'super_admin' && user.role !== 'super_admin') return err('Forbidden', 403);

    const row = await queryOne(
      `UPDATE profiles SET
         full_name = COALESCE($1, full_name),
         role = COALESCE($2, role),
         is_active = COALESCE($3, is_active),
         updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [full_name ?? null, role ?? null, is_active ?? null, userId]
    );
    return ok(row);
  } catch (e) {
    return serverError(e);
  }
}

async function deleteUser(userId, user) {
  try {
    if (!user) return err('Unauthorized', 401);
    if (!isAdmin(user)) return err('Forbidden', 403);

    const target = await queryOne(`SELECT email, role, cognito_id FROM profiles WHERE id = $1`, [userId]);
    if (!target) return err('User not found', 404);
    if (target.role === 'super_admin' && user.role !== 'super_admin') return err('Forbidden', 403);

    // Delete from Cognito
    try {
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: target.email,
      }));
    } catch (cognitoErr) {
      if (cognitoErr.name !== 'UserNotFoundException') throw cognitoErr;
    }

    // Cascade delete from Aurora
    await query(`DELETE FROM profiles WHERE id = $1`, [userId]);
    return ok({ deleted: true });
  } catch (e) {
    return serverError(e);
  }
}

async function resetUserPassword(userId, body, user) {
  try {
    if (!user) return err('Unauthorized', 401);
    if (!isAdmin(user)) return err('Forbidden', 403);
    const { new_password } = body || {};
    if (!new_password) return err('new_password is required');

    const target = await queryOne(`SELECT email FROM profiles WHERE id = $1`, [userId]);
    if (!target) return err('User not found', 404);

    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: target.email,
      Password: new_password,
      Permanent: true,
    }));

    await query(
      `UPDATE profiles SET password_change_required = true, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
    logAuthEvent('admin-reset-password', user.sub, user.email, true, `reset_for:${target.email}`);
    return ok({ success: true, email: target.email });
  } catch (e) {
    logAuthEvent('admin-reset-password', user.sub, user.email, false, 'exception');
    return serverError(e);
  }
}

async function bulkDeactivateUsers(body, user) {
  try {
    if (!user) return err('Unauthorized', 401);
    if (!isAdmin(user)) return err('Forbidden', 403);
    const { ids } = body || {};
    if (!ids || !Array.isArray(ids) || ids.length === 0) return err('ids array required');

    let validIds = ids;
    if (user.role !== 'super_admin') {
      const rows = await query(`SELECT id, role FROM profiles WHERE id = ANY($1)`, [ids]);
      validIds = rows.filter(r => r.role !== 'super_admin').map(r => r.id);
    }
    if (validIds.length === 0) return ok({ deactivated: 0 });

    await query(
      `UPDATE profiles SET is_active = false, updated_at = NOW() WHERE id = ANY($1)`,
      [validIds]
    );
    return ok({ deactivated: validIds.length });
  } catch (e) {
    return serverError(e);
  }
}

async function changeOwnPassword(body, user) {
  try {
    if (!user) return err('Unauthorized', 401);
    // Rate limit: 10 attempts per hour per user
    if (_checkPwRateLimit(user.sub)) {
      logAuthEvent('change-password', user.sub, user.email, false, 'rate_limited');
      return { statusCode: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' }, body: JSON.stringify({ error: 'Too many password change attempts. Please try again later.' }) };
    }
    const { newPassword } = body || {};
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      logAuthEvent('change-password', user.sub, user.email, false, 'password_too_short');
      return err('Password must be at least 8 characters', 400);
    }
    // Get email from Aurora profiles via cognito_id
    const rows = await query(
      'SELECT email FROM profiles WHERE cognito_id = $1',
      [user.sub]
    );
    if (!rows.length) return err('User not found', 404);
    const email = rows[0].email;
    // Update Cognito password (admin call — no old password required)
    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: newPassword,
      Permanent: true,
    }));
    // Clear the forced-change flag in Aurora
    await query(
      'UPDATE profiles SET password_change_required = false, updated_at = NOW() WHERE cognito_id = $1',
      [user.sub]
    );
    logAuthEvent('change-password', user.sub, email, true, 'success');
    return ok({ success: true });
  } catch (e) {
    console.error('changeOwnPassword error:', e);
    logAuthEvent('change-password', user.sub, user.email, false, 'exception');
    return serverError(e);
  }
}
