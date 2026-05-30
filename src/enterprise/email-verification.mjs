// Signup-time email deliverability checks. Two layers, both runtime-agnostic
// (global fetch only, so they run on the Worker and in Node):
//   1. Disposable/throwaway domain blocklist — reject obvious junk mailboxes.
//   2. MX (mail-server) lookup via DNS-over-HTTPS — reject domains that can't
//      receive mail at all (typos, made-up domains).
//
// Both are best-effort gatekeepers, NOT proof of ownership — that's what the
// emailed verification link is for. The MX check FAILS OPEN: if the DNS lookup
// errors or times out we allow the signup, so a DNS hiccup never takes signup
// down. Only a definitive "this domain has no mail servers" rejects.

import { createHttpError } from './domain.mjs';

// Common disposable/temporary-mail domains. Not exhaustive — a starter set that
// catches the obvious throwaways; extend as needed.
export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'grr.la',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org',
  'throwawaymail.com', 'getnada.com', 'nada.email', 'trashmail.com',
  'yopmail.com', 'yopmail.net', 'dispostable.com', 'maildrop.cc',
  'fakeinbox.com', 'sharklasers.com', 'spam4.me', 'mailnesia.com',
  'mohmal.com', 'mintemail.com', 'mytemp.email', 'tempinbox.com',
  'emailondeck.com', 'tempr.email', 'discard.email', 'mailcatch.com',
  'inboxbear.com', 'tmpmail.org', 'moakt.com', 'luxusmail.org'
]);

export function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 0) return '';
  return String(email).slice(at + 1).trim().toLowerCase();
}

export function isDisposableDomain(domain) {
  return DISPOSABLE_DOMAINS.has(String(domain || '').toLowerCase());
}

// DNS-over-HTTPS MX lookup against Cloudflare's resolver. Returns:
//   true  — domain has MX (or an A/AAAA fallback that can accept mail)
//   false — resolver answered authoritatively that there are no such records
//   null  — couldn't determine (network/timeout/parse) → caller should fail open
export async function domainHasMailServer(domain, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (!fetchImpl || !domain) return null;
  const query = async (type) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs || 3000) : null;
    try {
      const res = await fetchImpl(
        'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=' + type,
        { headers: { accept: 'application/dns-json' }, signal: controller ? controller.signal : undefined }
      );
      if (!res.ok) return null;
      const data = await res.json();
      // Status 0 = NOERROR. Answer entries with the requested record type present.
      if (data && data.Status === 0 && Array.isArray(data.Answer)) {
        const wanted = type === 'MX' ? 15 : type === 'A' ? 1 : 28;
        return data.Answer.some(a => a && a.type === wanted);
      }
      // NOERROR with no answer, or NXDOMAIN (3) → authoritatively absent.
      if (data && (data.Status === 0 || data.Status === 3)) return false;
      return null;
    } catch {
      return null; // network/timeout/abort → unknown
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const mx = await query('MX');
  if (mx === true) return true;
  if (mx === null) return null; // lookup failed → unknown (fail open upstream)
  // No MX: some domains still accept mail on their A record. Check before rejecting.
  const a = await query('A');
  if (a === true) return true;
  if (a === null) return null;
  return false;
}

// Throws createHttpError(400) for a disposable domain or a domain with no mail
// servers. Resolves silently when the email looks deliverable OR when we can't
// tell (fail open). Format is assumed already validated by validateSignupBody.
export async function assertDeliverableEmail(email, options = {}) {
  const domain = emailDomain(email);
  if (!domain) throw createHttpError(400, 'Enter a valid email address.');
  if (isDisposableDomain(domain)) {
    throw createHttpError(400, 'Please use a permanent email address — disposable email providers aren’t allowed.');
  }
  if (options.skipMxCheck) return;
  const reachable = await domainHasMailServer(domain, options);
  if (reachable === false) {
    throw createHttpError(400, 'That email domain can’t receive mail. Check the address for typos.');
  }
}
