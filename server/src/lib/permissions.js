'use strict';

const PERMISSIONS = Object.freeze({
  MAIL_READ: 'mail.read',
  MAIL_CREATE: 'mail.create',
  MAIL_UPDATE: 'mail.update',
  MAIL_DELETE: 'mail.delete',
  MAIL_ASSIGN: 'mail.assign',
  MAIL_VISA: 'mail.visa',
  MAIL_REJECT: 'mail.reject',
  MAIL_ARCHIVE: 'mail.archive',
  MAIL_RESTORE: 'mail.restore',
  MAIL_EXPORT: 'mail.export',
  COMMENT_CREATE: 'comment.create',
  ATTACHMENT_CREATE: 'attachment.create',
  ATTACHMENT_DELETE: 'attachment.delete',
  ANALYTICS_READ: 'analytics.read',
  NOTIFICATION_READ: 'notification.read',
  USER_READ: 'user.read',
  USER_MANAGE: 'user.manage',
  REFERENCE_MANAGE: 'reference.manage',
  AUDIT_READ: 'audit.read',
  SETTINGS_MANAGE: 'settings.manage',
  DB_MANAGE: 'db.manage',
  EMAIL_MANAGE: 'email.manage',
});

const ROLE_PERMISSIONS = Object.freeze({
  admin: ['*'],
  supervisor: [
    PERMISSIONS.MAIL_READ,
    PERMISSIONS.MAIL_CREATE,
    PERMISSIONS.MAIL_UPDATE,
    PERMISSIONS.MAIL_ASSIGN,
    PERMISSIONS.MAIL_VISA,
    PERMISSIONS.MAIL_REJECT,
    PERMISSIONS.MAIL_ARCHIVE,
    PERMISSIONS.MAIL_RESTORE,
    PERMISSIONS.MAIL_EXPORT,
    PERMISSIONS.COMMENT_CREATE,
    PERMISSIONS.ATTACHMENT_CREATE,
    PERMISSIONS.ATTACHMENT_DELETE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.NOTIFICATION_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  agent: [
    PERMISSIONS.MAIL_READ,
    PERMISSIONS.MAIL_CREATE,
    PERMISSIONS.MAIL_UPDATE,
    PERMISSIONS.MAIL_ASSIGN,
    PERMISSIONS.MAIL_VISA,
    PERMISSIONS.MAIL_REJECT,
    PERMISSIONS.MAIL_ARCHIVE,
    PERMISSIONS.MAIL_EXPORT,
    PERMISSIONS.COMMENT_CREATE,
    PERMISSIONS.ATTACHMENT_CREATE,
    PERMISSIONS.ATTACHMENT_DELETE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.NOTIFICATION_READ,
  ],
  consultation: [
    PERMISSIONS.MAIL_READ,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.NOTIFICATION_READ,
  ],
  archivist: [
    PERMISSIONS.MAIL_READ,
    PERMISSIONS.MAIL_ARCHIVE,
    PERMISSIONS.MAIL_RESTORE,
    PERMISSIONS.MAIL_EXPORT,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.NOTIFICATION_READ,
  ],
});

function permissionsForRole(role) {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes('*') ? Object.values(PERMISSIONS) : [...permissions];
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permissions = user.permissions || permissionsForRole(user.role);
  return permissions.includes(permission);
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsForRole,
  hasPermission,
};
