const DEFAULT_CONFIG = {
  environment: 'local',
  appVersion: '0.1.0',
  apiBaseUrl: 'http://127.0.0.1:8787',
  websocketUrl: 'ws://127.0.0.1:8765',
  authProvider: 'dev',
  connectorPairingUrl: 'http://127.0.0.1:8787/api/connectors/sessions',
  cloudProjectsEnabled: true,
  managedSaas: true,
  enterpriseAiEnabled: false
};

export function getRuntimeConfig(runtimeGlobal = getRuntimeGlobal()) {
  const injected = runtimeGlobal.__NOVA_CONFIG__ || {};
  const env = getImportMetaEnv();
  return Object.freeze({
    ...DEFAULT_CONFIG,
    ...compactObject(fromEnv(env)),
    ...compactObject(injected)
  });
}

export function resolveApiUrl(path = '', config = getRuntimeConfig()) {
  const base = String(config.apiBaseUrl || '').replace(/\/+$/, '');
  const suffix = String(path || '').replace(/^\/+/, '');
  return suffix ? base + '/' + suffix : base;
}

export function resolveWebSocketUrl(config = getRuntimeConfig()) {
  return config.websocketUrl || DEFAULT_CONFIG.websocketUrl;
}

function fromEnv(env = {}) {
  return {
    environment: env.VITE_NOVA_ENV,
    appVersion: env.VITE_NOVA_APP_VERSION,
    apiBaseUrl: env.VITE_NOVA_API_BASE_URL,
    websocketUrl: env.VITE_NOVA_WEBSOCKET_URL,
    authProvider: env.VITE_NOVA_AUTH_PROVIDER,
    connectorPairingUrl: env.VITE_NOVA_CONNECTOR_PAIRING_URL,
    enterpriseAiEnabled: parseBoolean(env.VITE_NOVA_ENTERPRISE_AI_ENABLED)
  };
}

function getImportMetaEnv() {
  try {
    return import.meta.env || {};
  } catch (error) {
    return {};
  }
}

function getRuntimeGlobal() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
  );
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || String(value).toLowerCase() === 'true';
}

export const RuntimeConfig = getRuntimeConfig();
