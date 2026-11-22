'use strict';

const { TRANSITIONS, allowedActions } = require('../src/lib/workflowState');

describe('workflow state machine', () => {
  it('moves a registered record through visa and archive', () => {
    expect(TRANSITIONS.registered.submit_visa).toBe('pending_visa');
    expect(TRANSITIONS.pending_visa.approve_visa).toBe('visa_approved');
    expect(TRANSITIONS.visa_approved.archive).toBe('archived');
    expect(TRANSITIONS.archived.restore).toBe('processed');
  });

  it('rejects invalid jumps', () => {
    expect(TRANSITIONS.registered.approve_visa).toBeUndefined();
    expect(TRANSITIONS.archived.submit_visa).toBeUndefined();
  });

  it('exposes the actions for a status', () => {
    expect(allowedActions('pending_visa')).toEqual([
      'approve_visa',
      'reject_visa',
      'cancel',
    ]);
    expect(allowedActions('unknown')).toEqual([]);
  });
});
