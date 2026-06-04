// ============================================
/* eslint-disable no-empty, no-constant-condition, no-dupe-else-if, no-unused-vars */
// NOVA — AI Client
// Real AI integration with streaming support
// ============================================

import { createNovaCloudClient } from '../enterprise/cloud-client.js';
import { getRuntimeConfig } from '../config/runtime-config.js';
import { buildNodeCatalog } from './node-catalog.js';
import { buildCapabilityLedger } from './capability-ledger.js';
import { buildGoldenGallery } from './golden-examples.js';
import { buildGraphContext } from './graph-context.js';
import { analyzeGraphProblems, formatGraphProblems } from './graph-problems.js';
import { buildNodeKnowledge, NOVA_PRIMER } from './knowledge-base.js';

const GPTClient = {
  MODEL: 'anthropic/claude-sonnet-4.6',
  MAX_TOKENS: 2048,
  TEMPERATURE: 0.7,
  // Extended-thinking budget (Anthropic). Streamed into a collapsible "Thinking"
  // block so the user can see the model's reasoning. Min allowed is 1024.
  THINKING_BUDGET: 1024,

  // Free-tier shared proxy. Nova is BYOK-only: there is no server-side
  // GROQ_API_KEY, so this is OFF. When disabled, "no API key" means the
  // assistant is INACTIVE (it shows a Settings CTA) rather than silently
  // falling back to a shared key. Flip to true only if a deployment actually
  // configures GROQ_API_KEY/GEMINI_API_KEY on the Worker.
  FREE_TIER_ENABLED: false,

  // Free-tier proxy route - only used when FREE_TIER_ENABLED is true. POSTs to
  // Nova's own Worker route, which forwards to Groq with a server-side
  // GROQ_API_KEY.
  PROXY_URL: '/api/proxy/chat',
  // 8B-Instant has dramatically higher TPM than 70B on Groq's free tier and
  // is plenty for chat triage. The proxy will upgrade to a larger model for
  // code generation if/when the user message implies a build intent.
  PROXY_MODEL: 'llama-3.1-8b-instant',
  PROXY_MAX_TOKENS: 512,

  // ── PROVIDER REGISTRY ──
  // `format` selects the wire protocol: 'openai' is the chat-completions
  // shape (Bearer auth, {messages}, choices[].message.content) that most
  // providers speak — including Google's OpenAI-compatible Gemini endpoint.
  // 'anthropic' is Claude's native /v1/messages API, which differs in
  // headers, request body, and response shape; see the adapters below.
  PROVIDERS: {
    openai: {
      name: 'OpenAI',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      keyPrefix: 'sk-',
      format: 'openai',
      // OpenAI's reasoning models (gpt-5.x, o-series) require
      // max_completion_tokens, not the legacy max_tokens. It's accepted by the
      // classic models too, so the whole provider uses it uniformly.
      tokenParam: 'max_completion_tokens',
      models: [
        { id: 'gpt-5.5', name: 'GPT-5.5 (recommended)', free: false },
        { id: 'gpt-5.4', name: 'GPT-5.4 (more affordable)', free: false },
        { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini (faster, cheaper)', free: false },
        { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano (fastest, cheapest)', free: false },
        { id: 'gpt-5', name: 'GPT-5', free: false },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini', free: false },
        { id: 'gpt-5-nano', name: 'GPT-5 Nano', free: false },
        { id: 'o3', name: 'o3 (reasoning)', free: false },
        { id: 'o1', name: 'o1 (reasoning)', free: false },
        { id: 'gpt-4.1', name: 'GPT-4.1 (non-reasoning)', free: false },
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', free: false },
        { id: 'gpt-4o', name: 'GPT-4o', free: false },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', free: false },
        { id: 'gpt-4', name: 'GPT-4 (legacy)', free: false },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (legacy, cheapest)', free: false }
      ]
    },
    groq: {
      name: 'Groq (Free Tier)',
      apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
      keyPrefix: 'gsk_',
      format: 'openai',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (free, balanced)', free: true },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (free, fastest)', free: true },
        { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (free, most capable)', free: true },
        { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (free, fast)', free: true },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B (free, preview)', free: true },
        { id: 'qwen/qwen3-32b', name: 'Qwen3 32B (free, preview)', free: true },
        { id: 'groq/compound', name: 'Compound (free, web search + code exec)', free: true },
        { id: 'groq/compound-mini', name: 'Compound Mini (free, lightweight agent)', free: true }
      ]
    },
    gemini: {
      // Google exposes an OpenAI-compatible endpoint, so Gemini slots into the
      // standard chat-completions flow (Bearer auth, no custom adapter). Keys
      // come from Google AI Studio and start with "AIza".
      name: 'Google Gemini',
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      keyPrefix: 'AIza',
      format: 'openai',
      models: [
        { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (recommended, free tier)', free: true },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (most capable)', free: false },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (preview)', free: true },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (fast, cheap)', free: true },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', free: false },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', free: true },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (fastest)', free: true },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (legacy)', free: true },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (legacy)', free: true }
      ]
    },
    anthropic: {
      // Claude's native messages API — used directly with an Anthropic key
      // (sk-ant-…) so users don't have to route through OpenRouter. Needs the
      // 'anthropic' format adapter (x-api-key header, system as a top-level
      // field, content[] response). Model ids are overridable in Settings.
      name: 'Anthropic (Claude)',
      apiUrl: 'https://api.anthropic.com/v1/messages',
      keyPrefix: 'sk-ant-',
      format: 'anthropic',
      models: [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (recommended)', free: false },
        { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (most capable)', free: false },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (fastest)', free: false },
        { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', free: false },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', free: false },
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', free: false },
        { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', free: false },
        { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', free: false }
      ]
    },
    openrouter: {
      name: 'OpenRouter',
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
      keyPrefix: 'sk-or-',
      format: 'openai',
      models: [
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 ($3/M)', free: false },
        { id: 'openai/gpt-4o', name: 'GPT-4o ($2.50/M)', free: false },
        { id: 'openrouter/free', name: 'Auto-Select Free', free: true },
        { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', free: true }
      ]
    }
  },

  // ── PREFERENCE STORAGE BACKEND ──
  // The AI provider/model/key are stored through a swappable backend
  // (this._prefs) rather than touching localStorage directly:
  //   • anonymous  → sessionStorage (clears when the tab/browser closes)
  //   • signed-in  → an in-memory cache hydrated from the user's account and
  //                  synced back server-side (see the account-sync section).
  // Projects, autosave and wire-display toggles are NOT routed here — they stay
  // in localStorage. Pointing the get*/set* methods below at this._prefs means
  // hot-path callers (canChat, buildRequestHeaders, …) don't care which backend
  // is active.
  _prefs: null,
  _sessionBackend: null,
  _aiSettingsHydrated: false,

  // The AI-credential keys that move between localStorage (legacy) and the
  // active backend. Built from the provider registry so new providers are
  // covered automatically.
  _aiPrefKeys() {
    var keys = ['nodeflow_provider', 'nodeflow_openai_model', 'nodeflow_openai_key'];
    Object.keys(this.PROVIDERS).forEach(function (p) { keys.push('nodeflow_key_' + p); });
    return keys;
  },

  _makeSessionBackend() {
    var mem = {}; // fallback when sessionStorage is unavailable (locked-down browser)
    function ss() { try { return (typeof sessionStorage !== 'undefined') ? sessionStorage : null; } catch (e) { return null; } }
    return {
      kind: 'session',
      get: function (k) {
        try { var s = ss(); if (s) { var v = s.getItem(k); if (v !== null) return v; } } catch (e) { /* fall through */ }
        return (k in mem) ? mem[k] : null;
      },
      set: function (k, v) { try { var s = ss(); if (s) { s.setItem(k, v); return; } } catch (e) { /* fall through */ } mem[k] = v; },
      remove: function (k) { try { var s = ss(); if (s) s.removeItem(k); } catch (e) { /* ignore */ } delete mem[k]; }
    };
  },

  _activePrefs() { if (!this._prefs) this._useAnonymousPrefs(); return this._prefs; },
  _prefGet(k) { return this._activePrefs().get(k); },
  _prefSet(k, v) { this._activePrefs().set(k, v); },
  _prefRemove(k) { this._activePrefs().remove(k); },

  // Anonymous: route prefs to sessionStorage. Singleton so the in-process
  // fallback survives backend swaps.
  _useAnonymousPrefs() {
    if (!this._sessionBackend) this._sessionBackend = this._makeSessionBackend();
    this._prefs = this._sessionBackend;
    this._aiSettingsHydrated = false;
    return this._prefs;
  },

  // One-time: lift legacy AI prefs out of localStorage into the (anonymous)
  // session backend, then purge them from localStorage so closing the tab truly
  // clears them. No-op once localStorage holds none of these keys.
  _migrateLegacyLocalPrefs() {
    try {
      if (typeof localStorage === 'undefined') return;
      var backend = this._activePrefs();
      var keys = this._aiPrefKeys();
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i], lv = null;
        try { lv = localStorage.getItem(k); } catch (e) { lv = null; }
        if (lv === null) continue;
        if (backend.get(k) === null) backend.set(k, lv);
        try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  },

  // Signed-in: prefs live in an in-memory Map hydrated from the account. Reads
  // stay synchronous; writes mutate the Map and schedule a debounced PUT so the
  // settings follow the user across devices.
  _makeMemoryBackend(onChange) {
    var map = new Map();
    return {
      kind: 'memory',
      get: function (k) { return map.has(k) ? map.get(k) : null; },
      set: function (k, v) { map.set(k, String(v)); if (onChange) onChange(); },
      remove: function (k) { map.delete(k); if (onChange) onChange(); }
    };
  },

  _useSignedInPrefs() {
    var self = this;
    this._prefs = this._makeMemoryBackend(function () { self._scheduleSync(); });
    this._aiSettingsHydrated = false;
    return this._prefs;
  },

  // Populate the in-memory cache from the server's { provider, model, keys }
  // WITHOUT triggering a sync-back (these values came from the server).
  hydrateFromServer(settings) {
    if (!this._prefs || this._prefs.kind !== 'memory') this._useSignedInPrefs();
    this._hydrating = true;
    try {
      if (settings && typeof settings === 'object') {
        if (settings.provider) this._prefSet('nodeflow_provider', settings.provider);
        if (settings.model) this._prefSet('nodeflow_openai_model', settings.model);
        var keys = settings.keys || {};
        var self = this;
        Object.keys(keys).forEach(function (p) { if (keys[p]) self._prefSet('nodeflow_key_' + p, keys[p]); });
        if (keys.openai) this._prefSet('nodeflow_openai_key', keys.openai); // legacy alias
      }
    } finally { this._hydrating = false; }
    this._aiSettingsHydrated = true;
  },

  // The current AI settings as the server-bound blob.
  _collectAiSettings() {
    var keys = {}, self = this;
    Object.keys(this.PROVIDERS).forEach(function (p) {
      var k = self._prefGet('nodeflow_key_' + p);
      if (k) keys[p] = k;
    });
    return { provider: this.getProvider(), model: this._prefGet('nodeflow_openai_model') || '', keys: keys };
  },

  _scheduleSync() {
    if (this._hydrating) return;
    var self = this;
    if (this._syncTimer) { try { clearTimeout(this._syncTimer); } catch (e) { /* ignore */ } }
    this._syncTimer = setTimeout(function () { self._syncToServer(); }, 400);
  },

  // Fire-and-forget PUT. Never throws — a failed sync leaves the key working
  // in-memory for this session and retries on the next change.
  async _syncToServer() {
    if (!this._prefs || this._prefs.kind !== 'memory') return; // only when signed in
    try {
      await fetch('/api/me/ai-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this._collectAiSettings())
      });
    } catch (e) {
      if (typeof NFLogger !== 'undefined') NFLogger.warn('ai-settings', 'sync failed: ' + ((e && e.message) || e));
    }
  },

  getProvider() {
    return this._prefGet('nodeflow_provider') || 'openrouter';
  },
  setProvider(provider) {
    this._prefSet('nodeflow_provider', provider);
  },
  getApiKey() {
    var provider = this.getProvider();
    return this._prefGet('nodeflow_key_' + provider) || this._prefGet('nodeflow_openai_key') || '';
  },
  setApiKey(key) {
    var provider = this.getProvider();
    if (key && key.trim()) {
      this._prefSet('nodeflow_key_' + provider, key.trim());
      if (provider === 'openai') this._prefSet('nodeflow_openai_key', key.trim());
    } else {
      this._prefRemove('nodeflow_key_' + provider);
      if (provider === 'openai') this._prefRemove('nodeflow_openai_key');
    }
  },
  hasApiKey() {
    var k = this.getApiKey();
    return k && k.length > 10;
  },

  // SEC-008: user-facing "disconnect / clear keys". Wipes every BYOK provider
  // key from the active backend (session or in-memory), drops the legacy
  // 'nodeflow_openai_key' alias, and scrubs any lingering plaintext copies that
  // an old build may have left in localStorage. When signed in, the resulting
  // empty key-set is synced to the server (the in-memory backend's remove()
  // schedules the PUT), so the encrypted server store is cleared too. Returns
  // the number of provider key entries that were present before clearing.
  clearAllKeys() {
    var self = this;
    var providerKeys = Object.keys(this.PROVIDERS).map(function (p) { return 'nodeflow_key_' + p; });
    var allKeys = providerKeys.concat(['nodeflow_openai_key']);
    var cleared = 0;
    allKeys.forEach(function (k) {
      if (self._prefGet(k)) cleared++;
      self._prefRemove(k);
      // Belt-and-suspenders: remove any stale plaintext copy left in
      // localStorage by a pre-SEC-008 build (the active backend may be
      // sessionStorage/in-memory, which would not touch it).
      try { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); } catch (e) { /* ignore */ }
    });
    return cleared;
  },

  // Returns true when the assistant is ready to take a request. A user API
  // key (BYOK) or enterprise mode qualifies; the shared free-tier proxy only
  // qualifies when it's actually enabled (FREE_TIER_ENABLED). With the free
  // tier off and no key, this is false and the UI shows the "add your key"
  // gate instead of letting the user send into a dead proxy.
  canChat() {
    return this.hasApiKey() || this.isEnterpriseAiEnabled() || this.isProxyMode();
  },
  getModel() {
    return this._prefGet('nodeflow_openai_model') || this.MODEL;
  },
  setModel(model) {
    this._prefSet('nodeflow_openai_model', model);
  },
  getApiUrl(providerOverride) {
    var provider = providerOverride || this.getProvider();
    var prov = this.PROVIDERS[provider];
    if (!prov) return this.PROVIDERS.openai.apiUrl;
    return prov.apiUrl;
  },
  getExtraHeaders() {
    var provider = this.getProvider();
    if (provider === 'openrouter') {
      return { 'HTTP-Referer': typeof window !== 'undefined' ? window.location.href : '', 'X-Title': 'Nova' };
    }
    return {};
  },
  isProxyMode() {
    return !this.hasApiKey() && this.FREE_TIER_ENABLED;
  },
  getEffectiveApiUrl() {
    return this.isProxyMode() ? this.PROXY_URL : this.getApiUrl();
  },
  getEffectiveModel() {
    return this.isProxyMode() ? this.PROXY_MODEL : this.getModel();
  },
  // Wire format for the active provider. Proxy mode always speaks OpenAI
  // (the proxy normalizes everything server-side). For BYOK it's whatever the
  // provider declares; unknown/legacy providers default to 'openai'.
  getProviderFormat(providerOverride) {
    if (!providerOverride && this.isProxyMode()) return 'openai';
    var prov = this.PROVIDERS[providerOverride || this.getProvider()];
    return (prov && prov.format) || 'openai';
  },

  // Name of the max-output-tokens field for the active provider. OpenAI's
  // reasoning models require 'max_completion_tokens'; everyone else (and the
  // proxy) takes the classic 'max_tokens'.
  getTokenParam(providerOverride) {
    if (!providerOverride && this.isProxyMode()) return 'max_tokens';
    var prov = this.PROVIDERS[providerOverride || this.getProvider()];
    return (prov && prov.tokenParam) || 'max_tokens';
  },

  // OpenAI's reasoning models (gpt-5.x and the o-series) reject any temperature
  // other than the default on Chat Completions, so callers must omit it.
  // Matches "gpt-5", "gpt-5.4-mini", "o1", "o3", "o4-…" but not "gpt-4o" or
  // "openai/gpt-oss-…".
  isReasoningModel(model) {
    return /^(gpt-5|o\d)/.test(String(model || ''));
  },

  // ── WIRE-FORMAT ADAPTERS ──
  // Pure functions (no DOM / no fetch) so they're unit-testable. Each branches
  // on `format`: 'openai' (chat-completions) vs 'anthropic' (/v1/messages).

  buildAuthHeaders(format, key, extraHeaders) {
    if (format === 'anthropic') {
      return {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Required to call the Anthropic API directly from a browser (opts
        // into CORS). Without it the request is rejected before reaching auth.
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    }
    return Object.assign({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    }, extraHeaders || {});
  },

  buildChatPayload(format, model, messages, maxTokens, temperature, stream, tokenParam, enableThinking) {
    if (format === 'anthropic') {
      // Anthropic carries the system prompt as a top-level field, not a
      // message role, and requires max_tokens. Fold any system messages into
      // one `system` string and pass the rest through unchanged.
      var system = '';
      var convo = [];
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (m.role === 'system') { system += (system ? '\n\n' : '') + m.content; continue; }
        convo.push({ role: m.role, content: m.content });
      }
      var payload = { model: model, max_tokens: maxTokens, temperature: temperature, messages: convo };
      if (system) payload.system = system;
      if (stream) payload.stream = true;
      if (enableThinking) {
        // Extended thinking: Anthropic requires temperature 1 and max_tokens
        // greater than the thinking budget (which is reserved for reasoning).
        payload.thinking = { type: 'enabled', budget_tokens: this.THINKING_BUDGET };
        payload.temperature = 1;
        payload.max_tokens = Math.max(maxTokens, this.THINKING_BUDGET + 2048);
      }
      return payload;
    }
    // OpenAI-compatible. The output-token field name varies (max_tokens vs
    // max_completion_tokens) and reasoning models reject a custom temperature.
    var openai = { model: model, messages: messages };
    openai[tokenParam || 'max_tokens'] = maxTokens;
    if (!this.isReasoningModel(model)) openai.temperature = temperature;
    if (stream) openai.stream = true;
    return openai;
  },

  // Vision support. Modern Claude (3.x / 4.x, all sizes) and OpenAI multimodal
  // models can see images; the free Groq/Llama proxy cannot.
  isVisionModel(model) {
    if (!model) return false;
    var m = String(model).toLowerCase();
    if (m.indexOf('claude') !== -1) return true;
    if (/gpt-4o|gpt-4\.1|gpt-4-turbo|chatgpt-4o|o4|o3/.test(m)) return true;
    return false;
  },

  supportsVision() {
    if (this.isProxyMode && this.isProxyMode()) return false;
    return this.isVisionModel(this.getEffectiveModel());
  },

  // Builds the user message `content`. With no images it's a plain string; with
  // images it's a per-format content-block array (Anthropic base64 image blocks
  // vs OpenAI image_url data-URLs). images: [{ mediaType, data(base64) }].
  buildUserContent(format, text, images) {
    if (!images || !images.length) return text;
    if (format === 'anthropic') {
      var ablocks = images.map(function(img) {
        return { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } };
      });
      if (text) ablocks.push({ type: 'text', text: text });
      return ablocks;
    }
    var oblocks = images.map(function(img) {
      return { type: 'image_url', image_url: { url: 'data:' + img.mediaType + ';base64,' + img.data } };
    });
    if (text) oblocks.unshift({ type: 'text', text: text });
    return oblocks;
  },

  extractMessageContent(format, data) {
    if (format === 'anthropic') {
      if (data && Array.isArray(data.content)) {
        return data.content
          .filter(function (b) { return b && b.type === 'text'; })
          .map(function (b) { return b.text; })
          .join('');
      }
      return '';
    }
    return (data && data.choices && data.choices[0] && data.choices[0].message)
      ? data.choices[0].message.content : '';
  },

  extractStreamDelta(format, json) {
    if (format === 'anthropic') {
      // Anthropic SSE emits typed events; only content_block_delta carries
      // text. message_start/_stop, ping, etc. produce no visible output.
      if (json && json.type === 'content_block_delta' && json.delta && typeof json.delta.text === 'string') {
        return json.delta.text;
      }
      return '';
    }
    var delta = json && json.choices && json.choices[0] && json.choices[0].delta;
    return (delta && delta.content) || '';
  },

  // Anthropic extended-thinking SSE delta (the model's reasoning), separate from
  // the answer text. Empty for non-thinking events / other providers.
  extractThinkingDelta(format, json) {
    if (format === 'anthropic' && json && json.type === 'content_block_delta'
      && json.delta && json.delta.type === 'thinking_delta' && typeof json.delta.thinking === 'string') {
      return json.delta.thinking;
    }
    return '';
  },

  // Models that support Anthropic extended thinking (Sonnet/Opus 4.x, 3.7 Sonnet).
  isThinkingModel(model) {
    return /(sonnet-4|opus-4|3[.-]7-sonnet|claude-4)/i.test(String(model || ''));
  },

  // Whether to request extended thinking for this turn: BYOK Anthropic, a
  // thinking-capable model, and not turned off via localStorage 'nova:ai-thinking'.
  isThinkingEnabled(format, model) {
    if (format !== 'anthropic') return false;
    try { if (typeof localStorage !== 'undefined' && localStorage.getItem('nova:ai-thinking') === 'off') return false; } catch { /* ignore */ }
    return this.isThinkingModel(model);
  },

  buildRequestHeaders() {
    if (this.isProxyMode()) return { 'Content-Type': 'application/json' };
    return this.buildAuthHeaders(this.getProviderFormat(), this.getApiKey(), this.getExtraHeaders());
  },
  detectProvider(key) {
    if (!key) return 'openai';
    // sk-or-/sk-ant- both start with "sk-", so match the specific prefixes
    // before the generic OpenAI fallthrough.
    if (key.startsWith('sk-or-')) return 'openrouter';
    if (key.startsWith('sk-ant-')) return 'anthropic';
    if (key.startsWith('gsk_')) return 'groq';
    if (key.startsWith('AIza')) return 'gemini';
    return 'openai';
  },
  isApiKeyValid(key) {
    return typeof key === 'string' && key.length > 10;
  },
  isEnterpriseAiEnabled() {
    const config = getRuntimeConfig();
    return !!(config.enterpriseAiEnabled && config.apiBaseUrl);
  },
  getEnterpriseClient() {
    if (!this._enterpriseClient) this._enterpriseClient = createNovaCloudClient();
    return this._enterpriseClient;
  },
  async ensureEnterpriseSession(client) {
    const config = getRuntimeConfig();
    if (client.isAuthenticated()) return;
    if (config.authProvider === 'dev') {
      await client.devLogin();
      return;
    }
    throw new Error('Nova Cloud sign-in required.');
  },

  // Lightweight prompt used for free-tier chitchat — greetings, clarifying
  // questions, design-direction discussions. The full Geo API reference
  // (~4-5k tokens) is intentionally left out so we don't burn the shared
  // free tier on small talk; the full prompt kicks in once the user clearly
  // wants to BUILD something.
  buildSlimSystemPrompt() {
    return `You are Nova's AI design assistant. Nova is a browser-based parametric design tool focused on ARCHITECTURE, GEOMETRY, and SPATIAL DESIGN. The user is here to design and build forms, not to take an app tour.

## How to greet a new user
ASK what kind of DESIGN PROJECT they want to work on. Offer concrete design directions like building, pavilion, facade, structure, surface, parametric form. NEVER offer options like "Get Started", "Tutorials", "Explore Templates", or "Ask Me Anything" — those are app-tour items, not design choices, and the user can't act on them productively.

## Option lists
When you offer choices, use this format with 2-4 items. Every option must be a CONCRETE design or project decision the user can pick to move the conversation forward:
[1] Option name — one-line description
[2] Option name — one-line description

Examples of good options:
  [1] Building — tower, residential, mixed-use
  [2] Pavilion — small organic shelter
  [3] Facade — exterior cladding pattern
  [4] Surface — NURBS canopy or shell

Examples of BAD options (never offer these):
  - "Ask me anything" / "Tutorials" / "Get Started" / "Help" — not actionable design choices
  - "Other" by itself with no specifics

## Code generation
When the user clearly asks to BUILD, CREATE, GENERATE, MAKE, DESIGN, DRAW, or MODEL something, write a brief explanation then a single \`\`\`python block using Nova's Geo API (Geo.Point3, Geo.createBox, Geo.loft, etc.). Do NOT use \`\`\`json. Never invent Geo methods you aren't sure exist.

Keep replies short and focused on the user's design intent.`;
  },

  // Heuristic — does this user message imply a code-generation request?
  // Used to decide between slim and full system prompts in proxy mode.
  hasBuildIntent(userMessage) {
    if (!userMessage) return false;
    const m = String(userMessage).toLowerCase();
    return /\b(build|create|generate|make|design|draw|model|show me a|show me an|i want a|i want an|add a|add an|let'?s build|let'?s make)\b/.test(m);
  },

  // The conversation has shifted into code mode once the assistant has
  // produced (or been asked to produce) Python. Sticky-upgrade to the
  // full Geo API prompt for every subsequent turn so option-clicks like
  // "Geodesic Dome" don't fall back to slim and trigger hallucinations
  // such as Geo.Edge / Geo.Mesh that the slim prompt's tiny method list
  // didn't warn against.
  historyHasCode(history) {
    if (!Array.isArray(history)) return false;
    for (let i = history.length - 1; i >= 0 && i >= history.length - 6; i--) {
      const msg = history[i];
      const text = (msg && (msg.text || msg.content)) || '';
      if (typeof text === 'string' && text.indexOf('```python') !== -1) return true;
    }
    return false;
  },

  // The assistant calls back here for code fix retries — those prompts
  // start with "The code you generated has a runtime error". We detect
  // them so the fix attempt always gets the full Geo API reference
  // instead of the slim prompt that almost certainly caused the bug.
  isFixPrompt(userMessage) {
    if (!userMessage) return false;
    const m = String(userMessage);
    return m.indexOf('runtime error') !== -1 && m.indexOf('Original code') !== -1;
  },

  // Heuristic: is this turn a "learn / how-to / which-node" question (vs. a
  // build/edit command)? Used to attach the grounded knowledge base only when
  // it helps, keeping build-intent prompts lean.
  isLearnIntent(message) {
    if (!message || typeof message !== 'string') return false;
    const l = message.toLowerCase();
    if (/\?\s*$/.test(l.trim())) return true;
    return /\b(how (do|does|to|can)|what (is|are|does|node|can)|which (node|nodes)|where (is|do)|explain|tell me about|help me understand|can nova|is there a node|learn|teach|guide me)\b/.test(l);
  },

  buildSystemPrompt(existingCode, opts = {}) {
    let sys = `You are Nova's computational-design expert — you think in NURBS, form-finding, and parametric architecture (Zaha Hadid, Foster+Partners, Marc Fornes, Achim Menges). Nova is a visual node-based tool with a 3D viewport (Three.js); the code you write becomes visual nodes on a canvas. Your bar is academically-defensible geometry — name the mathematics, justify the form, expose the right parameters. Never a toy box when the brief asks for architecture.

## RESPONSE FORMAT (PREFERRED - parser-friendly Python)
For build/create requests, emit a brief 1-2 sentence explanation then a \`\`\`python fenced block. Write canonical Nova Python that the parser can transform into visual nodes. Use one assignment per operation, prefer real Geo.* calls from the catalog, and keep unsupported logic isolated in small declared Python blocks.

A \`\`\`nova-plan fenced block is still accepted when you are certain the graph is simple and fully covered by the node catalog, but Python is the primary collaborative sketch language because it lets the user get a working result first.

When Python needs custom logic, declare the Custom.Python node ports at the top of that block:
\`\`\`python
# in: floors:number, resolution:number
# out: profiles:list
profiles = []
for i in range(floors):
    ...
\`\`\`

Nova will materialize parser-friendly lines as visual nodes and keep only irreducible blocks as Custom.Python.

## OPTIONAL STRUCTURED FORMAT (nova-plan)
If you choose nova-plan, use this shape. The plan declares params, ops, and the wires between them. Use ONLY nodes that appear in the catalog below.

Plan shape:
\`\`\`nova-plan
{
  "version": 1,
  "params": { "name": value, ... },
  "ops": [
    { "id": "<unique>", "node": "<Node.Type>", "controls": { ... }, "inputs": { "<portId>": "@otherOpId or $paramName" } }
  ]
}
\`\`\`

Reference syntax inside \`inputs\`:
- \`"@opId"\` — wires from another op's output
- \`"$paramName"\` — wires from a top-level param (becomes an Input node)

Rules:
1. Every \`node\` must be a real Nova node type from the catalog. NEVER invent node names.
2. Every input \`portId\` must be an actual input port on that node.
3. Every \`@\` reference must point to a declared op id; every \`$\` to a declared param.
4. Include exactly one \`Output.Watch\` (or similar Output.*) op so the result renders.
5. The graph must be a DAG — no cycles.
6. Each op's output should be consumed somewhere (no orphans).

## HOW TO COMPOSE NODES (read this BEFORE you consider refusing)

Most user requests do NOT have a single matching node. They are EXPRESSIBLE as a CHAIN of 3-7 existing nodes. Your job is to think compositionally: break the request into geometric primitives and figure out which nodes produce each piece.

**Decomposition checklist** — before you emit anything, ask:
1. What is the PRIMARY FORM the user wants? (tower, pavilion, surface, facade, dome...)
2. Does a Pattern.* / Surface.* / Solid.* node produce that form? Use it.
3. Does the request need a TRANSFORM on that form? (boolean, mirror, array, smooth) Chain it.
4. Does the request need a SKIN or DECORATION on that form? (panels, diagrid, voronoi) Chain another composite.
5. Does the request need MULTIPLE PIECES combined? Use Solid.BooleanUnion / Solid.CombineAll.
6. End with Output.Watch.

**COOKBOOK — common requests and their canonical node chains**

These are PROVEN compositions. Adapt them; don't invent new node names.

A) "A twisted tower" → 3 ops
   Pattern.TwistedEllipsePlates → Solid.ByLoft → Output.Watch

B) "A twisted tower with hex panels" → 4 ops (the panels are a SEPARATE chain reading the SAME profiles)
   Pattern.TwistedEllipsePlates → Solid.ByLoft → Output.Watch
   Pattern.TwistedEllipsePlates → Pattern.HexPanelGrid → (panels)
   (one Output.Watch on the tower OR on a combined list)

C) "An organic pavilion" → 3 ops
   Pattern.OrganicProfileStack → Solid.ByLoft → Output.Watch

D) "A wavy roof / canopy" → 2 ops
   Surface.WavyGrid → Output.Watch

E) "A geodesic dome" → 4 ops (sphere with bottom cut off, optionally subdivided)
   Point.Origin → Sphere.ByCenterRadius → Solid.BooleanSubtract (against a cutter box) → Output.Watch

F) "A diagrid facade" → 2 ops
   Pattern.DiagridFacade → Output.Watch

G) "A spiral staircase / helix" → 2 ops
   Pattern.HelicalCurve → Output.Watch
   (For treads, sweep the helix with a Solid.ByPipe.)

H) "A tower with a diagrid facade" → 5 ops (tower + facade pattern, both watched)
   Pattern.TwistedEllipsePlates → Solid.ByLoft → Output.Watch (tower)
   Pattern.DiagridFacade → (facade lines)

I) "Two intersecting boxes" → 4 ops
   Point.Origin → Box.ByCenterWidthDepthHeight × 2 (different centers) → Solid.BooleanIntersect → Output.Watch

J) "A box with a hole through it" → 4 ops
   Box.ByCenterWidthDepthHeight (the outer) → Cylinder.ByBaseRadiusHeight (the hole) → Solid.BooleanSubtract → Output.Watch

K) "A field of spheres on a Voronoi grid" → 3 ops
   Pattern.VoronoiMesh → list of points → (place spheres at each point — needs a per-point Sphere.ByCenterRadius)

L) "Stack of stacked profiles → loft → smooth" → 4 ops
   Pattern.TwistedEllipsePlates → Solid.ByLoft → Solid.Smooth → Output.Watch

**General composition rules**
- "X with Y on it" → ONE chain for X, ANOTHER chain for Y reading shared params/inputs
- "X with a hole" / "X minus Y" → Solid.BooleanSubtract
- "X combined with Y" → Solid.BooleanUnion or Solid.CombineAll
- "X arrayed N times" → Pattern.ArrayLinear / ArrayPolar / ArrayAlongCurve
- "X but smoother" / "X with rounded edges" → chain Solid.Smooth or Surface.Subdivide
- "Profile rings" or "stacked floors" → Pattern.TwistedEllipsePlates / OrganicProfileStack
- "Surface" or "shell" or "canopy" → Surface.WavyGrid / Surface.ByPatch
- "Panels" or "tiles" → Pattern.HexPanelGrid / DiagridFacade / VoronoiMesh
- "Twist" / "rotate per floor" → use the twistDeg parameter, not custom math

REFUSAL CONTRACT — refusal is the LAST RESORT, not the easy way out.

Before emitting a refusal, you MUST have:
1. Decomposed the request into geometric primitives
2. Mapped each primitive to a node from the catalog
3. Identified the EXACT missing capability — not "I don't know how" but "there is no node for X, and X cannot be built by chaining the nodes I have"

Only THEN return:
\`\`\`nova-plan
{ "version": 1, "refused": { "reason": "<one short sentence naming the SPECIFIC missing capability, not just 'too complex'>", "suggestions": ["<alternative 1>", "<alternative 2>"] } }
\`\`\`

DO NOT refuse because:
- The request has multiple parts (chain them)
- The request needs transformation (use boolean / array / smooth)
- The request needs decoration (use panel / diagrid / voronoi nodes)
- You can't think of a single node (look for chains in the COOKBOOK above)

DO refuse when:
- The request needs a specific composite that doesn't exist (e.g., "fractal Mandelbox" — no Pattern.Fractal in catalog)
- The request requires runtime data the system can't provide (e.g., real-time weather data)
- The request is genuinely outside parametric geometry (e.g., "generate a TikTok video")

Do NOT invent nodes. If the design cannot be fully represented by existing visual nodes, use a small Custom.Python block with explicit \`# in:\` / \`# out:\` headers instead of refusing. Refuse only when the request is outside Nova's runtime or cannot be approximated honestly.

Concrete example — "a sphere with another sphere subtracted":
\`\`\`nova-plan
{
  "version": 1,
  "params": { "outer": 10, "inner": 7 },
  "ops": [
    { "id": "origin", "node": "Point.Origin" },
    { "id": "a",      "node": "Sphere.ByCenterRadius", "inputs": { "center": "@origin", "radius": "$outer" } },
    { "id": "b",      "node": "Sphere.ByCenterRadius", "inputs": { "center": "@origin", "radius": "$inner" } },
    { "id": "shell",  "node": "Solid.BooleanSubtract", "inputs": { "a": "@a", "b": "@b" } },
    { "id": "watch",  "node": "Output.Watch",          "inputs": { "value": "@shell" } }
  ]
}
\`\`\`

## PYTHON-FIRST BUILD MODE

For ANY request that involves building, creating, generating, modelling, or designing geometry, prefer parser-friendly \`\`\`python. The user's success path is: working code first, visual nodes wherever Nova can infer them, and explicit Custom.Python only for the parts that need real control flow.

- If a line maps to a visual node, write it as a simple assignment.
- If a block needs loops or unsupported logic, keep it small and add \`# in:\` / \`# out:\` headers.
- If the request is impossible or outside Nova's runtime, emit a specific refusal in plain text or a refusal nova-plan:
  \`\`\`nova-plan
  { "version": 1, "refused": { "reason": "<one short sentence>", "suggestions": ["<alt 1>", "<alt 2>"] } }
  \`\`\`

Do not hide a whole design inside one giant Python block when simple assignments would produce nodes.

## CODE STYLE (CRITICAL — determines how nodes appear)
- Each assignment = one visual node. Decompose into single-line statements.
- Numeric params on their own line: \`radius = 5\` then use \`radius\` (becomes editable Number node)
- Each Geo call on its own line: \`center = Geo.Point3(0,0,0)\` then \`box = Geo.createBox(center,w,d,h)\`
- NEVER nest Geo calls: \`Geo.createBox(Geo.Point3(0,0,0),10,10,5)\` ← BAD (one ugly node)
- Use \`Geo.Point3(x,y,z)\` not bare tuples for geometry (tuples won't render in 3D)
- End with \`print(result)\` for a Watch node
- \`import math\` if needed
- For-loops group into one "Python" node — use only when generating arrays

## RUNTIME CONSTRAINTS (JS transpiler)
NO: .pop(), try/except, dict comprehensions, set(), f-strings, multiple assignment (a,b=1,2)
YES: .append(), range(), math.*, Geo.*, list(), simple for-loops
USE math.pow(a,b) INSTEAD OF a**b (the ** operator may not transpile correctly)
INLINE COMMENTS (#) are OK but keep them simple

## CLOSED PROFILES FOR LOFTING (CRITICAL)
When creating profiles for Geo.loft():
- Generate points around a FULL circle (0 to 2*pi) with HIGH resolution (48+ points)
- Do NOT append pts[0] at the end — the loft auto-closes rings
- Pass profiles as plain point arrays: profiles.append(pts)
- All profiles MUST have the SAME number of points
- Points at index 0 in every profile should be at the SAME angular position (vertex alignment)
- Apply twist by rotating XY coordinates AFTER generating the base ellipse/circle
Example pattern for clean lofted tower:
  for j in range(48):
      a = 2 * math.pi * j / 48
      x = width * math.cos(a)
      y = depth * math.sin(a)
      rx = x * cos_twist - y * sin_twist
      ry = x * sin_twist + y * cos_twist
      pts.append(Geo.Point3(rx, ry, z))
  profiles.append(pts)

**KEY RULES:**
1. Decompose into single-line assignments → each becomes a visual node
2. Only use for-loops when building arrays with .append() — the loop + list init merge into ONE Python block node
3. NEVER use standalone .append() lines outside a loop — use Geo.booleanUnion(a, b) or Geo.combineAll([a, b]) to merge objects
4. To combine two results: result = Geo.booleanUnion(wall, facade) — NOT elements = []; elements.append(wall); elements.append(facade)
5. If you MUST use a Python block, add a comment: # Python block: <reason>
6. The MORE single-line assignments you use, the MORE visual nodes appear on the canvas

__NOVA_NODE_CATALOG__

## CRITICAL Geo SIGNATURES (exact argument types — getting these wrong renders nothing, with NO error)
- \`Geo.pipe(curve, radius)\` — takes ONE curve + a number radius. It does NOT take two points. To make a pipe/tube between two points: \`seg = Geo.Line3(p1, p2)\` then \`tube = Geo.pipe(seg, 0.18)\`. NEVER \`Geo.pipe(p1, p2, radius)\`.
- \`Geo.Line3(p1, p2)\` is the ONLY way to make a straight curve from two points — use it before pipe/sweep/extrude.
- \`Geo.loft(profiles)\` — \`profiles\` is a LIST of curves/point-arrays, all with the SAME point count.
- \`Geo.sweep(profileCurve, railCurve)\` — two curves. \`Geo.extrude(curve, vector)\` — a curve + a Vector3 direction.
- \`Geo.combineAll(meshes)\` — a LIST of MESHES (not points). \`Geo.booleanUnion(a, b)\` — two meshes.

## NAMING CONVENTIONS (do not invent methods)
- Solid PRIMITIVES use the \`create\` prefix: \`Geo.createBox\`, \`Geo.createSphere\`, \`Geo.createCylinder\`, \`Geo.createCone\`, \`Geo.createTorus\`.
- OPERATIONS do NOT use a prefix: it is \`Geo.pipe\` / \`Geo.loft\` / \`Geo.sweep\` / \`Geo.extrude\` / \`Geo.revolve\` — there is no \`Geo.createPipe\`, \`Geo.createLoft\`, or \`Geo.createQuad\`.
- If a method is not listed in the inventory above, it DOES NOT EXIST — do not call it.

## ADDITIONAL Geo NAMESPACES (no direct node mapping — use sparingly)
**Boolean:** Geo.booleanUnion(a,b) | Geo.booleanIntersect(a,b) | Geo.booleanSubtract(a,b)
**Noise:** Geo.perlin2(x,y) | Geo.perlin3(x,y,z) | Geo.fbm(x,y,z,octaves) → float -1..1
**Attractors:** Geo.pointAttractor(pt,attractorPos,radius,falloff) → 0..1 | Geo.multiAttractor(pt,attractors[],r,falloff)
**Revit (browser only):** RevitBridge.getElements("Walls") | .getSheets() | .getLevels() | .getParam(el,"Mark") — NEVER use FilteredElementCollector/\\_\\_currentdoc\\_\\_ in browser code

__NOVA_GALLERY__

## FEW-SHOT EXAMPLES

### Example 1: "Create a parametric pavilion"
This creates an organic pavilion by lofting circular profiles that vary in radius, creating a vase-like form.
\`\`\`python
import math
num_profiles = 10
base_radius = 10
max_height = 20
resolution = 48
profiles = []
for i in range(num_profiles):
    t = i / (num_profiles - 1)
    z = t * max_height
    r = base_radius * (0.3 + 0.7 * math.sin(t * math.pi))
    pts = []
    for j in range(resolution):
        a = 2 * math.pi * j / resolution
        pts.append(Geo.Point3(r * math.cos(a), r * math.sin(a), z))
    profiles.append(pts)
pavilion = Geo.loft(profiles)
print(pavilion)
\`\`\`

### Example 2: "Create a twisted tower"
This builds a twisted tower with elliptical floor plates that taper toward the top. Each profile is rotated by the twist angle.
\`\`\`python
import math
floors = 20
floor_height = 3.5
base_width = 18
base_depth = 12
twist_total = 30
taper = 0.15
resolution = 48
profiles = []
for i in range(floors):
    z = i * floor_height
    t = i / (floors - 1)
    angle = math.radians(twist_total * t)
    w = base_width * (1 - taper * t) / 2
    d = base_depth * (1 - taper * t) / 2
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    pts = []
    for j in range(resolution):
        a = 2 * math.pi * j / resolution
        x = w * math.cos(a)
        y = d * math.sin(a)
        rx = x * cos_a - y * sin_a
        ry = x * sin_a + y * cos_a
        pts.append(Geo.Point3(rx, ry, z))
    profiles.append(pts)
tower = Geo.loft(profiles)
print(tower)
\`\`\`

### Example 3: "Boolean subtract — box minus sphere"
This creates a box, places a sphere overlapping one corner, and subtracts it to create a carved form. Each parameter is a separate editable node.
\`\`\`python
center = Geo.Point3(0, 0, 0)
width = 10
depth = 10
height = 5
box = Geo.createBox(center, width, depth, height)
sphere_center = Geo.Point3(5, 0, 2.5)
sphere_radius = 4
sphere = Geo.createSphere(sphere_center, sphere_radius)
result = Geo.booleanSubtract(box, sphere)
print(result)
\`\`\`

### Example 4: "A minimal-surface pavilion" (name the math)
An inverted catenary shell — a pure-compression form in the spirit of Gaudí and Frei Otto — thickened into a buildable roof. One analytic surface call, then a shell.
\`\`\`python
span = 24
height = 10
segments = 60
shell = Geo.createCatenaryShell(span, height, segments)
roof = Geo.thicken(shell, 0.4)
print(roof)
\`\`\`

### Example 5: "A responsive facade" (a field drives the variation)
Phyllotactic facade studs whose radius grows near a hot-spot — the skin RESPONDS to context instead of being uniform. This is the expert move: a large field + a per-element parameter derived from an attractor.
\`\`\`python
count = 240
field = Geo.phyllotaxis(count, 14, 0.6)
hot = Geo.Point3(6, 6, 0)
studs = []
for i in range(count):
    p = field[i]
    influence = Geo.pointAttractor(p, hot, 20, 2)
    r = 0.15 + 0.5 * influence
    studs.append(Geo.createSphere(p, r))
facade = Geo.combineAll(studs)
print(facade)
\`\`\`

## DESIGN CAPABILITIES & METHOD
__NOVA_CAPABILITY_LEDGER__

## FORM VOCABULARY (choose terms deliberately)
- Ruled vs developable vs minimal surface; NURBS degree 3 = C² (smooth), degree 1 = faceted.
- Loft topology: every profile ring CLOSED, SAME point count, ordered base→top.
- Attractor falloff: 1 = hard edge, 2 = soft bloom, higher = tighter hot-spot.
- Noise: octaves = detail layers, lacunarity = frequency step, gain = roughness.

## PARAMETRIC METHOD (how an expert chooses parameters)
1. EXPOSE a few intent parameters with sane ranges — e.g. floors (12–40), twist (30–90°), taper (0–0.3), base_width/depth, panel_density.
2. DERIVE everything else from the normalized height t = i / (n-1): radius, angle, inset. Never write the same number twice.
3. Stay in architectural bands: floor height 3–5 m; a perceptible twist is ≥ 30°; a pavilion reads at 5–15 profiles, a tower at 20–40.
4. Pair a LARGE gesture (lofted / NURBS / analytic shell) with FINE detail (panels, diagrid, pipes) driven by a field.

## FACADE / PANELIZATION PLAYBOOK
- A facade is hosted ON a surface — build the form first, then panel it. Never leave panels floating in space.
- Hex grid → uniform, space-frame friendly. Diagrid → structural + expressive. Voronoi → organic/cellular [approx].
- VARY the panels: feed an attractor or fbm into panel scale, inset, or extrusion depth so the skin responds to a point / edge / context.

## BEFORE YOU EMIT CODE — self-check
1. State the MATH and a PRECEDENT in one line ("inverted catenary shell, à la Gaudí").
2. List the exposed PARAMETERS and their ranges.
3. Profiles closed & equal-length? Angular loft followed by Geo.smooth()?
4. Panels hosted on a surface, not floating? Variation driven by a field, not random?
5. Every number a parameter or derived from t — no repeated magic constants.
6. If you reached for an [approx]/[stub] op for something it can't really do, compose around it instead.

## DESIGN CONVERSATION PROTOCOL — CRITICAL
You are a design consultant, NOT a code generator. Your job is to UNDERSTAND what the user wants through conversation BEFORE writing any code.

**RULE: For any design request (building, pavilion, facade, structure, etc.), you MUST go through a multi-step clarification conversation. Do NOT generate code on the first message.**

**ONE QUESTION RULE:** Ask exactly one design question per assistant turn. Never include more than one numbered option group in the same response. After the user picks an answer, ask the next single question.

### Step 1: Understand the Form
Ask about the overall shape/typology. Present options as [1] Label — description format:

**Building Form:**
[1] Twisted tower — rotating floor plates with taper
[2] Organic shell — NURBS lofted flowing form
[3] Orthogonal mass — stacked rectangular floors
[4] Freeform blob — noise-deformed smooth surface

Which form do you prefer, or describe your own?

### Step 2: Understand the Details
Based on their choice, ask about ONE specific area at a time:
- Dimensions (height, width, floors)
- Facade treatment (panels, voronoi, diagrid, screen)
- Structural expression (pipes, isolines, shell)
- Parameters they want to control

Do not ask all detail categories at once. Ask one question, wait for the answer, then continue.

After 2-4 clarification answers, include these two options when it is reasonable to move faster:
[1] Decide yourself - fill the remaining design parameters with sensible architectural defaults
[2] Other - I want to specify a different answer or required parameter

### Step 3: Confirm and Generate
Summarize the complete design brief, then ask: "Ready to generate? Or would you like to adjust anything?"

**ONLY generate code when:**
- The user says "go", "generate", "create it", "build it", "yes", "looks good", "decide the rest"
- The user explicitly provides ALL parameters in one message (e.g., "box 10x10x5 at origin")
- The user says "surprise me" or "you decide"

**When the user says "decide the rest" or "you choose":**
- Fill in remaining unknowns with sensible architectural defaults
- State what you chose: "I'll use 20 floors at 3.5m height, hexagonal profiles, and attractor panels."
- Then generate the code

### Conversation Examples
USER: "Create a parametric building"
YOU: Ask about form → facade → dimensions → confirm → generate

USER: "Make a box 10x10x5"
YOU: Just generate it (fully specified)

USER: "Parametric facade with varying panels"
YOU: Ask about panel type → attractor vs noise → dimensions → confirm → generate

### Option Format (MUST use this exact format for clickable buttons)
Each option MUST be on its own line starting with [number]:
[1] Option label — short description
[2] Option label — short description

Use 2-4 options. Never emit two separate numbered lists in the same response. End with a question asking the user to pick or describe their own.

## UNKNOWN METHODS PROTOCOL
If you are unsure whether a Geo method exists, DO NOT guess. Instead:
1. Check the GEO API section above
2. If the method is not listed, tell the user: "I don't see [method] in the available API. Here are similar alternatives: [list]. Which would you prefer?"
3. NEVER invent Geo methods that don't exist in the API reference`;

    // Splice in the dynamic blocks. They were originally authored with ESCAPED
    // backticks inside the template literal, so they never actually broke out —
    // the node catalog never reached the model (a latent bug that starved the AI
    // of its inventory). Inject via placeholder tokens instead so it's robust to
    // the surrounding backtick-escaping.
    sys = sys
      .replace('__NOVA_NODE_CATALOG__', buildNodeCatalog())
      .replace('__NOVA_CAPABILITY_LEDGER__', buildCapabilityLedger())
      .replace('__NOVA_GALLERY__', buildGoldenGallery());

    if (existingCode) {
      sys += `\n\n### Current Code on Canvas\nThe user already has this code/graph. If they ask to modify it, update this code:\n\`\`\`python\n${existingCode}\n\`\`\``;
    }

    // Grounded knowledge base — lets the assistant be one place to learn Nova:
    // how it works (primer) and which node does what (node guide). Attached only
    // on learn/how-to/which-node turns (it is large), so build-intent prompts
    // stay lean. Both instruct the model to answer ONLY from them, so learning
    // answers stay grounded in real product facts and real nodes.
    try {
      if (this.isLearnIntent(opts.userMessage)) {
        sys += `\n\n${NOVA_PRIMER}\n\n${buildNodeKnowledge()}`;
      }
    } catch {
      // Knowledge base must never block a chat response.
    }

    // Live graph snapshot — the assistant's view of the actual canvas (node ids,
    // types, versions, ports, positions, controls, wiring). Read from the global
    // app/registry; empty on the landing screen (no project) so nothing is added
    // there. Wrapped defensively: graph context must never break a chat turn.
    try {
      const app = (typeof window !== 'undefined' && window.app)
        || (typeof globalThis !== 'undefined' && globalThis.app) || null;
      const typeMap = (typeof window !== 'undefined' && window.NODE_TYPE_MAP)
        || (typeof globalThis !== 'undefined' && globalThis.NODE_TYPE_MAP) || {};
      if (app && typeof app.serializeGraph === 'function') {
        const graph = app.serializeGraph();
        const ctx = buildGraphContext(graph, typeMap);
        if (ctx.text) {
          sys += `\n\n### Live Graph (the user's current canvas)\nThis is the actual graph on the canvas right now. Use it to answer questions about the current workflow ("which node does X here?", "what should I wire next to finish this?") and to propose precise edits — reference nodes by their id. Ports are shown as in[...]/out[...]; wires as from.port → to.port.\n\n${ctx.text}`;

          // Problem report — what's broken or unfinished. The AUTHORITATIVE
          // per-node warnings are the ones the engine surfaces in the inspector
          // (e.g. "Meshes expects list but received object") — gather those first
          // so the assistant addresses the warning the user actually sees, then
          // add the locally-derived structural problems.
          const nodeErrors = (app._nodeErrors && typeof app._nodeErrors === 'object') ? app._nodeErrors : {};
          const realWarnings = [];
          if (typeof app._collectInspectorWarnings === 'function' && Array.isArray(app.nodes)) {
            for (const nd of app.nodes) {
              let ws = [];
              try { ws = app._collectInspectorWarnings(nd) || []; } catch { ws = []; }
              for (const w of ws) {
                realWarnings.push({ kind: 'warning', nodeId: nd.id, message: `${(nd.def && nd.def.name) || nd.type} (${nd.id})${w.port ? ' [' + w.port + ']' : ''}: ${w.message}` });
              }
            }
          }
          const problems = realWarnings.concat(analyzeGraphProblems(graph, typeMap, { nodeErrors }));
          const problemText = formatGraphProblems(problems);
          if (problemText) {
            sys += `\n\n### Problems In The Current Graph\nLocally detected issues — use these to answer "how do I finish/fix this?" and to propose targeted edits. Address them by node id; do not invent problems beyond this list.\n\n${problemText}`;
          }

          // Show-action protocol (P3) — only offered when a graph exists. The
          // block is executed and hidden, so the model must still explain in prose.
          sys += `\n\n### Showing Things On The Canvas (optional)\nTo point the user at something, you MAY append ONE fenced block at the very end of your reply. It is executed and hidden from the user — keep your prose explanation too. Use node ids from the Live Graph above.\n\`\`\`nova-action\n{"ops":[{"op":"focusNode","id":"node-2"}]}\n\`\`\`\nAllowed ops (read-only, no graph changes): focusNode{id}, highlightNodes{ids:[...]}, openInspector{id} (focus + open its Data Inspector), revealLibraryNode{type} (reveal a node type in the library). Prefer focusNode/openInspector for warnings. Never include more than 5 ids in highlightNodes; highlight only the target node and immediate source nodes. Only emit ops for nodes/types that exist; omit the block if there's nothing useful to show.`;
        }
      }
    } catch {
      // Never let graph-context assembly block a chat response.
    }
    return sys;
  },

  _histories: { landing: [], workspace: [] },
  resetHistory(context) {
    this._histories[context] = [];
  },

  _rateLimited: false,
  _originalProvider: null,
  _originalModel: null,

  switchToFreeModel() {
    this._originalProvider = this.getProvider();
    this._originalModel = this.getModel();
    this._rateLimited = true;
    // SEC-008: read fallback keys through the pref backend (session/in-memory),
    // never directly from long-lived plaintext localStorage.
    var groqKey = this._prefGet('nodeflow_key_groq');
    if (groqKey) {
      this.setProvider('groq');
      this.setModel('llama-3.3-70b-versatile');
      return 'groq';
    }
    var orKey = this._prefGet('nodeflow_key_openrouter');
    if (orKey) {
      this.setProvider('openrouter');
      this.setModel('openrouter/free');
      return 'openrouter';
    }
    return null;
  },

  getRateLimitMessage(switchedTo) {
    if (switchedTo) {
      var prov = this.PROVIDERS[switchedTo];
      return '⚠️ **Rate limit hit on OpenAI** — automatically switched to **' + prov.name + '** (' + this.getModel() + ').\n\nI\'ll continue working with this free model. You can switch back in Settings when your limit resets.';
    }
    return '⚠️ **Rate limit reached.** To keep working, add a free API key:\n\n• **Groq** (free) → [console.groq.com/keys](https://console.groq.com/keys)\n• **OpenRouter** (free) → [openrouter.ai/keys](https://openrouter.ai/keys)\n\nPaste the key in **Settings → Preferences** and select the provider. Free models like Llama 3.3 70B work great for parametric design!';
  },

  async call(userMessage, context, existingCode) {
    if (this.isEnterpriseAiEnabled()) {
      return this.callEnterprise(userMessage, context, existingCode);
    }
    const proxyMode = this.isProxyMode();
    const providerLabel = proxyMode ? 'proxy-groq' : this.getProvider();
    NFLogger.aiRequest(userMessage, providerLabel, this.getEffectiveModel());
    this._callStart = Date.now();
    const history = this._histories[context] || [];
    const stickyFull = this.historyHasCode(history) || this.isFixPrompt(userMessage);
    const useSlim = proxyMode && !this.hasBuildIntent(userMessage) && !stickyFull;
    const systemContent = useSlim ? this.buildSlimSystemPrompt() : this.buildSystemPrompt(existingCode, { userMessage });
    const historyDepth = proxyMode ? (useSlim ? 4 : 6) : 10;
    const maxTokens = proxyMode ? this.PROXY_MAX_TOKENS : this.MAX_TOKENS;
    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-historyDepth),
      { role: 'user', content: userMessage }
    ];
    const format = this.getProviderFormat();
    const response = await fetch(this.getEffectiveApiUrl(), {
      method: 'POST',
      headers: this.buildRequestHeaders(),
      body: JSON.stringify(this.buildChatPayload(format, this.getEffectiveModel(), messages, maxTokens, this.TEMPERATURE, false, this.getTokenParam()))
    });
    if (response.status === 503 && proxyMode) {
      NFLogger.aiError('Proxy not configured', providerLabel);
      throw new Error('__PROXY_NOT_CONFIGURED__');
    }
    if (response.status === 429) {
      NFLogger.aiError('Rate limit 429', providerLabel);
      if (proxyMode) {
        throw new Error('__PROXY_RATE_LIMIT__');
      }
      var switched = this.switchToFreeModel();
      throw new Error(switched ? '__RATE_LIMIT_SWITCHED__' + switched : '__RATE_LIMIT_NO_FREE__');
    }
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      var errObj = {};
      try { errObj = JSON.parse(errBody); } catch(e) {}
      const msg = (errObj.error && errObj.error.message) || ('API error ' + response.status);
      NFLogger.aiError(msg, providerLabel);
      NFLogger.error('api', 'HTTP ' + response.status + ' from ' + this.getEffectiveApiUrl(), { status: response.status, body: errBody.substring(0, 500), provider: providerLabel, model: this.getEffectiveModel() });
      throw new Error(msg);
    }
    const data = await response.json();
    const reply = this.extractMessageContent(format, data);
    NFLogger.aiResponse(reply, Date.now() - this._callStart);
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: reply });
    this._histories[context] = history;
    return reply;
  },

  async callEnterprise(userMessage, context, existingCode) {
    const client = this.getEnterpriseClient();
    await this.ensureEnterpriseSession(client);
    NFLogger.aiRequest(userMessage, 'nova-cloud', this.getModel());
    this._callStart = Date.now();
    const history = this._histories[context] || [];
    const messages = [
      { role: 'system', content: this.buildSystemPrompt(existingCode, { userMessage }) },
      ...history.slice(-10),
      { role: 'user', content: userMessage }
    ];
    const response = await client.chatWithAi({
      projectId: '',
      provider: this.getProvider(),
      model: this.getModel(),
      messages,
      metadata: { context }
    });
    const reply = response && response.message ? response.message.content : '';
    NFLogger.aiResponse(reply, Date.now() - this._callStart);
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: reply });
    this._histories[context] = history;
    return reply;
  },

  async callStream(userMessage, context, existingCode, onChunk, onDone, onError, onThinking, images) {
    // A vision request from a BYOK, vision-capable user must go DIRECT to their
    // provider: the enterprise / Nova-Cloud path (callEnterprise) sends the user
    // message as a plain string and never carries images, so routing there would
    // silently drop the picture (the "image didn't come through" bug). Only image
    // turns bypass enterprise; everything else keeps the existing priority.
    const visionDirect = !!(images && images.length && this.hasApiKey() && this.supportsVision());
    if (this.isEnterpriseAiEnabled() && !visionDirect) {
      try {
        const reply = await this.callEnterprise(userMessage, context, existingCode);
        onChunk(reply, reply);
        onDone(reply);
      } catch (e) {
        NFLogger.aiError(e.message || 'Nova Cloud AI error', 'nova-cloud');
        onError(e.message || 'Nova Cloud AI error');
      }
      return;
    }
    const proxyMode = this.isProxyMode();
    const providerLabel = proxyMode ? 'proxy-groq' : this.getProvider();
    NFLogger.aiRequest(userMessage, providerLabel, this.getEffectiveModel());
    var _streamStart = Date.now();
    const history = this._histories[context] || [];
    const stickyFull = this.historyHasCode(history) || this.isFixPrompt(userMessage);
    const useSlim = proxyMode && !this.hasBuildIntent(userMessage) && !stickyFull;
    const systemContent = useSlim ? this.buildSlimSystemPrompt() : this.buildSystemPrompt(existingCode, { userMessage });
    const historyDepth = proxyMode ? (useSlim ? 4 : 6) : 10;
    const maxTokens = proxyMode ? this.PROXY_MAX_TOKENS : this.MAX_TOKENS;
    const format = this.getProviderFormat();
    // Attach images only when the active model can actually see them; otherwise
    // send text alone (the UI warns the user separately). History keeps the
    // text-only turn so the (large) image isn't resent on every later message.
    const sendImages = (images && images.length && this.supportsVision()) ? images : null;
    const userContent = this.buildUserContent(format, userMessage, sendImages);
    // Diagnostic (only when images are attached): records exactly what happened
    // to the picture so a session log pinpoints any drop — threading, vision
    // gating, or wire format. Cheap and only fires on image turns.
    if (images && images.length) {
      NFLogger.info('ai-vision', 'image attach decision', {
        imagesIn: images.length,
        supportsVision: this.supportsVision(),
        hasApiKey: this.hasApiKey(),
        enterprise: this.isEnterpriseAiEnabled(),
        proxyMode: proxyMode,
        format: format,
        model: this.getEffectiveModel(),
        attached: sendImages ? sendImages.length : 0,
        contentIsArray: Array.isArray(userContent),
        firstMediaType: images[0] && images[0].mediaType,
        firstDataLen: images[0] && images[0].data ? images[0].data.length : 0
      });
    }
    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-historyDepth),
      { role: 'user', content: userContent }
    ];
    const enableThinking = this.isThinkingEnabled(format, this.getEffectiveModel());
    const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    this._activeStream = ac;
    let fullText = '';
    let fullThinking = '';
    try {
      const response = await fetch(this.getEffectiveApiUrl(), {
        method: 'POST',
        headers: this.buildRequestHeaders(),
        body: JSON.stringify(this.buildChatPayload(format, this.getEffectiveModel(), messages, maxTokens, this.TEMPERATURE, true, this.getTokenParam(), enableThinking)),
        signal: ac ? ac.signal : undefined
      });
      if (!response.ok) {
        if (response.status === 503 && proxyMode) {
          NFLogger.aiError('Proxy not configured', providerLabel);
          onError('__PROXY_NOT_CONFIGURED__');
          return;
        }
        if (response.status === 429) {
          if (proxyMode) {
            onError('__PROXY_RATE_LIMIT__');
          } else {
            var switched = this.switchToFreeModel();
            if (switched) { onError('__RATE_LIMIT_SWITCHED__' + switched); }
            else { onError('__RATE_LIMIT_NO_FREE__'); }
          }
          return;
        }
        const errBody = await response.text().catch(() => '');
        var errObj = {};
        try { errObj = JSON.parse(errBody); } catch(e) {}
        const msg = (errObj.error && errObj.error.message) || ('API error ' + response.status);
        NFLogger.error('api-stream', 'HTTP ' + response.status + ' from ' + this.getEffectiveApiUrl(), { status: response.status, body: errBody.substring(0, 500), provider: providerLabel, model: this.getEffectiveModel() });
        onError(msg);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.substring(6);
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            if (typeof onThinking === 'function') {
              const tdelta = this.extractThinkingDelta(format, json);
              if (tdelta) { fullThinking += tdelta; onThinking(tdelta, fullThinking); }
            }
            const chunk = this.extractStreamDelta(format, json);
            if (chunk) {
              fullText += chunk;
              onChunk(chunk, fullText);
            }
          } catch (e) { /* skip */ }
        }
      }
      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: fullText });
      this._histories[context] = history;
      NFLogger.aiResponse(fullText, Date.now() - _streamStart);
      onDone(fullText);
    } catch (e) {
      if (ac && ac.signal && ac.signal.aborted) {
        // User stopped the stream — keep whatever streamed so far and finalize
        // normally (the partial answer persists) rather than surfacing an error.
        history.push({ role: 'user', content: userMessage });
        history.push({ role: 'assistant', content: fullText });
        this._histories[context] = history;
        NFLogger.aiResponse(fullText + ' [stopped]', Date.now() - _streamStart);
        onDone(fullText);
        return;
      }
      NFLogger.aiError(e.message || 'Network error', providerLabel);
      onError(e.message || 'Network error');
    } finally {
      if (this._activeStream === ac) this._activeStream = null;
    }
  },

  // Abort the in-flight streaming response (the Stop button). The reader rejects
  // with an AbortError, which callStream finalizes as a normal partial reply.
  stopStream() {
    if (this._activeStream) {
      try { this._activeStream.abort(); } catch (e) { /* ignore */ }
      this._activeStream = null;
    }
  },

  // Removes the most recent user→assistant exchange from a context's history so
  // a Retry re-asks the same prompt fresh instead of stacking a duplicate turn.
  dropLastTurn(context) {
    const h = this._histories && this._histories[context];
    if (!h || !h.length) return;
    if (h[h.length - 1] && h[h.length - 1].role === 'assistant') h.pop();
    if (h.length && h[h.length - 1] && h[h.length - 1].role === 'user') h.pop();
  },

  parseResponse(text) {
    NFLogger.info('gpt-parse', 'Parsing GPT response', { length: text ? text.length : 0 });
    const codeBlockMatch = text.match(/```(?:python)?\s*\n([\s\S]*?)\n\s*```/);
    if (codeBlockMatch) {
      const code = codeBlockMatch[1].trim();
      const explanation = text.replace(/```[\s\S]*?```/g, '').trim();
      var result = { code: code, explanation: explanation || 'Generated code for your request.' };
      NFLogger.aiParsed(result);
      return result;
    }
    const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1]);
        if (parsed.code) { NFLogger.aiParsed(parsed); return parsed; }
      } catch (e) { NFLogger.warn('gpt-parse', 'JSON parse failed', { error: String(e) }); }
    }
    NFLogger.info('gpt-parse', 'No code block found — conversational reply', null);
    return null;
  }
};

