// SEC-008 — BYOK AI API keys must not be persisted in plaintext localStorage.
//
// The fix routes all AI-credential prefs through a swappable backend
// (sessionStorage for anonymous users, in-memory for signed-in) and adds a
// user-facing "disconnect / clear keys" action (GPTClient.clearAllKeys) that
// wipes every nodeflow_key_* entry — including any stale plaintext copy left
// in localStorage by a pre-fix build.
import { GPTClient } from '../src/ai/gpt-client.js';

describe('SEC-008 BYOK key storage', () => {
  const previousLocalStorage = globalThis.localStorage;
  const previousSessionStorage = globalThis.sessionStorage;

  function makeStore(initial = {}) {
    const values = { ...initial };
    return {
      _values: values,
      getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem(key, value) { values[key] = String(value); },
      removeItem(key) { delete values[key]; }
    };
  }

  // Anonymous backend = sessionStorage. Seed there; start with empty
  // localStorage so the legacy migration is a no-op unless a test seeds it.
  function installStores(sessionInit = {}, localInit = {}) {
    globalThis.sessionStorage = makeStore(sessionInit);
    globalThis.localStorage = makeStore(localInit);
    GPTClient._sessionBackend = null;
    GPTClient._useAnonymousPrefs();
  }

  afterEach(() => {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previousSessionStorage;
    GPTClient._sessionBackend = null;
    GPTClient._useAnonymousPrefs();
  });

  it('does NOT persist a BYOK key to localStorage in plaintext by default', () => {
    installStores();
    GPTClient.setProvider('groq');
    GPTClient.setApiKey('gsk_secret_key_1234567890');

    // Usable within the session...
    expect(GPTClient.getApiKey()).toBe('gsk_secret_key_1234567890');
    expect(globalThis.sessionStorage.getItem('nodeflow_key_groq')).toBe('gsk_secret_key_1234567890');
    // ...but never written to long-lived localStorage.
    expect(globalThis.localStorage.getItem('nodeflow_key_groq')).toBeNull();
    expect(globalThis.localStorage._values).toEqual({});
  });

  it('a fresh page load exposes no persistent plaintext key (sessionStorage clears with the tab)', () => {
    // Simulate a fresh load: empty session + empty localStorage, re-init.
    installStores();
    GPTClient._migrateLegacyLocalPrefs();
    expect(GPTClient.getApiKey()).toBe('');
    expect(GPTClient.hasApiKey()).toBeFalsy();
    expect(GPTClient.canChat()).toBe(false);
    // Nothing persisted anywhere.
    expect(globalThis.localStorage._values).toEqual({});
  });

  it('clearAllKeys wipes every nodeflow_key_* provider entry plus the legacy alias', () => {
    installStores();
    // Seed a key for every provider through the active backend.
    const providers = Object.keys(GPTClient.PROVIDERS);
    providers.forEach((p) => {
      GPTClient.setProvider(p);
      GPTClient.setApiKey('key_for_' + p + '_1234567890');
    });
    // sanity: keys present
    providers.forEach((p) => {
      expect(GPTClient._prefGet('nodeflow_key_' + p)).toBeTruthy();
    });

    const cleared = GPTClient.clearAllKeys();
    expect(cleared).toBeGreaterThanOrEqual(providers.length);

    // Every provider entry gone from the backend.
    providers.forEach((p) => {
      expect(GPTClient._prefGet('nodeflow_key_' + p)).toBeNull();
      expect(globalThis.sessionStorage.getItem('nodeflow_key_' + p)).toBeNull();
    });
    // Legacy alias gone too, and no key resolvable.
    expect(GPTClient._prefGet('nodeflow_openai_key')).toBeNull();
    expect(GPTClient.getApiKey()).toBe('');
    expect(GPTClient.hasApiKey()).toBeFalsy();
  });

  it('clearAllKeys also scrubs stale plaintext copies left in localStorage by an old build', () => {
    // Pre-SEC-008 builds wrote keys to localStorage. Seed them there directly,
    // while the active backend is sessionStorage.
    installStores({}, {
      nodeflow_key_groq: 'gsk_stale_localstorage_123456',
      nodeflow_key_openrouter: 'sk-or-stale_123456',
      nodeflow_openai_key: 'sk-stale_legacy_123456'
    });

    GPTClient.clearAllKeys();

    expect(globalThis.localStorage.getItem('nodeflow_key_groq')).toBeNull();
    expect(globalThis.localStorage.getItem('nodeflow_key_openrouter')).toBeNull();
    expect(globalThis.localStorage.getItem('nodeflow_openai_key')).toBeNull();
    expect(globalThis.localStorage._values).toEqual({});
  });

  it('switchToFreeModel reads fallback keys from the backend, not directly from localStorage', () => {
    // A fallback Groq key lives in the session backend (the SEC-008-correct
    // location). switchToFreeModel must find it without touching localStorage.
    installStores({ nodeflow_key_groq: 'gsk_fallback_1234567890' });
    GPTClient.setProvider('openai');

    const switched = GPTClient.switchToFreeModel();
    expect(switched).toBe('groq');
    expect(GPTClient.getProvider()).toBe('groq');
    // It must NOT have depended on a plaintext localStorage copy.
    expect(globalThis.localStorage.getItem('nodeflow_key_groq')).toBeNull();
  });

  it('clearAllKeys returns 0 and is a no-op when nothing is stored', () => {
    installStores();
    expect(GPTClient.clearAllKeys()).toBe(0);
    expect(GPTClient.getApiKey()).toBe('');
  });
});
