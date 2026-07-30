import { describe, expect, it } from 'vitest';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  passwordPolicyError,
} from './passwordPolicy';

describe('password policy', () => {
  it('accepts printable Unicode and internal ordinary spaces unchanged', () => {
    expect(passwordPolicyError('password nuova café ☕')).toBeNull();
    expect(passwordPolicyError('simboli !£$%& validi')).toBeNull();
    expect(passwordPolicyError('🧭'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(passwordPolicyError('🧭'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
  });

  it.each([
    ['short', 'almeno 12'],
    ['x'.repeat(MAX_PASSWORD_LENGTH + 1), 'non può superare 200'],
    [' password-sicura', 'non può iniziare'],
    ['password-sicura ', 'non può iniziare'],
    ['password\tvalida', 'solo caratteri stampabili'],
    ['password\nvalida', 'solo caratteri stampabili'],
    ['password\0valida', 'solo caratteri stampabili'],
    ['password\u200bvalida', 'solo caratteri stampabili'],
    ['password\u00a0valida', 'solo caratteri stampabili'],
  ])('rejects %j', (password, expectedMessage) => {
    expect(passwordPolicyError(password)).toContain(expectedMessage);
  });
});
