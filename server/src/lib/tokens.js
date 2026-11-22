'use strict';

const crypto = require('crypto');
require('./bufferCompat');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { query } = require('../db/pool');
const { permissionsForRole } = require('./permissions');

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      matricule: user.matricule,
      username: user.username,
      role: user.role,
      departmentId: user.department_id || null,
      permissions: permissionsForRole(user.role),
      type: 'access',
    },
    config.JWT_SECRET,
    {
      expiresIn: config.ACCESS_TOKEN_TTL,
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_SECRET, {
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(48).toString('base64url');
}

async function issueRefreshToken(userId, req) {
  const raw = randomToken();
  const expiresAt = new Date(
    Date.now() + config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
  );
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      hashToken(raw),
      expiresAt,
      req.get('user-agent') || null,
      req.ip || null,
    ]
  );
  return { token: raw, expiresAt };
}

async function findRefreshToken(raw) {
  const { rows } = await query(
    `SELECT rt.*, u.id AS uid, u.matricule, u.username, u.full_name, u.role,
            u.department_id, u.ministry_id, u.is_active, u.deleted_at,
            u.must_change_password
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [hashToken(raw)]
  );
  return rows[0] || null;
}

async function rotateRefreshToken(raw, req) {
  const existing = await findRefreshToken(raw);
  if (!existing) return null;
  if (existing.revoked_at || new Date(existing.expires_at) <= new Date()) return null;
  if (!existing.is_active || existing.deleted_at) return null;

  const next = await issueRefreshToken(existing.user_id, req);
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = now(), replaced_by = (SELECT id FROM refresh_tokens WHERE token_hash = $2)
     WHERE token_hash = $1`,
    [hashToken(raw), hashToken(next.token)]
  );

  return {
    token: next.token,
    expiresAt: next.expiresAt,
    user: {
      id: existing.uid,
      matricule: existing.matricule,
      username: existing.username,
      full_name: existing.full_name,
      role: existing.role,
      department_id: existing.department_id,
      ministry_id: existing.ministry_id,
      must_change_password: existing.must_change_password,
    },
  };
}

async function revokeRefreshToken(raw) {
  await query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(raw)]
  );
}

async function revokeAllRefreshTokens(userId) {
  await query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  hashToken,
  randomToken,
};
