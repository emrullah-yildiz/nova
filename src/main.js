import { FormulaEval } from './core/formula-eval.js';
import { AIEngine } from './ai/ai-engine.js';
import { NFLogger } from './core/logger.js';
import { NODE_META, buildNodeReference, enrichNodeDefinitions } from './core/node-metadata.js';
import { NODE_LIBRARY, NODE_TYPE_MAP, TYPE_COLORS } from './core/nodes.js';
import { GPTClient, SettingsDialog } from './ai/gpt-client.js';
import { Geo } from './geometry/index.js';
import { Viewer3D } from './viewer/viewer3d.js';
import { installEngine } from './core/engine.js';
import app, { initializeApp } from './app/app.js';
import { installLoggerPatch } from './app/logger-patch.js';
import { installSaveLoad } from './app/save-load.js';
import './ai/gpt-integration.js';
import { PythonRunner } from './runtime/pyrunner.js';
import { createComputeContext, computeNodeValue } from './core/compute-engine.js';
import * as GraphHelpers from './core/graph-helpers.js';
import * as NodeLibraryUtils from './ui/node-library-utils.js';
import { installLineRenderPatch } from './ui/line-render-patch.js';
import { installNodeLibrary } from './ui/node-library.js';
import { installNodeRenderer } from './ui/node-renderer.js';
import { installNodeSearchPopup } from './ui/node-search-popup.js';
import { installWirePortalPatch } from './ui/wire-portal-patch.js';
import { installUiEnhancements } from './ui/ui-enhancements.js';
import { installPortHandler } from './ui/port-handler.js';
import { installNodeHelp } from './ui/node-help.js';
import { installNodeHelpPanel } from './ui/node-help-panel.js';
import { installRevitNodes, RevitBridge, RevitElement } from './integrations/revit/revit-nodes.js';
import { installGeoSelector } from './viewer/geo-selector.js';

const NodeFlow = {
  FormulaEval,
  AIEngine,
  NFLogger,
  NODE_META,
  NODE_LIBRARY,
  NODE_TYPE_MAP,
  TYPE_COLORS,
  Geo,
  buildNodeReference,
  enrichNodeDefinitions,
  GPTClient,
  SettingsDialog,
  Viewer3D,
  app,
  initializeApp,
  installEngine,
  installSaveLoad,
  installLoggerPatch,
  createComputeContext,
  computeNodeValue,
  PythonRunner,
  installLineRenderPatch,
  installNodeLibrary,
  installNodeRenderer,
  installNodeSearchPopup,
  installWirePortalPatch,
  installUiEnhancements,
  installPortHandler,
  installNodeHelp,
  installNodeHelpPanel,
  installRevitNodes,
  installGeoSelector,
  RevitBridge,
  RevitElement,
  ...GraphHelpers,
  ...NodeLibraryUtils
};

if (typeof window !== 'undefined') {
  window.NodeFlow = NodeFlow;
  window.AIEngine = AIEngine;
  window.NFLogger = NFLogger;
  window.NODE_META = NODE_META;
  window.NODE_LIBRARY = NODE_LIBRARY;
  window.NODE_TYPE_MAP = NODE_TYPE_MAP;
  window.TYPE_COLORS = TYPE_COLORS;
  window.Geo = Geo;
  window.buildNodeReference = buildNodeReference;
  window.enrichNodeDefinitions = enrichNodeDefinitions;
  window.FormulaEval = FormulaEval;
  window.GPTClient = GPTClient;
  window.SettingsDialog = SettingsDialog;
  window.Viewer3D = Viewer3D;
}

function installBeforeAppInit() {
  installRevitNodes();
  installLineRenderPatch();
  installNodeRenderer();
  installNodeLibrary();
  installWirePortalPatch();
  installNodeSearchPopup();
  installLoggerPatch(app);
}

function installAfterAppInit() {
  installSaveLoad(app);
  installUiEnhancements(app);
  installPortHandler(app);
  installNodeHelp(app);
  installNodeHelpPanel(app);
  installGeoSelector(app);
}

function startAppShell() {
  try {
    installBeforeAppInit();
    initializeApp();
    installAfterAppInit();
  } catch (error) {
    console.error('Error initializing app:', error);
    setTimeout(startAppShell, 100);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(startAppShell, 0);
  } else {
    document.addEventListener('DOMContentLoaded', startAppShell);
  }
}

export default NodeFlow;
