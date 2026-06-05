// Engine-backed lesson validator (PURE — no DOM, no global app).
//
// Given a learner's graph `{ nodes, wires }` and a lesson step's `checks`, decide
// whether each check passes and surface the first failing check's authored hint.
//
// The `output` check evaluates the learner graph through the REAL compute engine
// (createComputeContext + createRegistryComputeInner + computeNodeValue), so the
// same lacing / single→list / number↔boolean rules that govern the live canvas
// govern lesson validation. This keeps lessons solution-AGNOSTIC: any graph that
// genuinely produces the expected value passes, not one rote wiring.
//
// Contract consumed by:
//   - Switch's mini-canvas: calls `validateChecks(learnerGraph, checks)`.
//   - Tank's lessons: author `checks` against this shape (see lesson-schema.js).
//
// Check kinds:
//   output   { kind:'output', node, port?, expected, tolerance?, hint }
//   wiring   { kind:'wiring', from, fromPort, to, toPort, hint }
//   presence { kind:'presence', nodeType?, node?, control?, value?, hint }
//   choice   { kind:'choice', selected, answer, hint }

import { createComputeContext, computeNodeValue } from '../compute-engine.js';
import { createRegistryComputeInner } from '../../nodes/runtimeAdapter.js';
import { createCoreNodeRegistry } from '../../nodes/coreNodes.js';

const DEFAULT_TOLERANCE = 1e-9;

// A single shared registry of the real core nodes — building it is cheap but not
// free, so memoize. The validator never mutates the registry.
let _sharedRegistry = null;
function getSharedRegistry() {
  if (!_sharedRegistry) _sharedRegistry = createCoreNodeRegistry();
  return _sharedRegistry;
}

/**
 * Build a fresh, pure compute context for one validation pass over a learner graph.
 * A fresh context per call guarantees no cache bleed between checks/graphs.
 *
 * @param {{nodes?: Array, wires?: Array}} graph
 * @param {object} [options]
 * @param {object} [options.registry] override the node registry (tests/custom packs)
 */
export function createLessonComputeContext(graph, options = {}) {
  const registry = options.registry || getSharedRegistry();
  const nodes = (graph && graph.nodes) || [];
  const wires = (graph && graph.wires) || [];
  return createComputeContext(nodes, wires, {
    computeInner: createRegistryComputeInner(registry)
  });
}

/**
 * Deep value equality with numeric tolerance and NaN handling. Mirrors the
 * engine's nested-list data model (values + lists, no tree type): arrays compare
 * element-wise and recurse; objects compare by their own enumerable keys.
 */
export function deepEqualWithTolerance(actual, expected, tolerance = DEFAULT_TOLERANCE) {
  if (actual === expected) return true;

  // NaN handling: NaN !== NaN, but two NaNs should be considered equal here.
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Number.isNaN(actual) && Number.isNaN(expected)) return true;
    if (Number.isNaN(actual) || Number.isNaN(expected)) return false;
    return Math.abs(actual - expected) <= tolerance;
  }

  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i++) {
      if (!deepEqualWithTolerance(actual[i], expected[i], tolerance)) return false;
    }
    return true;
  }

  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const aKeys = Object.keys(actual);
    const bKeys = Object.keys(expected);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(expected, key)) return false;
      if (!deepEqualWithTolerance(actual[key], expected[key], tolerance)) return false;
    }
    return true;
  }

  return false;
}

/**
 * Read the value produced by a target node (optionally a named output port) after
 * evaluating it through the engine. Single-output nodes and sinks (e.g.
 * Output.Watch) return the value directly; multi-output nodes are indexed by port.
 */
export function readNodeOutput(ctx, node, port) {
  const value = computeNodeValue(ctx, node);
  if (port == null) return value;
  // After compute, named outputs are mirrored onto node._portValues.
  if (node._portValues && Object.prototype.hasOwnProperty.call(node._portValues, port)) {
    return node._portValues[port];
  }
  // A sink/single-output node returns the raw value; if the caller named the sole
  // port, fall back to that raw value rather than reporting undefined.
  return value;
}

function findNode(nodes, ref) {
  if (ref == null) return undefined;
  return nodes.find((n) => n.id === ref || n.role === ref);
}

