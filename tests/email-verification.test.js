import { describe, it, expect } from 'vitest';
import {
  assertDeliverableEmail,
  domainHasMailServer,
  isDisposableDomain,
  emailDomain
} from '../src/enterprise/email-verification.mjs';

// DNS-over-HTTPS responses are mocked so these never touch the network.
function dohFetch(byDomain) {
  return async (url) => {
    const u = new URL(url);
    const name = u.searchParams.get('name');
    const type = u.searchParams.get('type');
    const entry = byDomain[name] || {};
    const has = type === 'MX' ? entry.mx : type === 'A' ? entry.a : false;
    return {
      ok: true,
      json: async () => ({ Status: entry.status ?? 0, Answer: has ? [{ type: type === 'MX' ? 15 : 1 }] : [] })
    };
  };
}

describe('email deliverability checks', () => {
  it('flags disposable domains', () => {
    expect(isDisposableDomain('mailinator.com')).toBe(true);
    expect(isDisposableDomain('Mailinator.com')).toBe(true);
    expect(isDisposableDomain('gmail.com')).toBe(false);
    expect(emailDomain('a@b.co')).toBe('b.co');
  });

  it('rejects disposable addresses before any DNS lookup', async () => {
    await expect(assertDeliverableEmail('x@mailinator.com')).rejects.toMatchObject({ status: 400 });
  });

  it('accepts a domain that has MX records', async () => {
    const fetch = dohFetch({ 'good.com': { mx: true } });
    await expect(assertDeliverableEmail('a@good.com', { fetch })).resolves.toBeUndefined();
    expect(await domainHasMailServer('good.com', { fetch })).toBe(true);
  });

  it('accepts a domain with no MX but an A record (mail on the apex)', async () => {
    const fetch = dohFetch({ 'apex.com': { mx: false, a: true } });
    await expect(assertDeliverableEmail('a@apex.com', { fetch })).resolves.toBeUndefined();
  });

  it('rejects a domain with no MX and no A record', async () => {
    const fetch = dohFetch({ 'nope.xyz': { mx: false, a: false } });
    await expect(assertDeliverableEmail('a@nope.xyz', { fetch })).rejects.toMatchObject({ status: 400 });
    expect(await domainHasMailServer('nope.xyz', { fetch })).toBe(false);
  });

  it('fails open when the DNS lookup errors (never blocks signup on a hiccup)', async () => {
    const fetch = async () => { throw new Error('network down'); };
    expect(await domainHasMailServer('whatever.com', { fetch })).toBe(null);
    await expect(assertDeliverableEmail('a@whatever.com', { fetch })).resolves.toBeUndefined();
  });

  it('can skip the MX check entirely', async () => {
    await expect(assertDeliverableEmail('a@anything.com', { skipMxCheck: true })).resolves.toBeUndefined();
  });
});
