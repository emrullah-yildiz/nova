// Transactional email for the Worker + node, via fetch only (no SDK, so it runs
// on workerd). Resend is used when RESEND_API_KEY is set; otherwise a console
// fallback logs the message (and the verification link) so local dev — and any
// deployment without a provider configured — still works without silently
// dropping mail. See [[project-accounts-collab]].

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function createResendEmailService({ apiKey, from, fetch: fetchImpl } = {}) {
  // send() never throws: it returns a structured result so callers can report
  // the TRUTH about delivery. A non-2xx response or a network error both yield
  // { delivered:false, ... } rather than a thrown exception, so the UI is never
  // told an email was sent when it wasn't.
  const send = async ({ to, subject, html, text }) => {
    const f = fetchImpl || globalThis.fetch;
    try {
      const res = await f(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html, text })
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { delivered: false, provider: 'resend', error: 'Resend send failed (' + res.status + '): ' + body.slice(0, 200) };
      }
      const data = await res.json().catch(() => ({}));
      return { delivered: true, provider: 'resend', id: data && data.id ? data.id : undefined };
    } catch (error) {
      return { delivered: false, provider: 'resend', error: (error && error.message) || String(error) };
    }
  };
  return { provider: 'resend', from, send };
}

// No-op-ish fallback: logs instead of sending. Keeps signup working when no
// provider is configured; the verification link is printed so a dev (or an
// operator reading `wrangler tail`) can still complete the flow.
export function createConsoleEmailService({ logger = console } = {}) {
  return {
    provider: 'console',
    from: 'console',
    async send({ to, subject, text }) {
      logger.log('[nova-email] (no provider configured) would send to %s — %s\n%s', to, subject, text || '');
      // Honest result: nothing was actually emailed.
      return { delivered: false, provider: 'console' };
    }
  };
}

// Picks Resend when an API key is present, else the console fallback.
export function createEmailService(env = {}) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.NOVA_EMAIL_FROM || 'Nova <onboarding@resend.dev>';
  if (apiKey) return createResendEmailService({ apiKey, from });
  return createConsoleEmailService();
}

// Builds the verification email. The link points at the SPA (?verify=<token>),
// which posts the token back to /api/auth/verify on load — no server redirect
// plumbing needed.
export function buildVerificationEmail({ appUrl, token, displayName, email }) {
  const base = (appUrl || '').replace(/\/+$/, '');
  const link = base + '/?verify=' + encodeURIComponent(token);
  const name = displayName || (email ? email.split('@')[0] : 'there');
  const subject = 'Verify your email for Nova';
  const text =
    'Hi ' + name + ',\n\n' +
    'Confirm your email address to finish setting up your Nova account:\n' +
    link + '\n\n' +
    'This link expires in 24 hours. If you didn’t create a Nova account, you can ignore this email.';
  const html =
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1c1c28">' +
      '<h2 style="margin:0 0 12px">Verify your email</h2>' +
      '<p style="margin:0 0 16px;color:#444">Hi ' + escapeHtml(name) + ', confirm your email address to finish setting up your Nova account.</p>' +
      '<p style="margin:0 0 24px"><a href="' + escapeHtml(link) + '" style="display:inline-block;background:#89b4fa;color:#11111b;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:7px">Verify email</a></p>' +
      '<p style="margin:0 0 8px;color:#777;font-size:13px">Or paste this link into your browser:</p>' +
      '<p style="margin:0 0 24px;color:#777;font-size:13px;word-break:break-all">' + escapeHtml(link) + '</p>' +
      '<p style="margin:0;color:#999;font-size:12px">This link expires in 24 hours. If you didn’t create a Nova account, you can ignore this email.</p>' +
    '</div>';
  return { subject, text, html };
}

// Project share invite. Link points at the SPA (?join=<token>), redeemed on
// load (the invitee signs in, then joins the project at the link's role).
export function buildInviteEmail({ appUrl, token, projectName, inviterName, role }) {
  const base = (appUrl || '').replace(/\/+$/, '');
  const link = base + '/?join=' + encodeURIComponent(token);
  const access = role === 'Viewer' ? 'view' : 'edit';
  const proj = projectName || 'a Nova project';
  const inviter = inviterName || 'Someone';
  const subject = inviter + ' invited you to ' + proj + ' on Nova';
  const text =
    inviter + ' invited you to ' + access + ' "' + proj + '" on Nova.\n\n' +
    'Open the project (you\'ll be asked to sign in first):\n' + link + '\n\n' +
    'If you weren’t expecting this, you can ignore this email.';
  const html =
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1c1c28">' +
      '<h2 style="margin:0 0 12px">You’ve been invited to a Nova project</h2>' +
      '<p style="margin:0 0 16px;color:#444">' + escapeHtml(inviter) + ' invited you to <strong>' + escapeHtml(access) + '</strong> “' + escapeHtml(proj) + '”.</p>' +
      '<p style="margin:0 0 24px"><a href="' + escapeHtml(link) + '" style="display:inline-block;background:#89b4fa;color:#11111b;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:7px">Open project</a></p>' +
      '<p style="margin:0 0 8px;color:#777;font-size:13px">You’ll be asked to sign in first. Or paste this link:</p>' +
      '<p style="margin:0 0 24px;color:#777;font-size:13px;word-break:break-all">' + escapeHtml(link) + '</p>' +
      '<p style="margin:0;color:#999;font-size:12px">If you weren’t expecting this, you can ignore this email.</p>' +
    '</div>';
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
