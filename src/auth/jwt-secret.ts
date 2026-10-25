export function getJwtSecret(secret = process.env.JWT_SECRET): string {
  if (!secret?.trim()) {
    throw new Error('JWT_SECRET must be configured and non-empty');
  }

  return secret;
}
