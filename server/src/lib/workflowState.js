'use strict';

// Pure workflow definition. Kept free of I/O so it can be unit-tested and
// reused by both the API and reporting code.

const TRANSITIONS = Object.freeze({
  draft: { analyze: 'analyzed', cancel: 'cancelled' },
  registered: {
    analyze: 'analyzed',
    submit_visa: 'pending_visa',
    assign: 'assigned',
    archive: 'archived',
    cancel: 'cancelled',
  },
  analyzed: {
    submit_visa: 'pending_visa',
    assign: 'assigned',
    archive: 'archived',
    cancel: 'cancelled',
  },
  pending_visa: {
    approve_visa: 'visa_approved',
    reject_visa: 'visa_rejected',
    cancel: 'cancelled',
  },
  visa_approved: {
    assign: 'assigned',
    process: 'processed',
    archive: 'archived',
  },
  visa_rejected: { archive: 'archived', reopen: 'registered' },
  assigned: { start: 'in_progress', process: 'processed', archive: 'archived' },
  in_progress: { process: 'processed', archive: 'archived' },
  processed: { archive: 'archived', reopen: 'in_progress' },
  archived: { restore: 'processed' },
  cancelled: { reopen: 'registered' },
});

function allowedActions(status) {
  return Object.keys(TRANSITIONS[status] || {});
}

module.exports = { TRANSITIONS, allowedActions };
