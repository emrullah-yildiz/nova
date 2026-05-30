import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../server/auth/webcrypto.mjs';

// PBKDF2 password hashing used for email+password accounts. Runs in Node here,
// but uses only WebCrypto so it behaves identically on the Cloudflare Worker.

describe('password hashing (PBKDF2 / WebCrypto)', () => {
  it('hashes to a self-describing PHC-style string and verifies the right password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^pbkdf2\$sha256\$\d+\$[^$]+\$[^$]+$/);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('s3cret-password');
    expect(await verifyPassword('not-the-password', hash)).toBe(false);
  });

  it('uses a unique salt per hash — same password yields different hashes', async () => {
    const a = await hashPassword('same-password-123');
    const b = await hashPassword('same-password-123');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password-123', a)).toBe(true);
    expect(await verifyPassword('same-password-123', b)).toBe(true);
  });

  it('is deterministic given a fixed salt + iteration count', async () => {
    const salt = new Uint8Array(16).fill(7);
    const h1 = await hashPassword('pw', { salt, iterations: 1000 });
    const h2 = await hashPassword('pw', { salt, iterations: 1000 });
    expect(h1).toBe(h2);
    expect(h1).toContain('$1000$');
  });

  it('returns false (never throws) for malformed stored hashes', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$sha256$notanumber$salt$hash')).toBe(false);
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword(null, 'pbkdf2$sha256$1000$AAAA$BBBB')).toBe(false);
  });

  it('throws when hashing an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });
});
