'use strict';

const express = require('express');
const { z } = require('zod');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { query, withTransaction } = require('../db/pool');
const config = require('../config/env');
const asyncHandler = require('../lib/asyncHandler');
const { validate } = require('../lib/validation');
const { verifyPassword, hashPassword, validatePasswordPolicy } = require('../lib/password');
const {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  hashToken,
  randomToken,
} = require('../lib/tokens');
const { audit } = require('../lib/audit');
const { serializeUser } = require('../lib/serialize');
const { unauthorized, badRequest, conflict } = require('../lib/errors');
const { loginLimiter } = require('../middleware/rateLimit');
const requireCsrf = require('../middleware/csrf');
const { authenticate } = require('../middleware/auth');
const { sendMail } = require('../services/emailService');
const logger = require('../lib/logger');

const router = express.Router();

const REFRESH_COOKIE = 'refresh_token';
const CSRF_COOKIE = 'csrf_token';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
  };
}

function csrfCookieOptions() {
  return {
    httpOnly: false,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

function issueCookies(res, refreshToken) {
  const maxAge = config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), maxAge });
  const csrf = randomToken();
  res.cookie(CSRF_COOKIE, csrf, { ...csrfCookieOptions(), maxAge });
  return csrf;
}

async function findUserByIdentifier(identifier) {
  const { rows } = await query(
    `SELECT * FROM users
     WHERE deleted_at IS NULL
       AND (matricule = $1 OR lower(username) = lower($1) OR lower(email) = lower($1))
     LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

const loginSchema = z.object({
  matricule: z.string().min(1),
  password: z.string().min(1),
  totp: z.string().optional(),
});

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { matricule, password, totp } = req.validated.body;
    const user = await findUserByIdentifier(matricule);

    if (!user) {
      await audit({ action: 'auth.login_failed', entity: 'user', entityId: matricule, req });
      throw unauthorized('Invalid credentials.');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw conflict('Account is temporarily locked. Try again later.');
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const attempts = user.failed_login_attempts + 1;
      const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [attempts, lock, user.id]
      );
      await audit({
        actorId: user.id,
        action: 'auth.login_failed',
        entity: 'user',
        entityId: user.id,
        req,
      });
      throw unauthorized('Invalid credentials.');
    }

    if (user.mfa_enabled) {
      if (!totp || !authenticator.check(totp, user.mfa_secret)) {
        throw unauthorized('A valid two-factor code is required.');
      }
    }

    await query(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
       WHERE id = $1`,
      [user.id]
    );

    const accessToken = signAccessToken(user);
    const refresh = await issueRefreshToken(user.id, req);
    const csrf = issueCookies(res, refresh.token);

    await audit({
      actorId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      req,
    });

    res.json({
      accessToken,
      expiresIn: config.ACCESS_TOKEN_TTL,
      csrfToken: csrf,
      user: serializeUser(user),
    });
  })
);

router.post(
  '/refresh',
  requireCsrf,
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw unauthorized('No refresh token.');
    const rotated = await rotateRefreshToken(raw, req);
    if (!rotated) throw unauthorized('Refresh token is invalid or expired.');

    const accessToken = signAccessToken(rotated.user);
    const csrf = issueCookies(res, rotated.token);
    res.json({
      accessToken,
      expiresIn: config.ACCESS_TOKEN_TTL,
      csrfToken: csrf,
      user: serializeUser(rotated.user),
    });
  })
);

router.post(
  '/logout',
  requireCsrf,
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) await revokeRefreshToken(raw);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    res.clearCookie(CSRF_COOKIE, csrfCookieOptions());
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: serializeUser(req.user) });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
});

router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.validated.body;
    const policy = validatePasswordPolicy(newPassword);
    if (policy) throw badRequest(policy);

    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      throw unauthorized('Current password is incorrect.');
    }

    const hash = await hashPassword(newPassword);
    await query(
      `UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2`,
      [hash, user.id]
    );
    await revokeAllRefreshTokens(user.id);
    await audit({
      actorId: user.id,
      action: 'auth.password_changed',
      entity: 'user',
      entityId: user.id,
      req,
    });
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    res.clearCookie(CSRF_COOKIE, csrfCookieOptions());
    res.json({ ok: true, message: 'Password changed. Please sign in again.' });
  })
);

