import { getJwtSecret } from './jwt-secret.js';

describe('getJwtSecret', () => {
  it.each([undefined, '', '   '])(
    'rejects a missing or empty JWT_SECRET',
    (secret) => {
      expect(() => getJwtSecret(secret)).toThrow(
        'JWT_SECRET must be configured and non-empty',
      );
    },
  );

  it('returns the configured JWT_SECRET', () => {
    expect(getJwtSecret('test-only-secret')).toBe('test-only-secret');
  });
});
