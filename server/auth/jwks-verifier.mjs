import crypto from 'node:crypto';
import { createHttpError } from '../../src/enterprise/domain.mjs';

/**
 * Real OIDC/JWKS token verifier.
 *
 * Fetches the provider's OpenID configuration, retrieves the JWKS (public keys),
 * and cryptographically verifies the ID token's signature using Node's built-in
 * crypto module. No extra dependencies required.
 *
 * Usage:
 *   const verifier = createJwksVerifier({
 *     issuer: 'https://accounts.google.com',
 *     clientId: 'your-client-id.apps.googleusercontent.com',
 *     fetchImpl: globalThis.fetch
 *   });
 *   const identity = await verifier({ idToken: '...', organizationSlug: 'demo' });
 */

export function createJwksVerifier(options = {}) {
  const issuer = options.issuer || '';
  const clientId = options.clientId || '';
  const fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const cacheTtlMs = options.cacheTtlMs || 5 * 60 * 1000; // 5 minute JWKS cache

  let jwksCache = { keys: [], fetchedAt: 0 };

  if (!issuer) {
    return async () => {
      throw createHttpError(500, 'OIDC issuer is not configured. Set NOVA_OIDC_ISSUER.');
    };
  }

  if (!clientId) {
    return async () => {
      throw createHttpError(500, 'OIDC client ID is not configured. Set NOVA_OIDC_CLIENT_ID.');
    };
  }

  if (!fetchImpl) {
    return async () => {
      throw createHttpError(500, 'Fetch API is not available for OIDC verification.');
    };
  }

  async function getJwks() {
    const now = Date.now();
    if (jwksCache.keys.length > 0 && now - jwksCache.fetchedAt < cacheTtlMs) {
      return jwksCache.keys;
    }

    // Fetch OpenID configuration
    const configUrl = issuer.replace(/\/+$/, '') + '/.well-known/openid-configuration';
    const configResponse = await fetchImpl(configUrl);
    if (!configResponse.ok) {
      throw createHttpError(502, 'Failed to fetch OIDC configuration from ' + configUrl);
    }
    const config = await configResponse.json();
    const jwksUri = config.jwks_uri;
    if (!jwksUri) {
      throw createHttpError(502, 'OIDC configuration missing jwks_uri');
    }

    // Fetch JWKS (public keys)
    const jwksResponse = await fetchImpl(jwksUri);
    if (!jwksResponse.ok) {
      throw createHttpError(502, 'Failed to fetch JWKS from ' + jwksUri);
    }
    const jwks = await jwksResponse.json();

    jwksCache = { keys: jwks.keys || [], fetchedAt: Date.now() };
    return jwksCache.keys;
  }

  function base64UrlDecode(str) {
    // Add padding
    const padded = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = padded.length % 4;
    const full = padding ? padded + '='.repeat(4 - padding) : padded;
    return Buffer.from(full, 'base64');
  }

  function findKey(keys, kid) {
    if (kid) {
      return keys.find(k => k.kid === kid);
    }
    // If no kid, try to use the first key
    return keys[0];
  }

  function getPublicKey(jwk) {
    if (jwk.kty !== 'RSA') {
      throw createHttpError(401, 'Unsupported key type: ' + jwk.kty + '. Only RSA is supported.');
    }
    const n = base64UrlDecode(jwk.n);
    const e = base64UrlDecode(jwk.e);

    // Build a PEM-formatted public key from modulus and exponent
    // ASN.1 structure for RSA public key
    const modulus = n;
    const exponent = e;

    // Build RSAPublicKey ASN.1 SEQUENCE
    const modulusTag = 0x02;
    const exponentTag = 0x02;

    function encodeLength(length) {
      if (length < 128) return Buffer.from([length]);
      const bytes = [];
      let len = length;
      while (len > 0) {
        bytes.unshift(len & 0xFF);
        len >>= 8;
      }
      return Buffer.concat([Buffer.from([0x80 | bytes.length]), Buffer.from(bytes)]);
    }

    function encodeInteger(value) {
      // Add leading zero if high bit is set (to prevent negative interpretation)
      const prefix = value[0] >= 0x80 ? Buffer.from([0x00]) : Buffer.alloc(0);
      const content = Buffer.concat([prefix, value]);
      return Buffer.concat([Buffer.from([modulusTag]), encodeLength(content.length), content]);
    }

    const encodedModulus = encodeInteger(modulus);
    const encodedExponent = encodeInteger(exponent);

    const sequenceContent = Buffer.concat([encodedModulus, encodedExponent]);
    const sequenceTag = 0x30;
    const publicKey = Buffer.concat([Buffer.from([sequenceTag]), encodeLength(sequenceContent.length), sequenceContent]);

    // Wrap in SubjectPublicKeyInfo
    const algorithmIdentifier = Buffer.from([
      0x30, 0x0d, // SEQUENCE
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption OID
      0x05, 0x00 // NULL
    ]);

    const spkiContent = Buffer.concat([algorithmIdentifier, Buffer.from([0x03]), encodeLength(publicKey.length + 1), Buffer.from([0x00]), publicKey]);
    const spki = Buffer.concat([Buffer.from([sequenceTag]), encodeLength(spkiContent.length), spkiContent]);

    // Convert to PEM
    const base64 = spki.toString('base64');
    const lines = base64.match(/.{1,64}/g) || [];
    return '-----BEGIN PUBLIC KEY-----\n' + lines.join('\n') + '\n-----END PUBLIC KEY-----';
  }

  return async function verifyOidcToken({ idToken, organizationSlug }) {
    if (!idToken) throw createHttpError(401, 'Missing idToken.');

    // Decode JWT parts
    const parts = String(idToken).split('.');
    if (parts.length !== 3) throw createHttpError(401, 'Invalid JWT format.');

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header
    let header;
    try {
      header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    } catch (e) {
      throw createHttpError(401, 'Invalid JWT header.');
    }

    // Decode payload
    let payload;
    try {
      payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
    } catch (e) {
      throw createHttpError(401, 'Invalid JWT payload.');
    }

    // Verify issuer
    if (payload.iss && !issuer.includes(payload.iss) && !payload.iss.includes(issuer)) {
      throw createHttpError(401, 'Invalid token issuer: ' + payload.iss);
    }

    // Verify audience (client ID)
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud || ''];
    if (!aud.includes(clientId)) {
      throw createHttpError(401, 'Invalid token audience.');
    }

    // Verify expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw createHttpError(401, 'ID token has expired.');
    }

    // Get the signing key
    const keys = await getJwks();
    const key = findKey(keys, header.kid);
    if (!key) {
      throw createHttpError(401, 'No matching JWK key found for kid: ' + (header.kid || 'none'));
    }

    // Verify signature
    const pem = getPublicKey(key);
    const signature = base64UrlDecode(signatureB64);
    const signedContent = headerB64 + '.' + payloadB64;

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signedContent);
    const isValid = verify.verify(pem, signature);

    if (!isValid) {
      throw createHttpError(401, 'Invalid ID token signature.');
    }

    // Extract identity
    return {
      email: payload.email || '',
      displayName: payload.name || payload.given_name || payload.email || '',
      sub: payload.sub || '',
      organizationSlug
    };
  };
}

export function createDevOidcVerifier() {
  return async function devVerifier({ idToken, organizationSlug }) {
    if (idToken === 'valid-id-token') {
      return {
        email: 'sso.user@example.com',
        displayName: 'SSO User',
        externalSubject: 'oidc|sso-user',
        organizationSlug
      };
    }
    throw createHttpError(401, 'Invalid OIDC token.');
  };
}