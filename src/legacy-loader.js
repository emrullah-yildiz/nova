import { AIEngine } from './ai/ai-engine.js';
import { GPTClient, SettingsDialog } from './ai/gpt-client.js';
import { NFLogger } from './core/logger.js';
import './core/engine.js';
import { NODE_META, buildNodeReference, enrichNodeDefinitions } from './core/node-metadata.js';
import { NODE_LIBRARY, NODE_TYPE_MAP, TYPE_COLORS } from './core/nodes.js';
import './geometry/index.js';
import { Viewer3D } from './viewer/viewer3d.js';
import { installRevitNodes } from './integrations/revit/revit-nodes.js';
import { installGeoSelector } from './viewer/geo-selector.js';
import { installLineRenderPatch } from './ui/line-render-patch.js';
import { installNodeLibrary } from './ui/node-library.js';
import { installNodeRenderer } from './ui/node-renderer.js';
import { installNodeSearchPopup } from './ui/node-search-popup.js';
import { installWirePortalPatch } from './ui/wire-portal-patch.js';
import parserSource from '../parser.js?raw';
import pyRunnerSource from '../pyrunner.js?raw';
import uiEnhancementsSource from '../ui-enhancements.js?raw';
import saveLoadSource from '../save-load.js?raw';
import loggerPatchSource from '../logger-patch.js?raw';
import portHandlerSource from '../port-handler.js?raw';
import nodeHelpSource from '../node-help.js?raw';
import nodeHelpPanelSource from '../node-help-panel.js?raw';

if (typeof window !== 'undefined') {
  window.AIEngine = AIEngine;
  window.NFLogger = NFLogger;
  window.NODE_META = NODE_META;
  window.NODE_LIBRARY = NODE_LIBRARY;
  window.NODE_TYPE_MAP = NODE_TYPE_MAP;
  window.TYPE_COLORS = TYPE_COLORS;
  window.GPTClient = GPTClient;
  window.SettingsDialog = SettingsDialog;
  window.buildNodeReference = buildNodeReference;
  window.enrichNodeDefinitions = enrichNodeDefinitions;
  window.Viewer3D = Viewer3D;
}

const legacyScripts = [
  { name: 'parser.js', source: parserSource },
  { name: 'pyrunner.js', source: pyRunnerSource },
  { name: 'ui-enhancements.js', source: uiEnhancementsSource },
  { name: 'save-load.js', source: saveLoadSource },
  { name: 'logger-patch.js', source: loggerPatchSource },
  { name: 'port-handler.js', source: portHandlerSource },
  { name: 'node-help.js', source: nodeHelpSource },
  { name: 'node-help-panel.js', source: nodeHelpPanelSource }
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

function installMigratedGeoRevitModules() {
  installRevitNodes();
  installGeoSelector();
}

// If DOM is already ready, initialize now
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  installMigratedNodeEditorModules();
  installMigratedGeoRevitModules();
} else {
  document.addEventListener('DOMContentLoaded', installMigratedNodeEditorModules);
  document.addEventListener('DOMContentLoaded', installMigratedGeoRevitModules);
}
