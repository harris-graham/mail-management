'use strict';

const { permissionsForRole } = require('./permissions');

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    matricule: user.matricule,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    department_id: user.department_id,
    ministry_id: user.ministry_id,
    is_active: user.is_active,
    must_change_password: user.must_change_password,
    mfa_enabled: user.mfa_enabled,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    permissions: user.permissions || permissionsForRole(user.role),
  };
}

module.exports = { serializeUser };
