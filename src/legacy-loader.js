import { AIEngine } from './ai/ai-engine.js';
import { NFLogger } from './core/logger.js';
import { NODE_META, buildNodeReference, enrichNodeDefinitions } from './core/node-metadata.js';
import { NODE_LIBRARY, NODE_TYPE_MAP, TYPE_COLORS } from './core/nodes.js';
import { Geo } from './geometry/index.js';
import { Viewer3D } from './viewer/viewer3d.js';
import lineRenderPatchSource from '../line-render-patch.js?raw';
import revitNodesSource from '../revit-nodes.js?raw';
import parserSource from '../parser.js?raw';
import gptClientSource from '../gpt-client.js?raw';
import appSource from '../app.js?raw';
import nodeRendererSource from '../node-renderer.js?raw';
import pyRunnerSource from '../pyrunner.js?raw';
import engineSource from '../engine.js?raw';
import geoSelectorSource from '../geo-selector.js?raw';
import uiEnhancementsSource from '../ui-enhancements.js?raw';
import saveLoadSource from '../save-load.js?raw';
import nodeLibrarySource from '../node-library.js?raw';
import loggerPatchSource from '../logger-patch.js?raw';
import wirePortalPatchSource from '../wire-portal-patch.js?raw';
import portHandlerSource from '../port-handler.js?raw';
import nodeHelpSource from '../node-help.js?raw';
import nodeHelpPanelSource from '../node-help-panel.js?raw';
import nodeSearchPopupSource from '../node-search-popup.js?raw';

if (typeof window !== 'undefined') {
  window.AIEngine = AIEngine;
  window.NFLogger = NFLogger;
  window.NODE_META = NODE_META;
  window.NODE_LIBRARY = NODE_LIBRARY;
  window.NODE_TYPE_MAP = NODE_TYPE_MAP;
  window.TYPE_COLORS = TYPE_COLORS;
  window.Geo = Geo;
  window.buildNodeReference = buildNodeReference;
  window.enrichNodeDefinitions = enrichNodeDefinitions;
  window.Viewer3D = Viewer3D;
}

const legacyScripts = [
  { name: 'line-render-patch.js', source: lineRenderPatchSource },
  { name: 'revit-nodes.js', source: revitNodesSource },
  { name: 'parser.js', source: parserSource },
  { name: 'gpt-client.js', source: gptClientSource },
  { name: 'app.js', source: appSource },
  { name: 'node-renderer.js', source: nodeRendererSource },
  { name: 'pyrunner.js', source: pyRunnerSource },
  { name: 'engine.js', source: engineSource },
  { name: 'geo-selector.js', source: geoSelectorSource },
  { name: 'ui-enhancements.js', source: uiEnhancementsSource },
  { name: 'save-load.js', source: saveLoadSource },
  { name: 'node-library.js', source: nodeLibrarySource },
  { name: 'logger-patch.js', source: loggerPatchSource },
  { name: 'wire-portal-patch.js', source: wirePortalPatchSource },
  { name: 'port-handler.js', source: portHandlerSource },
  { name: 'node-help.js', source: nodeHelpSource },
  { name: 'node-help-panel.js', source: nodeHelpPanelSource },
  { name: 'node-search-popup.js', source: nodeSearchPopupSource }
];

function injectLegacyScript({ name, source }) {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.dataset.legacy = name;
  script.text = source;
  document.head.appendChild(script);
}

// Inject all scripts synchronously
legacyScripts.forEach(injectLegacyScript);

// Ensure app.init() is called after all legacy scripts are loaded
function initializeApp() {
  if (typeof app === 'undefined') {
    // App not yet defined, try again after a short delay
    setTimeout(initializeApp, 10);
    return;
  }
  
  if (app.initialized) {
    return; // Already initialized
  }
  
  // Call init immediately
  try {
    app.init();
  } catch (e) {
    console.error('Error initializing app:', e);
    // Try again after a delay
    setTimeout(initializeApp, 100);
  }
}

// If DOM is already ready, initialize now
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // Small delay to ensure all synchronous scripts have executed
  setTimeout(initializeApp, 0);
} else {
  // Wait for DOM to be ready
  document.addEventListener('DOMContentLoaded', initializeApp);
}
