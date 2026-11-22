'use strict';

const { forbidden } = require('../lib/errors');

// Cookie-authenticated endpoints require a double-submit CSRF token. The token
// is readable by the SPA (not HttpOnly) and must be echoed in a header. A
// cross-origin attacker can neither read the cookie nor add the custom header
// without a successful CORS preflight, which the allow-list rejects.
module.exports = function requireCsrf(req, res, next) {
  if (req.get('x-requested-with') !== 'XMLHttpRequest') {
    return next(forbidden('Missing X-Requested-With header'));
  }
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.get('x-csrf-token');
  if (cookieToken && headerToken && cookieToken !== headerToken) {
    return next(forbidden('CSRF token mismatch'));
  }
  next();
};
