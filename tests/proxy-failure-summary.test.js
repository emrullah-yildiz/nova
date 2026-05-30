import { describe, it, expect } from 'vitest';
import { summarizeFailure } from '../api/proxy/chat.mjs';

describe('summarizeFailure (user-facing AI proxy error)', () => {
  it('surfaces a rate limit as 429 RATE_LIMITED with Retry-After', () => {
    const attempts = [
      { provider: 'groq-8b', status: 429, message: 'Rate limit reached' },
      { provider: 'gemini-flash', status: 404 }
    ];
    const r = summarizeFailure(attempts, attempts[1]);
    expect(r.status).toBe(429);
    expect(r.retryAfter).toBe(30);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect(r.body.error.message).toMatch(/rate-limited/i);
  });

  it('returns 502 ALL_PROVIDERS_FAILED when no failure was a rate limit', () => {
    const r = summarizeFailure([{ provider: 'gemini-flash', status: 404 }, { provider: 'cerebras', status: 404 }]);
    expect(r.status).toBe(502);
    expect(r.retryAfter).toBeNull();
    expect(r.body.error.code).toBe('ALL_PROVIDERS_FAILED');
  });

  it('handles empty attempts', () => {
    expect(summarizeFailure([]).status).toBe(502);
    expect(summarizeFailure().status).toBe(502);
  });

  it('keeps attempts + lastError in the body for debugging', () => {
    const attempts = [{ provider: 'groq-8b', status: 429 }];
    const r = summarizeFailure(attempts, { provider: 'groq-8b', status: 429 });
    expect(r.body.error.attempts).toBe(attempts);
    expect(r.body.error.lastError).toEqual({ provider: 'groq-8b', status: 429 });
  });
});
