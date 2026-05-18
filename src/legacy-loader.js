import { AIEngine } from './ai/ai-engine.js';
import { GPTClient, SettingsDialog } from './ai/gpt-client.js';
import { NFLogger } from './core/logger.js';
import './core/engine.js';
import { NODE_META, buildNodeReference, enrichNodeDefinitions } from './core/node-metadata.js';
import { NODE_LIBRARY, NODE_TYPE_MAP, TYPE_COLORS } from './core/nodes.js';
import './geometry/index.js';
import { Viewer3D } from './viewer/viewer3d.js';
import { installSaveLoad } from './app/save-load.js';
import { installLineRenderPatch } from './ui/line-render-patch.js';
import { installNodeLibrary } from './ui/node-library.js';
import { installNodeRenderer } from './ui/node-renderer.js';
import { installNodeSearchPopup } from './ui/node-search-popup.js';
import { installWirePortalPatch } from './ui/wire-portal-patch.js';
import { installUiEnhancements } from './ui/ui-enhancements.js';
import { installPortHandler } from './ui/port-handler.js';
import { installNodeHelp } from './ui/node-help.js';
import { installNodeHelpPanel } from './ui/node-help-panel.js';
import lineRenderPatchSource from '../line-render-patch.js?raw';
import revitNodesSource from '../revit-nodes.js?raw';
import parserSource from '../parser.js?raw';
import appSource from '../app.js?raw';
import pyRunnerSource from '../pyrunner.js?raw';
import geoSelectorSource from '../geo-selector.js?raw';
import loggerPatchSource from '../logger-patch.js?raw';

if (typeof window !== 'undefined') {
  window.AIEngine = AIEngine;
  window.NFLogger = NFLogger;
  window.NODE_META = NODE_META;
  window.NODE_LIBRARY = NODE_LIBRARY;
  window.NODE_TYPE_MAP = NODE_TYPE_MAP;
  window.TYPE_COLORS = TYPE_COLORS;
  window.Geo = Geo;
  window.GPTClient = GPTClient;
  window.SettingsDialog = SettingsDialog;
  window.buildNodeReference = buildNodeReference;
  window.enrichNodeDefinitions = enrichNodeDefinitions;
  window.Viewer3D = Viewer3D;
}

const legacyScripts = [
  { name: 'line-render-patch.js', source: lineRenderPatchSource },
  { name: 'revit-nodes.js', source: revitNodesSource },
  { name: 'parser.js', source: parserSource },
  { name: 'app.js', source: appSource },
  { name: 'pyrunner.js', source: pyRunnerSource },
  { name: 'geo-selector.js', source: geoSelectorSource },
  { name: 'logger-patch.js', source: loggerPatchSource }
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

function installMigratedNodeEditorModules() {
  installLineRenderPatch();
  installNodeRenderer();
  installNodeLibrary();
  installWirePortalPatch();
  installNodeSearchPopup();
}

function installMigratedPersistenceAndPanelModules() {
  installSaveLoad();
  installUiEnhancements();
  installPortHandler();
  installNodeHelp();
  installNodeHelpPanel();
}

// Ensure app.init() is called after all legacy scripts are loaded
function initializeApp() {
  if (typeof app === 'undefined') {
    // App not yet defined, try again after a short delay
    setTimeout(initializeApp, 10);
    return;
  }
  
  if (app.initialized) {
    installMigratedPersistenceAndPanelModules();
    return; // Already initialized
  }
  
  // Call init immediately
  try {
    app.init();
    installMigratedPersistenceAndPanelModules();
  } catch (e) {
    console.error('Error initializing app:', e);
    // Try again after a delay
    setTimeout(initializeApp, 100);
  }
}

// If DOM is already ready, initialize now
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // Small delay to ensure all synchronous scripts have executed
  installMigratedNodeEditorModules();
  setTimeout(initializeApp, 0);
} else {
  // Wait for DOM to be ready
  document.addEventListener('DOMContentLoaded', installMigratedNodeEditorModules);
  document.addEventListener('DOMContentLoaded', initializeApp);
}
