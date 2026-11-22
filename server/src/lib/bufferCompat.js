'use strict';

// Node.js 26 removed Buffer.SlowBuffer, which jsonwebtoken's transitive
// dependency `buffer-equal-constant-time` still reads at import time. Restore
// the alias before any JWT module is loaded.
const buffer = require('buffer');

if (typeof buffer.SlowBuffer === 'undefined') {
  buffer.SlowBuffer = buffer.Buffer;
}
