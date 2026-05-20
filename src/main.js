import { FormulaEval } from './core/formula-eval.js';
import { AIEngine } from './ai/ai-engine.js';
import { NFLogger } from './core/logger.js';
import { NODE_META, buildNodeReference, enrichNodeDefinitions } from './core/node-metadata.js';
import * as NovaValues from './core/values.js';
import { NODE_LIBRARY, NODE_TYPE_MAP, TYPE_COLORS } from './core/nodes.js';
import { GPTClient, SettingsDialog } from './ai/gpt-client.js';
import {
  Geo,
  GEOMETRY_LEVELS,
  GeometryCache,
  GeometryStore,
  ProgressiveLoading,
  compressMesh,
  createGeometryRef as createPipelineGeometryRef,
  createPreviewMesh,
  decompressMesh,
  geometryCacheKey,
  geometryStore,
  meshBounds
} from './geometry/index.js';
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
import { ExecutionEngine } from './runtime/ExecutionEngine.js';
import { createNovaConnectClient, NovaConnectClient } from './integrations/connect/client.js';
import { hostRegistry, HostRegistry } from './hosts/HostRegistry.js';
import { HostAdapter } from './hosts/HostAdapter.js';
import { RevitAdapter } from './hosts/revit/RevitAdapter.js';
import { RhinoAdapter } from './hosts/rhino/RhinoAdapter.js';
import * as NovaConnectProtocol from './integrations/connect/protocol.js';
import {
  ApsDesignAutomationAdapter,
  ApsDerivativeAdapter,
  ApsDocsAdapter
} from './integrations/connect/aps-adapters.js';
import { installNovaConnectPanel } from './integrations/connect/connect-panel.js';
import { installGeoSelector } from './viewer/geo-selector.js';

const NovaConnect = createNovaConnectClient();
let installedRevitBridge = RevitBridge;

const NodeFlow = {
  FormulaEval,
  AIEngine,
  NFLogger,
  NODE_META,
  NODE_LIBRARY,
  NODE_TYPE_MAP,
  TYPE_COLORS,
  NovaValues,
  Geo,
  GEOMETRY_LEVELS,
  GeometryCache,
  GeometryStore,
  ProgressiveLoading,
  compressMesh,
  createPipelineGeometryRef,
  createPreviewMesh,
  decompressMesh,
  geometryCacheKey,
  geometryStore,
  meshBounds,
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
  installNovaConnectPanel,
  installRevitNodes,
  installGeoSelector,
  get RevitBridge() {
    return (typeof window !== 'undefined' && window.RevitBridge) || installedRevitBridge;
  },
  set RevitBridge(value) {
    installedRevitBridge = value;
  },
  RevitElement,
  NovaConnect,
  hostRegistry,
  HostRegistry,
  HostAdapter,
  RevitAdapter,
  RhinoAdapter,
  NovaConnectClient,
  NovaConnectProtocol,
  ApsDocsAdapter,
  ApsDerivativeAdapter,
  ApsDesignAutomationAdapter,
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
  window.NovaValues = NovaValues;
  window.Geo = Geo;
  window.GEOMETRY_LEVELS = GEOMETRY_LEVELS;
  window.GeometryStore = geometryStore;
  window.buildNodeReference = buildNodeReference;
  window.enrichNodeDefinitions = enrichNodeDefinitions;
  window.FormulaEval = FormulaEval;
  window.GPTClient = GPTClient;
  window.SettingsDialog = SettingsDialog;
  window.Viewer3D = Viewer3D;
  window.NovaConnect = NovaConnect;
  window.HostRegistry = hostRegistry;
  window.NovaConnectProtocol = NovaConnectProtocol;
  window.ApsDocsAdapter = ApsDocsAdapter;
  window.ApsDerivativeAdapter = ApsDerivativeAdapter;
  window.ApsDesignAutomationAdapter = ApsDesignAutomationAdapter;
}

function installBeforeAppInit() {
  const installedRevitBridge = installRevitNodes();
  NodeFlow.RevitBridge = installedRevitBridge;
  hostRegistry.clear();
  hostRegistry.register(new RevitAdapter({ getBridge: () => NodeFlow.RevitBridge }));
  hostRegistry.register(new RhinoAdapter());
  hostRegistry.setActive('revit');
  if (typeof window !== 'undefined') {
    window.NodeFlow = NodeFlow;
    window.HostRegistry = hostRegistry;
    window.GeometryStore = geometryStore;
  }
  installLineRenderPatch();
  installNodeRenderer();
  installNodeLibrary();
  installWirePortalPatch();
  installNodeSearchPopup();
  installLoggerPatch(app);
  // Install V1 engine first (compute pipeline, wire rendering, etc.)
  // V2 ExecutionEngine will then patch V1 methods for caching and dirty tracking
  installEngine(app);
}

function installAfterAppInit() {
  installSaveLoad(app);
  installUiEnhancements(app);
  installPortHandler(app);
  installNodeHelp(app);
  installNodeHelpPanel(app);
  installNovaConnectPanel(app);
  installGeoSelector(app);

  // Mount the Execution Engine v2 — enables dirty tracking, caching,
  // parallel scheduling, cancellation, and streaming for large geometry.
  try {
    const engine = new ExecutionEngine({ concurrency: 4 });
    engine.attach(app);
    window.__executionEngineV2 = engine;
  } catch (err) {
    console.warn('[ExecutionEngine] Could not mount v2 engine (non-critical):', err);
  }
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
