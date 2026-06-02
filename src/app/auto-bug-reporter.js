// Auto-files unhandled app errors as bug tickets (GitHub issues) via the existing
// authenticated submitTicket endpoint, then shows a toast. Fully automatic per the
// product decision, but fenced so it can never spam the tracker:
//   - only when signed in (the endpoint is authenticated) and a client exists
//   - skips noise (empty / cross-origin "Script error." with no stack)
//   - dedups within the session AND across reloads (localStorage fingerprints)
//   - caps the number of auto-tickets per session
//   - honors an off-switch (localStorage 'nova:auto-bug-tickets' = 'off')
//
// A failure here must never surface or throw — it's running inside the global
// error handler.

import { errorFingerprint, isReportableError, buildBugTicket } from '../ai/bug-reporter.js';

const ENABLE_KEY = 'nova:auto-bug-tickets';      // 'off' disables; anything else = on
const SEEN_KEY = 'nova:auto-bug-fingerprints';   // recent fingerprints, cross-reload dedup
const SESSION_CAP = 5;
const SEEN_MAX = 100;

export function installAutoBugReporter(app) {
  if (typeof window === 'undefined' || !app) return;
  if (window.__autoBugReporterInstalled) return;
  window.__autoBugReporterInstalled = true;

  const sessionSeen = new Set();
  let sessionCount = 0;

  const enabled = () => {
    try { return localStorage.getItem(ENABLE_KEY) !== 'off'; } catch { return true; }
  };
  const recentSeen = () => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
  };
  const rememberFingerprint = (fp) => {
    try {
      const list = recentSeen();
      list.push(fp);
      while (list.length > SEEN_MAX) list.shift();
      localStorage.setItem(SEEN_KEY, JSON.stringify(list));
    } catch { /* localStorage may be unavailable */ }
  };

  const toast = (msg) => {
    try {
      let host = document.getElementById('nova-toast-host');
      if (!host) { host = document.createElement('div'); host.id = 'nova-toast-host'; document.body.appendChild(host); }
      const t = document.createElement('div');
      t.className = 'nova-toast';
      t.textContent = msg;
      host.appendChild(t);
      setTimeout(() => t.classList.add('nova-toast-out'), 4200);
      setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 4800);
    } catch { /* never let a toast failure matter */ }
  };

  const report = (errInfo) => {
    try {
      if (!enabled() || sessionCount >= SESSION_CAP) return;
      if (!isReportableError(errInfo.message, errInfo.stack)) return;

      const fp = errorFingerprint(errInfo.message, errInfo.stack);
      if (sessionSeen.has(fp) || recentSeen().indexOf(fp) >= 0) return;

      // The ticket endpoint is authenticated — only signed-in users can file.
      if (!app.currentUser) return;
      const client = (typeof app.getNovaCloudClient === 'function') ? app.getNovaCloudClient() : null;
      if (!client || typeof client.submitTicket !== 'function') return;

      // Consume cap + dedup up front so a repeating error can't hammer the API
      // even while the request is in flight.
      sessionSeen.add(fp);
      sessionCount++;

      const ticket = buildBugTicket(errInfo, {
        url: (typeof location !== 'undefined' && location.href) || '',
        route: app.currentPage || '',
        nodeCount: Array.isArray(app.nodes) ? app.nodes.length : undefined,
        novaVersion: window.NOVA_VERSION || '',
        userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || ''
      });

      Promise.resolve(client.submitTicket(ticket))
        .then((res) => {
          if (res && res.ok) {
            rememberFingerprint(fp);
            toast('🐛 Auto-filed a bug report' + (res.number ? ' (#' + res.number + ')' : ''));
          }
        })
        .catch(() => { /* swallow — reporter failures are silent */ });
    } catch { /* an error inside the error handler must never throw */ }
  };

  window.addEventListener('error', (e) => {
    report({ message: e.message, stack: e.error && e.error.stack, filename: e.filename, lineno: e.lineno, colno: e.colno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    report({ message: (r && r.message) || String(r), stack: r && r.stack });
  });
}

export default installAutoBugReporter;