// ── Individual check evaluators ───────────────────────────────────────────────

function evalOutputCheck(graph, check, options) {
  const nodes = (graph && graph.nodes) || [];
  const target = findNode(nodes, check.node);
  if (!target) {
    return { pass: false, reason: 'target-node-missing' };
  }
  const ctx = createLessonComputeContext(graph, options);
  const tolerance = check.tolerance != null ? check.tolerance : DEFAULT_TOLERANCE;
  let actual;
  try {
    actual = readNodeOutput(ctx, target, check.port);
  } catch (e) {
    return { pass: false, reason: 'compute-error', actual: undefined };
  }
  const pass = deepEqualWithTolerance(actual, check.expected, tolerance);
  return { pass, actual };
}

function evalWiringCheck(graph, check) {
  const nodes = (graph && graph.nodes) || [];
  const wires = (graph && graph.wires) || [];
  const fromNode = findNode(nodes, check.from);
  const toNode = findNode(nodes, check.to);
  if (!fromNode || !toNode) {
    return { pass: false, reason: 'wiring-endpoint-missing' };
  }
  const exists = wires.some(
    (w) =>
      w.fromNode === fromNode.id &&
      w.toNode === toNode.id &&
      (check.fromPort == null || w.fromPort === check.fromPort) &&
      (check.toPort == null || w.toPort === check.toPort)
  );
  return { pass: exists };
}

function evalPresenceCheck(graph, check) {
  const nodes = (graph && graph.nodes) || [];

  // Control-value form: a specific node's control must equal `value`.
  if (check.node != null && check.control != null) {
    const target = findNode(nodes, check.node);
    if (!target) return { pass: false, reason: 'presence-node-missing' };
    const cv = (target.controlValues || {})[check.control];
    if (check.value === undefined) {
      return { pass: cv !== undefined && cv !== null };
    }
    return { pass: deepEqualWithTolerance(cv, check.value) };
  }

  // Node-type form: a node of `nodeType` must exist; if `control`/`value` given,
  // at least one such node must also carry that control value.
  if (check.nodeType != null) {
    const matches = nodes.filter((n) => n.type === check.nodeType);
    if (matches.length === 0) return { pass: false, reason: 'presence-type-missing' };
    if (check.control != null) {
      const ok = matches.some((n) => {
        const cv = (n.controlValues || {})[check.control];
        if (check.value === undefined) return cv !== undefined && cv !== null;
        return deepEqualWithTolerance(cv, check.value);
      });
      return { pass: ok };
    }
    return { pass: true };
  }

  return { pass: false, reason: 'presence-underspecified' };
}

function evalChoiceCheck(check) {
  return { pass: check.selected != null && check.selected === check.answer };
}

function evalCheck(graph, check, options) {
  switch (check.kind) {
    case 'output':
      return evalOutputCheck(graph, check, options);
    case 'wiring':
      return evalWiringCheck(graph, check);
    case 'presence':
      return evalPresenceCheck(graph, check);
    case 'choice':
      return evalChoiceCheck(check);
    default:
      return { pass: false, reason: 'unknown-check-kind' };
  }
}

/**
 * Validate a learner graph against a list of checks.
 *
 * @param {{nodes?: Array, wires?: Array}} graph - the learner's graph
 * @param {Array<object>} checks - the step's checks (see check kinds above)
 * @param {object} [options]
 * @param {object} [options.registry] - override the node registry (tests/packs)
 * @returns {{
 *   pass: boolean,
 *   results: Array<{ check: object, pass: boolean, hint: (string|null), reason?: string, actual?: * }>,
 *   firstHint: (string|null)
 * }}
 */
export function validateChecks(graph, checks, options = {}) {
  const list = Array.isArray(checks) ? checks : [];
  const results = list.map((check) => {
    const outcome = evalCheck(graph, check, options);
    return {
      check,
      pass: !!outcome.pass,
      hint: outcome.pass ? null : check.hint != null ? check.hint : null,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      ...('actual' in outcome ? { actual: outcome.actual } : {})
    };
  });

  const firstFail = results.find((r) => !r.pass);
  return {
    pass: results.every((r) => r.pass),
    results,
    firstHint: firstFail ? firstFail.hint : null
  };
}