// ── SETTINGS DIALOG ──
const SettingsDialog = {
  isOpen: false,

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) this.close(); };
    const currentProvider = GPTClient.getProvider();
    const currentKey = GPTClient.getApiKey();
    const maskedKey = currentKey ? currentKey.substring(0, 7) + '...' + currentKey.substring(currentKey.length - 4) : '';
    const currentModel = GPTClient.getModel();
    overlay.innerHTML = `
      <div class="settings-dialog">
        <div class="settings-header">
          <h2>⚙ Settings</h2>
          <button class="settings-close-btn" onclick="SettingsDialog.close()">✕</button>
        </div>
        <div class="settings-body">
          <div class="settings-section">
            <h3>🤖 AI Configuration</h3>
            <p class="settings-desc">Choose a provider and model. **Groq** and **OpenRouter** offer free models — perfect when you hit OpenAI rate limits!</p>
            <label class="settings-label">Provider</label>
            <select id="settings-provider" class="settings-input" onchange="SettingsDialog.onProviderChange()">
              ${Object.keys(GPTClient.PROVIDERS).map(function(pid) { var p = GPTClient.PROVIDERS[pid]; var sel = pid === currentProvider ? 'selected' : ''; var ft = p.models.some(function(m){return m.free;}) ? ' 🟢' : ''; return '<option value="' + pid + '" ' + sel + '>' + p.name + ft + '</option>'; }).join('')}
            </select>
            <label class="settings-label" style="margin-top:12px">API Key</label>
            <div class="settings-key-row">
              <input type="password" id="settings-api-key" class="settings-input" placeholder="${maskedKey || 'sk-...'}" value="${currentKey}" autocomplete="off" />
              <button class="settings-toggle-btn" onclick="SettingsDialog.toggleKeyVisibility()" title="Show/Hide">👁</button>
            </div>
            <p class="settings-hint" id="settings-key-hint">${currentProvider === 'groq' ? '🟢 Free! Get key at <a href="https://console.groq.com/keys" target="_blank" style="color:var(--accent-green)">console.groq.com/keys</a>' : currentProvider === 'openrouter' ? '🟢 Free models! Get key at <a href="https://openrouter.ai/keys" target="_blank" style="color:var(--accent-green)">openrouter.ai/keys</a>' : 'Get key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--accent-blue)">platform.openai.com/api-keys</a>'}</p>
            <label class="settings-label" style="margin-top:16px">Model</label>
            <select id="settings-model" class="settings-input">
              ${(GPTClient.PROVIDERS[currentProvider] || GPTClient.PROVIDERS.openai).models.map(function(m) { var sel = m.id === currentModel ? 'selected' : ''; var ft = m.free ? ' 🟢 FREE' : ''; return '<option value="' + m.id + '" ' + sel + '>' + m.name + ft + '</option>'; }).join('')}
            </select>
            <div class="settings-status" id="settings-status">
              ${currentKey
                ? '<span style="color:var(--accent-green)">✓ Using your ' + (GPTClient.PROVIDERS[currentProvider] && GPTClient.PROVIDERS[currentProvider].name || currentProvider) + ' key</span>'
                : '<span style="color:var(--accent-blue)">🆓 No key — using free shared model (Groq Llama 3.3 70B). Bring your own key above for unlimited use.</span>'}
            </div>
            <button class="settings-test-btn" id="settings-test-btn" onclick="SettingsDialog.testConnection()">Test Connection</button>
          </div>
          <div class="settings-section">
            <h3>🎨 Wire Display</h3>
            <p class="settings-desc">Control visual effects on wires between nodes.</p>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
              <div><div style="font-size:13px;font-weight:600;color:var(--text-primary)">Wire Portals</div><div style="font-size:11px;color:var(--text-muted)">Show 3D portal rings where wires cross</div></div>
              <label class="nf-toggle"><input type="checkbox" id="settings-wire-portals" ${localStorage.getItem('nodeflow_wire_portals') !== 'false' ? 'checked' : ''} /><span class="nf-toggle-slider"></span></label>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
              <div><div style="font-size:13px;font-weight:600;color:var(--text-primary)">Wire Animations</div><div style="font-size:11px;color:var(--text-muted)">Animated data flow dots on wires after Run</div></div>
              <label class="nf-toggle"><input type="checkbox" id="settings-wire-animations" ${localStorage.getItem('nodeflow_wire_animations') !== 'false' ? 'checked' : ''} /><span class="nf-toggle-slider"></span></label>
            </div>
          </div>
          <div class="settings-section">
            <h3>ℹ About</h3>
            <p class="settings-desc"><strong>Nova</strong> — Visual scripting with AI-powered code generation.<br>
            Built with OkPy. Supports OpenAI, Groq, and OpenRouter.</p>
          </div>
        </div>
        <div class="settings-footer">
          <button class="settings-save-btn" onclick="SettingsDialog.save()">Save & Close</button>
          <button class="settings-cancel-btn settings-disconnect-btn" onclick="SettingsDialog.disconnect()" title="Remove all stored API keys from this browser" style="color:var(--accent-red);margin-right:auto">Disconnect / Clear Keys</button>
          <button class="settings-cancel-btn" onclick="SettingsDialog.close()">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (!currentKey) {
      setTimeout(() => {
        const inp = document.getElementById('settings-api-key');
        if (inp) inp.focus();
      }, 100);
    }
  },

  close() {
    this.isOpen = false;
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.remove();
  },

  onProviderChange() {
    var provSelect = document.getElementById('settings-provider');
    if (!provSelect) return;
    var pid = provSelect.value;
    GPTClient.setProvider(pid);
    var modelSelect = document.getElementById('settings-model');
    var prov = GPTClient.PROVIDERS[pid];
    if (modelSelect && prov) {
      modelSelect.innerHTML = prov.models.map(function(m) {
        var ft = m.free ? ' 🟢 FREE' : '';
        return '<option value="' + m.id + '">' + m.name + ft + '</option>';
      }).join('');
    }
    var keyInput = document.getElementById('settings-api-key');
    var storedKey = GPTClient._prefGet('nodeflow_key_' + pid) || '';
    if (keyInput) { keyInput.value = storedKey; keyInput.placeholder = prov ? prov.keyPrefix + '...' : 'Enter API key...'; }
    var hint = document.getElementById('settings-key-hint');
    if (hint) {
      if (pid === 'openrouter') hint.innerHTML = '⭐ Access Claude Sonnet, GPT-4o + free models! Get key at <a href="https://openrouter.ai/keys" target="_blank" style="color:#cba6f7">openrouter.ai/keys</a>';
      else if (pid === 'groq') hint.innerHTML = '🟢 Free! Get key at <a href="https://console.groq.com/keys" target="_blank" style="color:var(--accent-green)">console.groq.com/keys</a>';
      else if (pid === 'gemini') hint.innerHTML = '🟢 Free tier! Get key at <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent-green)">aistudio.google.com/apikey</a>';
      else if (pid === 'anthropic') hint.innerHTML = '⭐ Use Claude directly. Get key at <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:#cba6f7">console.anthropic.com</a>';
      else hint.innerHTML = 'Get key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--accent-blue)">platform.openai.com/api-keys</a>';
    }
  },

  save() {
    const provSelect = document.getElementById('settings-provider');
    const keyInput = document.getElementById('settings-api-key');
    const modelSelect = document.getElementById('settings-model');
    if (provSelect) GPTClient.setProvider(provSelect.value);
    if (keyInput) GPTClient.setApiKey(keyInput.value);
    if (modelSelect) GPTClient.setModel(modelSelect.value);
    var wpCb = document.getElementById('settings-wire-portals');
    var waCb = document.getElementById('settings-wire-animations');
    if (wpCb) localStorage.setItem('nodeflow_wire_portals', wpCb.checked ? 'true' : 'false');
    if (waCb) localStorage.setItem('nodeflow_wire_animations', waCb.checked ? 'true' : 'false');
    this.close();
    setTimeout(function(){ if(typeof app!=='undefined'&&app.renderWires)app.renderWires();},50);
    // Refresh the header status AND the input gate: adding a key here flips the
    // assistant from inactive → active without a reload.
    if (typeof app !== 'undefined' && app._updateChatStatus) app._updateChatStatus();
  },

  // SEC-008: wipe every stored BYOK key (all providers + legacy alias + any
  // stale localStorage copy). Clears the visible input and refreshes the
  // status/gate so the assistant immediately reflects the disconnected state.
  disconnect() {
    var n = GPTClient.clearAllKeys();
    const keyInput = document.getElementById('settings-api-key');
    if (keyInput) { keyInput.value = ''; keyInput.placeholder = 'sk-...'; }
    const status = document.getElementById('settings-status');
    if (status) {
      status.innerHTML = '<span style="color:var(--accent-blue)">🔌 Disconnected — '
        + (n > 0 ? 'cleared ' + n + ' stored key' + (n === 1 ? '' : 's') : 'no stored keys')
        + '. Keys are never persisted in plaintext.</span>';
    }
    if (typeof NFLogger !== 'undefined') NFLogger.info('settings', 'BYOK keys cleared', { cleared: n });
    if (typeof app !== 'undefined' && app._updateChatStatus) app._updateChatStatus();
  },

  toggleKeyVisibility() {
    const inp = document.getElementById('settings-api-key');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  },

  async testConnection() {
    const keyInput = document.getElementById('settings-api-key');
    const status = document.getElementById('settings-status');
    const btn = document.getElementById('settings-test-btn');
    const key = keyInput ? keyInput.value.trim() : '';
    if (!key) {
      status.innerHTML = '<span style="color:var(--accent-red)">✕ Enter an API key first</span>';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Testing...';
    var provider = GPTClient.getProvider();
    var provName = (GPTClient.PROVIDERS[provider] && GPTClient.PROVIDERS[provider].name) || 'provider';
    status.innerHTML = '<span style="color:var(--text-muted)">⟳ Connecting to ' + provName + '...</span>';
    try {
      const modelSelect = document.getElementById('settings-model');
      const model = modelSelect ? modelSelect.value : 'gpt-5.5';
      var format = GPTClient.getProviderFormat(provider);
      var headers = GPTClient.buildAuthHeaders(format, key, GPTClient.getExtraHeaders());
      const response = await fetch(GPTClient.getApiUrl(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(GPTClient.buildChatPayload(format, model, [{ role: 'user', content: 'Reply with just: OK' }], 64, 0, false, GPTClient.getTokenParam(provider)))
      });
      if (response.ok) {
        const data = await response.json();
        status.innerHTML = '<span style="color:var(--accent-green)">✓ Connected! Model: <strong>' + model + '</strong></span>';
        if (typeof NFLogger !== 'undefined') NFLogger.info('settings', 'Connection test passed', { provider: GPTClient.getProvider(), model: model });
      } else {
        const errBody = await response.text().catch(() => '');
        var errObj = {};
        try { errObj = JSON.parse(errBody); } catch(e2) {}
        const msg = (errObj.error && errObj.error.message) || ('Error ' + response.status);
        status.innerHTML = '<span style="color:var(--accent-red)">✕ ' + msg + '</span>';
        if (typeof NFLogger !== 'undefined') NFLogger.error('settings', 'Connection test failed: ' + msg, { status: response.status, body: errBody.substring(0, 500), provider: GPTClient.getProvider(), model: model, url: GPTClient.getApiUrl() });
      }
    } catch (e) {
      status.innerHTML = '<span style="color:var(--accent-red)">✕ Network error: ' + e.message + '</span>';
      if (typeof NFLogger !== 'undefined') NFLogger.error('settings', 'Connection test network error: ' + e.message, { provider: GPTClient.getProvider(), url: GPTClient.getApiUrl() });
    }
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
};

// Initialise the pref backend before any app code reads it. Default to the
// anonymous (sessionStorage) backend and lift any legacy localStorage AI prefs
// into it once. On sign-in, refreshSession() swaps to the account-backed cache.
GPTClient._useAnonymousPrefs();
GPTClient._migrateLegacyLocalPrefs();

if (typeof window !== 'undefined') {
  window.GPTClient = GPTClient;
  window.SettingsDialog = SettingsDialog;
}

export { GPTClient, SettingsDialog };