router.post(
  '/mfa/setup',
  authenticate,
  asyncHandler(async (req, res) => {
    const secret = authenticator.generateSecret();
    await query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, req.user.id]);
    const uri = authenticator.keyuri(req.user.username, 'Mail Management', secret);
    const qr = await qrcode.toDataURL(uri);
    res.json({ secret, otpauthUrl: uri, qr });
  })
);

const mfaTokenSchema = z.object({ token: z.string().min(6) });

router.post(
  '/mfa/enable',
  authenticate,
  validate({ body: mfaTokenSchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT mfa_secret FROM users WHERE id = $1', [req.user.id]);
    const secret = rows[0]?.mfa_secret;
    if (!secret) throw badRequest('Start MFA setup first.');
    if (!authenticator.check(req.validated.body.token, secret)) {
      throw badRequest('Invalid two-factor code.');
    }

    const recoveryCodes = Array.from({ length: 10 }, () => randomToken().slice(0, 12));
    const hashed = await Promise.all(recoveryCodes.map((code) => hashPassword(code)));
    await query(
      `UPDATE users SET mfa_enabled = true, mfa_recovery_codes = $1 WHERE id = $2`,
      [hashed, req.user.id]
    );
    await audit({
      actorId: req.user.id,
      action: 'auth.mfa_enabled',
      entity: 'user',
      entityId: req.user.id,
      req,
    });
    res.json({ enabled: true, recoveryCodes });
  })
);

const disableMfaSchema = z.object({ password: z.string().min(1) });

router.post(
  '/mfa/disable',
  authenticate,
  validate({ body: disableMfaSchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(req.validated.body.password, rows[0].password_hash))) {
      throw unauthorized('Password is incorrect.');
    }
    await query(
      `UPDATE users SET mfa_enabled = false, mfa_secret = NULL,
       mfa_recovery_codes = '{}' WHERE id = $1`,
      [req.user.id]
    );
    res.json({ enabled: false });
  })
);

router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, user_agent, ip, created_at, expires_at, revoked_at
       FROM refresh_tokens WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ data: rows });
  })
);

router.delete(
  '/sessions/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    await query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  })
);

const forgotSchema = z.object({ email: z.string().email() });

router.post(
  '/forgot-password',
  loginLimiter,
  validate({ body: forgotSchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT id, full_name, email FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL',
      [req.validated.body.email]
    );
    const user = rows[0];
    if (user) {
      const token = randomToken();
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 minutes')`,
        [user.id, hashToken(token)]
      );
      const base = config.CORS_ORIGINS_LIST[0] || 'http://localhost:3000';
      const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe',
        text: `Bonjour ${user.full_name},\n\nUtilisez ce lien pour réinitialiser votre mot de passe (valable 30 minutes) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      }).catch((error) => logger.warn({ err: error }, 'Password reset email failed'));
    }
    res.json({ ok: true, message: 'If the address exists, a reset link has been sent.' });
  })
);

const resetSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(10),
});

router.post(
  '/reset-password',
  validate({ body: resetSchema }),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.validated.body;
    const policy = validatePasswordPolicy(newPassword);
    if (policy) throw badRequest(policy);

    const { rows } = await query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [hashToken(token)]
    );
    const reset = rows[0];
    if (!reset) throw badRequest('Reset link is invalid or expired.');

    await withTransaction(async (client) => {
      const hash = await hashPassword(newPassword);
      await client.query(
        'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
        [hash, reset.user_id]
      );
      await client.query(
        'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1',
        [reset.id]
      );
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1',
        [reset.user_id]
      );
    });

    res.json({ ok: true, message: 'Password reset. Please sign in.' });
  })
);

module.exports = router;
