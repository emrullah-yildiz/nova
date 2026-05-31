import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createResendEmailService,
  createConsoleEmailService,
  createEmailService
} from '../server/email/resend.mjs';

const MSG = { to: 'a@b.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createResendEmailService', () => {
  it('returns { delivered:true, provider:"resend", id } on a 2xx', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() { return { id: 'msg_123' }; },
      async text() { return ''; }
    }));
    const svc = createResendEmailService({ apiKey: 'k', from: 'f', fetch: fetchImpl });
    const res = await svc.send(MSG);
    expect(res).toEqual({ delivered: true, provider: 'resend', id: 'msg_123' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns { delivered:false } on a non-2xx WITHOUT throwing', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      async json() { return {}; },
      async text() { return 'boom'; }
    }));
    const svc = createResendEmailService({ apiKey: 'k', from: 'f', fetch: fetchImpl });
    const res = await svc.send(MSG);
    expect(res.delivered).toBe(false);
    expect(res.provider).toBe('resend');
    expect(res.error).toContain('500');
  });

  it('returns { delivered:false } when fetch throws (network error)', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); });
    const svc = createResendEmailService({ apiKey: 'k', from: 'f', fetch: fetchImpl });
    const res = await svc.send(MSG);
    expect(res.delivered).toBe(false);
    expect(res.provider).toBe('resend');
    expect(res.error).toContain('network down');
  });
});

describe('createConsoleEmailService', () => {
  it('returns { delivered:false, provider:"console" } and does not throw', async () => {
    const logger = { log: vi.fn() };
    const svc = createConsoleEmailService({ logger });
    const res = await svc.send(MSG);
    expect(res).toEqual({ delivered: false, provider: 'console' });
    expect(logger.log).toHaveBeenCalledTimes(1);
  });
});

describe('createEmailService', () => {
  it('with RESEND_API_KEY → a resend-backed service', () => {
    const svc = createEmailService({ RESEND_API_KEY: 'k' });
    expect(svc.provider).toBe('resend');
  });

  it('without a key → console fallback (delivered:false)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const svc = createEmailService({});
    expect(svc.provider).toBe('console');
    const res = await svc.send(MSG);
    expect(res.delivered).toBe(false);
    logSpy.mockRestore();
  });
});
