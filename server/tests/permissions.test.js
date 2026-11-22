'use strict';

const {
  PERMISSIONS,
  permissionsForRole,
  hasPermission,
} = require('../src/lib/permissions');

describe('permissions', () => {
  it('grants every permission to admins', () => {
    const permissions = permissionsForRole('admin');
    expect(permissions).toContain(PERMISSIONS.DB_MANAGE);
    expect(permissions).toContain(PERMISSIONS.MAIL_VISA);
  });

  it('keeps consultation users read-only', () => {
    const user = { role: 'consultation' };
    expect(hasPermission(user, PERMISSIONS.MAIL_READ)).toBe(true);
    expect(hasPermission(user, PERMISSIONS.MAIL_CREATE)).toBe(false);
    expect(hasPermission(user, PERMISSIONS.MAIL_DELETE)).toBe(false);
  });

  it('allows archivists to archive and restore only', () => {
    const user = { role: 'archivist' };
    expect(hasPermission(user, PERMISSIONS.MAIL_ARCHIVE)).toBe(true);
    expect(hasPermission(user, PERMISSIONS.MAIL_RESTORE)).toBe(true);
    expect(hasPermission(user, PERMISSIONS.MAIL_CREATE)).toBe(false);
  });

  it('rejects unknown roles', () => {
    expect(permissionsForRole('unknown')).toEqual([]);
    expect(hasPermission({ role: 'unknown' }, PERMISSIONS.MAIL_READ)).toBe(false);
  });
});
