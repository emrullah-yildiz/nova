import crypto from 'node:crypto';
import { createJwksVerifier, createDevOidcVerifier } from '../server/auth/jwks-verifier.mjs';

// Encode a buffer to base64url
function base64url(buf) {
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Create a mock RSA JWK from a public key PEM
function pemToJwk(pem, kid = 'test-key-1') {
  // Use Node.js built-in to parse the PEM — much more reliable than hand-rolling DER parsing
  const keyObj = crypto.createPublicKey(pem);
  const jwk = keyObj.export({ format: 'jwk' });
  return {
    kty: jwk.kty || 'RSA',
    kid,
    n: jwk.n || '',
    e: jwk.e || ''
  };
}

// Sign a JWT payload with RSA private key
function signJwt(payload, privateKey, kid = 'test-key-1') {
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(headerB64 + '.' + payloadB64);
  const signature = sign.sign(privateKey);

  return headerB64 + '.' + payloadB64 + '.' + base64url(signature);
}

describe('OIDC/JWKS verifier', () => {
  it('rejects when issuer is not configured', async () => {
    const verifier = createJwksVerifier({ issuer: '', clientId: '' });
    await expect(verifier({ idToken: 'x.y.z', organizationSlug: 'demo' }))
      .rejects.toThrow(/OIDC issuer is not configured/);
  });

  it('rejects when client ID is not configured', async () => {
    const verifier = createJwksVerifier({ issuer: 'https://example.com', clientId: '' });
    await expect(verifier({ idToken: 'x.y.z', organizationSlug: 'demo' }))
      .rejects.toThrow(/OIDC client ID is not configured/);
  });

  it('rejects tokens with invalid JWT format', async () => {
    const verifier = createJwksVerifier({ issuer: 'https://example.com', clientId: 'my-client' });
    await expect(verifier({ idToken: 'not-a-jwt', organizationSlug: 'demo' }))
      .rejects.toThrow(/Invalid JWT format/);
  });

  it('rejects tokens with expired timestamps', async () => {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const jwk = pemToJwk(keys.publicKey);
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: 'https://example.com',
      aud: 'my-client',
      sub: 'user-123',
      email: 'user@example.com',
      exp: now - 3600, // expired 1 hour ago
      iat: now - 7200
    };

    const mockFetch = async (url) => {
      if (url.includes('.well-known/openid-configuration')) {
        return { ok: true, json: async () => ({ jwks_uri: 'https://example.com/.well-known/jwks.json' }) };
      }
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    };

    const verifier = createJwksVerifier({
      issuer: 'https://example.com',
      clientId: 'my-client',
      fetchImpl: mockFetch
    });

    const token = signJwt(payload, keys.privateKey, 'test-key-1');
    await expect(verifier({ idToken: token, organizationSlug: 'demo' }))
      .rejects.toThrow(/expired/);
  });

  it('validates a correctly signed token', async () => {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const jwk = pemToJwk(keys.publicKey);
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: 'https://example.com',
      aud: 'my-client',
      sub: 'user-123',
      email: 'sso.user@example.com',
      name: 'SSO User',
      exp: now + 3600,
      iat: now
    };

    const mockFetch = async (url) => {
      if (url.includes('.well-known/openid-configuration')) {
        return { ok: true, json: async () => ({ jwks_uri: 'https://example.com/.well-known/jwks.json' }) };
      }
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    };

    const verifier = createJwksVerifier({
      issuer: 'https://example.com',
      clientId: 'my-client',
      fetchImpl: mockFetch
    });

    const token = signJwt(payload, keys.privateKey, 'test-key-1');
    const result = await verifier({ idToken: token, organizationSlug: 'demo' });

    expect(result.email).toBe('sso.user@example.com');
    expect(result.displayName).toBe('SSO User');
    expect(result.sub).toBe('user-123');
    expect(result.organizationSlug).toBe('demo');
  });

  it('rejects tokens with wrong audience', async () => {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const jwk = pemToJwk(keys.publicKey);
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: 'https://example.com',
      aud: 'wrong-client',
      sub: 'user-123',
      email: 'user@example.com',
      exp: now + 3600,
      iat: now
    };

    const mockFetch = async (url) => {
      if (url.includes('.well-known/openid-configuration')) {
        return { ok: true, json: async () => ({ jwks_uri: 'https://example.com/.well-known/jwks.json' }) };
      }
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    };

    const verifier = createJwksVerifier({
      issuer: 'https://example.com',
      clientId: 'my-client',
      fetchImpl: mockFetch
    });

    const token = signJwt(payload, keys.privateKey, 'test-key-1');
    await expect(verifier({ idToken: token, organizationSlug: 'demo' }))
      .rejects.toThrow(/audience/);
  });

  it('rejects tokens with wrong issuer', async () => {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const jwk = pemToJwk(keys.publicKey);
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: 'https://evil.com',
      aud: 'my-client',
      sub: 'user-123',
      email: 'user@evil.com',
      exp: now + 3600,
      iat: now
    };

    const mockFetch = async (url) => {
      if (url.includes('.well-known/openid-configuration')) {
        return { ok: true, json: async () => ({ jwks_uri: 'https://example.com/.well-known/jwks.json' }) };
      }
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    };

    const verifier = createJwksVerifier({
      issuer: 'https://example.com',
      clientId: 'my-client',
      fetchImpl: mockFetch
    });

    const token = signJwt(payload, keys.privateKey, 'test-key-1');
    await expect(verifier({ idToken: token, organizationSlug: 'demo' }))
      .rejects.toThrow(/issuer/);
  });

  it('dev OIDC verifier accepts the test token', async () => {
    const verifier = createDevOidcVerifier();
    const result = await verifier({ idToken: 'valid-id-token', organizationSlug: 'demo' });
    expect(result.email).toBe('sso.user@example.com');
    expect(result.externalSubject).toBe('oidc|sso-user');
  });

  it('dev OIDC verifier rejects invalid tokens', async () => {
    const verifier = createDevOidcVerifier();
    await expect(verifier({ idToken: 'bad-token', organizationSlug: 'demo' }))
      .rejects.toThrow(/Invalid OIDC token/);
  });

  it('caches JWKS keys and only fetches once', async () => {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const jwk = pemToJwk(keys.publicKey);
    let fetchCount = 0;

    const mockFetch = async (url) => {
      fetchCount++;
      if (url.includes('.well-known/openid-configuration')) {
        return { ok: true, json: async () => ({ jwks_uri: 'https://example.com/.well-known/jwks.json' }) };
      }
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://example.com',
      aud: 'my-client',
      sub: 'user-123',
      email: 'user@example.com',
      name: 'User',
      exp: now + 3600,
      iat: now
    };

    const verifier = createJwksVerifier({
      issuer: 'https://example.com',
      clientId: 'my-client',
      fetchImpl: mockFetch,
      cacheTtlMs: 60000
    });

    const token = signJwt(payload, keys.privateKey, 'test-key-1');
    await verifier({ idToken: token, organizationSlug: 'demo' });
    await verifier({ idToken: token, organizationSlug: 'demo' });
    await verifier({ idToken: token, organizationSlug: 'demo' });

    // Should only fetch config + JWKS once (2 calls), not 6
    expect(fetchCount).toBe(2);
  });
});