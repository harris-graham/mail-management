'use strict';

const { PREFIXES } = require('../src/lib/reference');

describe('reference prefixes', () => {
  it('maps every mail type', () => {
    expect(PREFIXES.correspondance).toBe('CORR');
    expect(PREFIXES.consultation).toBe('CONS');
    expect(PREFIXES.def).toBe('DEF');
  });
});
