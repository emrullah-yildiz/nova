// Creates GitHub issues via the REST API using fetch — runs on workerd and Node
// alike. The token (a fine-grained PAT with `issues: write`) is injected at
// dispatcher construction from FEEDBACK_GITHUB_TOKEN; it never reaches the
// client. Returns null when unconfigured so the handler can 503 cleanly.
import { createHttpError } from '../../src/enterprise/domain.mjs';

const DEFAULT_REPO = 'emrullah-yildiz/nova';

export function createGithubIssueService({ token = '', repo = '' } = {}) {
  if (!token) return null;
  const target = repo || DEFAULT_REPO;
  return {
    async create({ title, body, labels = [] }) {
      let res;
      try {
        res = await fetch('https://api.github.com/repos/' + target + '/issues', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'nova-app'
          },
          body: JSON.stringify({ title, body, labels })
        });
      } catch (err) {
        throw createHttpError(502, 'Could not reach the issue tracker. Please try again later.');
      }
      if (!res.ok) {
        throw createHttpError(502, 'Could not create the ticket. Please try again later.');
      }
      const data = await res.json().catch(() => ({}));
      return { url: data.html_url || '', number: data.number || 0 };
    }
  };
}
