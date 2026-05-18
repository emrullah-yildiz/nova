import { FormulaEval } from './core/formula-eval.js';
import { AIEngine } from './ai/ai-engine.js';
import { NFLogger } from './core/logger.js';
import { NODE_META, buildNodeReference, enrichNodeDefinitions } from './core/node-metadata.js';
import { NODE_LIBRARY, NODE_TYPE_MAP, TYPE_COLORS } from './core/nodes.js';
import { GPTClient, SettingsDialog } from './ai/gpt-client.js';
import { Viewer3D } from './viewer/viewer3d.js';
import { installEngine } from './core/engine.js';
import './ai/gpt-integration.js';
import './legacy-loader.js';
import { createComputeContext, computeNodeValue } from './core/compute-engine.js';
import * as GraphHelpers from './core/graph-helpers.js';
import * as NodeLibraryUtils from './ui/node-library-utils.js';

const NodeFlow = {
  FormulaEval,
  AIEngine,
  NFLogger,
  NODE_META,
  NODE_LIBRARY,
  NODE_TYPE_MAP,
  TYPE_COLORS,
  CodeParser,
  PythonRunner,
  buildNodeReference,
  enrichNodeDefinitions,
  GPTClient,
  SettingsDialog,
  Viewer3D,
  installEngine,
  createComputeContext,
  computeNodeValue,
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
  window.CodeParser = CodeParser;
  window.PythonRunner = PythonRunner;
  window.buildNodeReference = buildNodeReference;
  window.enrichNodeDefinitions = enrichNodeDefinitions;
  window.FormulaEval = FormulaEval;
  window.GPTClient = GPTClient;
  window.SettingsDialog = SettingsDialog;
  window.Viewer3D = Viewer3D;
}

export default NodeFlow;
