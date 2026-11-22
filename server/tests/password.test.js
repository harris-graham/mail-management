'use strict';

const { validatePasswordPolicy } = require('../src/lib/password');

describe('password policy', () => {
  it('accepts a strong password', () => {
    expect(validatePasswordPolicy('Str0ng!Passw0rd')).toBeNull();
  });

  it('rejects short passwords', () => {
    expect(validatePasswordPolicy('Ab1!')).toMatch(/10 characters/);
  });

  it('requires mixed character classes', () => {
    expect(validatePasswordPolicy('alllowercase1!')).toMatch(/uppercase/);
    expect(validatePasswordPolicy('ALLUPPERCASE1!')).toMatch(/lowercase/);
    expect(validatePasswordPolicy('NoDigitsHere!')).toMatch(/digit/);
    expect(validatePasswordPolicy('NoSymbols12345')).toMatch(/symbol/);
  });
});
