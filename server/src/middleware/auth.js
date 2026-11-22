'use strict';

const { query } = require('../db/pool');
const { verifyAccessToken } = require('../lib/tokens');
const { permissionsForRole, hasPermission } = require('../lib/permissions');
const { unauthorized, forbidden } = require('../lib/errors');
const asyncHandler = require('../lib/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  const { rows } = await query(
    `SELECT id, matricule, username, full_name, email, role, department_id,
            ministry_id, is_active, must_change_password, mfa_enabled, created_at
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) throw unauthorized('Account is disabled');
  user.permissions = permissionsForRole(user.role);
  req.user = user;
  req.tokenPayload = payload;
  next();
});

function requirePermission(permission) {
  return function permissionMiddleware(req, res, next) {
    if (!req.user) return next(unauthorized());
    if (!hasPermission(req.user, permission)) {
      return next(forbidden(`Missing permission: ${permission}`));
    }
    next();
  };
}

function requireRole(...roles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden('This action is restricted to another role'));
    }
    next();
  };
}

module.exports = { authenticate, requirePermission, requireRole };
