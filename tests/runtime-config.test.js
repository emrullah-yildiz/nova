import { getRuntimeConfig, resolveApiUrl, resolveWebSocketUrl } from '../src/config/runtime-config.js';

describe('runtime config', () => {
  it('uses injected config without rebuilding the frontend', () => {
    const config = getRuntimeConfig({
      __NOVA_CONFIG__: {
        environment: 'staging',
        apiBaseUrl: 'https://api.staging.nova.example',
        websocketUrl: 'wss://connect.staging.nova.example'
      }
    });

    expect(config.environment).toBe('staging');
    expect(resolveApiUrl('/api/projects', config)).toBe('https://api.staging.nova.example/api/projects');
    expect(resolveWebSocketUrl(config)).toBe('wss://connect.staging.nova.example');
  });
});
