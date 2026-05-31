// Pure helper for the invite flow's status message. Kept out of save-load.js
// (which is DOM-coupled) so the "no lies about delivery" logic is unit-testable
// in isolation. Given the tallies of what actually happened, it returns the
// truthful status text + whether it's an error/ok state + the join links that
// should be surfaced for manual sharing.
//
// Contract:
//   delivered    — count of recipients a real provider confirmed it emailed
//   created      — count of recipients whose invite/link was created but NOT
//                  emailed because no email delivery is configured
//   undelivered  — count of recipients whose link was created but a REAL
//                  provider genuinely failed to deliver the email
//   failed       — count of recipients whose request failed entirely (no link)
//   links        — array of { email, joinUrl } for the created/undelivered
//                  invites, so the caller can show a copyable link
//
// Returns { text, state: 'ok'|'warn'|'err', links }.
export function buildInviteStatus({ delivered = 0, created = 0, undelivered = 0, failed = 0, links = [] } = {}) {
  const parts = [];
  let state = 'ok';

  if (delivered > 0) {
    parts.push('Invitation' + (delivered > 1 ? 's' : '') + ' emailed' + (delivered > 1 ? ' to ' + delivered + ' people' : '') + '.');
  }

  if (created > 0) {
    // Honest: the link exists but no email could be sent because delivery
    // isn't configured. Surface that it must be shared manually.
    const who = created > 1 ? created + ' people' : '1 person';
    parts.push('Invite created for ' + who + ' — email delivery isn’t configured, so share the link' + (created > 1 ? 's' : '') + ' below.');
    if (state === 'ok') state = 'warn';
  }

  if (undelivered > 0) {
    // Honest: a real provider was configured and tried, but the send failed.
    // Do NOT say "not configured" — that would be a different lie.
    const who = undelivered > 1 ? undelivered + ' people' : '1 person';
    parts.push('Invite created for ' + who + ' — but the email couldn’t be delivered. Share the link' + (undelivered > 1 ? 's' : '') + ' below.');
    if (state === 'ok') state = 'warn';
  }

  if (failed > 0) {
    parts.push(failed + ' failed');
    state = 'err';
  }

  if (parts.length === 0) {
    return { text: 'Nothing to invite.', state: 'err', links: [] };
  }

  // Join the failure tally onto the previous sentence with a separator for a
  // compact one-liner (e.g. "Invitations emailed. · 1 failed").
  let text;
  if (failed > 0 && parts.length > 1) {
    const tail = parts.pop();
    text = parts.join(' ') + ' · ' + tail + '.';
  } else if (failed > 0) {
    text = parts[0] + '.';
  } else {
    text = parts.join(' ');
  }

  return { text, state, links: Array.isArray(links) ? links : [] };
}
