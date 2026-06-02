import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GPTClient } from '../src/ai/gpt-client.js';

// Regression: when enterprise (Nova Cloud) AI is enabled, callStream used to
// route EVERY turn through callEnterprise — which sends the user message as a
// plain string and never carries images. A BYOK, vision-capable user pasting an
// image got "the image didn't come through" because the picture was dropped
// before it ever reached their provider. An image turn must now go DIRECT.
describe('vision request routing (BYOK image turn bypasses enterprise)', () => {
  const saved = {};
  beforeEach(() => {
    globalThis.NFLogger = globalThis.NFLogger || {
      aiRequest() {}, aiResponse() {}, aiError() {}, info() {}, warn() {}
    };
    saved.fetch = globalThis.fetch;
    for (const k of ['getProvider', 'getApiKey', 'getModel', 'isEnterpriseAiEnabled', 'callEnterprise']) saved[k] = GPTClient[k];
    GPTClient.getProvider = () => 'anthropic';
    GPTClient.getApiKey = () => 'sk-ant-aaaaaaaaaaaaaaaaaaaa';
    GPTClient.getModel = () => 'claude-sonnet-4-6';
    GPTClient.isEnterpriseAiEnabled = () => true; // enterprise ON — the failing case
  });
  afterEach(() => {
    globalThis.fetch = saved.fetch;
    for (const k of ['getProvider', 'getApiKey', 'getModel', 'isEnterpriseAiEnabled', 'callEnterprise']) GPTClient[k] = saved[k];
  });

  it('sends an image turn DIRECT to the vision provider with an image block (not enterprise)', async () => {
    let enterpriseCalled = false;
    GPTClient.callEnterprise = async () => { enterpriseCalled = true; return 'x'; };
    let url = null;
    let body = null;
    globalThis.fetch = async (u, opts) => { url = u; body = JSON.parse(opts.body); throw new Error('__stop__'); };

    await GPTClient.callStream('make a facade like this', 'workspace', '', () => {}, () => {}, () => {}, null,
      [{ mediaType: 'image/png', data: 'B64DATA' }]);

    expect(enterpriseCalled).toBe(false);
    expect(url).toContain('api.anthropic.com');
    const userMsg = body.messages[body.messages.length - 1];
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(JSON.stringify(userMsg.content)).toContain('"type":"image"');
  });

  it('keeps a text-only turn on the enterprise path', async () => {
    let enterpriseCalled = false;
    GPTClient.callEnterprise = async () => { enterpriseCalled = true; return 'ok'; };
    globalThis.fetch = async () => { throw new Error('should-not-fetch-directly'); };

    await GPTClient.callStream('hello there', 'workspace', '', () => {}, () => {}, () => {}, null, null);

    expect(enterpriseCalled).toBe(true);
  });
});
