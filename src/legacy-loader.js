import { AIEngine } from './ai/ai-engine.js';
import { GPTClient, SettingsDialog } from './ai/gpt-client.js';
import { NFLogger } from './core/logger.js';
import './core/engine.js';
import { NODE_META, buildNodeReference, enrichNodeDefinitions } from './core/node-metadata.js';
import { NODE_LIBRARY, NODE_TYPE_MAP, TYPE_COLORS } from './core/nodes.js';
import './geometry/index.js';
import { Viewer3D } from './viewer/viewer3d.js';
import lineRenderPatchSource from '../line-render-patch.js?raw';
import revitNodesSource from '../revit-nodes.js?raw';
import parserSource from '../parser.js?raw';
import nodeRendererSource from '../node-renderer.js?raw';
import pyRunnerSource from '../pyrunner.js?raw';
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
  { name: 'node-renderer.js', source: nodeRendererSource },
  { name: 'pyrunner.js', source: pyRunnerSource },
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
