(function() {
  var host = window.location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  var apiBaseUrl = isLocal ? 'http://127.0.0.1:8787' : window.location.origin;

  window.__NOVA_CONFIG__ = {
    environment: isLocal ? 'local' : 'production',
    appVersion: '0.1.0',
    apiBaseUrl: apiBaseUrl,
    websocketUrl: isLocal ? 'ws://127.0.0.1:8765' : '',
    authProvider: 'dev',
    connectorPairingUrl: apiBaseUrl + '/api/connectors/sessions',
    cloudProjectsEnabled: true,
    managedSaas: true,
    enterpriseAiEnabled: false
  };
})();
