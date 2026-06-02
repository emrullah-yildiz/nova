import { executeReplicated, hasListInput, isAutoLaceable, resolveLacingMode } from '../core/lacing.js';

export function createRegistryComputeInner(registry, options = {}) {
  const fallbackComputeInner = options.fallbackComputeInner || null;

  return function computeInnerFromRegistry(nodeInstance, getInput, getVal) {
    const nodeDefinition = registry.getNode(nodeInstance.type);
    if (nodeDefinition && typeof nodeDefinition.execute === 'function') {
      return executeRegistryNode(nodeDefinition, nodeInstance, getInput, getVal, options.context || {});
    }
    if (fallbackComputeInner) {
      return fallbackComputeInner(nodeInstance, getInput, getVal);
    }
    return undefined;
  };
}

export function executeRegistryNode(nodeDefinition, nodeInstance, getInput, getVal, context = {}) {
  const controls = resolveControls(nodeDefinition, nodeInstance, getVal);
  const inputs = resolveInputs(nodeDefinition, nodeInstance, getInput, getVal, controls);
  const outputs = executeWithLacing(nodeDefinition, context, inputs, controls, nodeInstance);

  return applyNodeOutputs(nodeDefinition, nodeInstance, outputs);
}

export function executeRegistryNodeUnlaced(nodeDefinition, nodeInstance, getInput, getVal, context = {}) {
  const controls = resolveControls(nodeDefinition, nodeInstance, getVal);
  const inputs = resolveInputs(nodeDefinition, nodeInstance, getInput, getVal, controls);
  const outputs = nodeDefinition.execute(context, inputs, controls, nodeInstance);

  return applyNodeOutputs(nodeDefinition, nodeInstance, outputs);
}

export function executeWithLacing(nodeDefinition, context, inputs, controls, nodeInstance) {
  const instanceLacingMode = nodeInstance && nodeInstance.controlValues
    ? nodeInstance.controlValues._lacingMode
    : undefined;
  const mode = resolveLacingMode(nodeDefinition, instanceLacingMode);
  // Only fan out when the node is genuinely auto-laceable (not a list-consumer
  // such as Solid.ByLoft / List.*, whose 'list' port must receive the whole
  // array intact) and a list actually arrived.
  if (mode === 'none' || !isAutoLaceable(nodeDefinition) || !hasListInput(nodeDefinition.inputs, inputs)) {
    return nodeDefinition.execute(context, inputs, controls, nodeInstance);
  }

  const outputIds = nodeDefinition.outputs.map(output => output.id);
  const replicated = executeReplicated(nodeDefinition.inputs, inputs, mode, outputIds, function(frameInputs) {
    return normalizeOutputs(outputIds, nodeDefinition.execute(context, frameInputs, controls, nodeInstance));
  });

  return outputIds.length === 1 ? { [outputIds[0]]: replicated[outputIds[0]] } : replicated;
}

export function resolveControls(nodeDefinition, nodeInstance, getVal) {
  const controlValues = nodeInstance.controlValues || {};
  const controls = {};

  nodeDefinition.controls.forEach(function(control) {
    const rawValue = controlValues[control.id] !== undefined ? controlValues[control.id] : control.default;
    if (control.type === 'formula' && typeof getVal === 'function') {
      controls[control.id] = getVal(control.id, rawValue);
    } else {
      controls[control.id] = rawValue;
    }
  });

  return controls;
}

export function resolveInputs(nodeDefinition, nodeInstance, getInput, getVal, controls = {}) {
  const inputs = {};
  const ports = nodeDefinition.dynamicInputs && nodeInstance && Array.isArray(nodeInstance._dynInputIds)
    ? nodeInstance._dynInputIds.map(function(id) {
      return nodeDefinition.inputs.find(input => input.id === id) || { id };
    })
    : nodeDefinition.inputs;

  ports.forEach(function(input) {
    let value = typeof getInput === 'function' ? getInput(input.id) : undefined;
    if (value === undefined && controls[input.id] !== undefined) {
      value = controls[input.id];
    }
    if (value === undefined && typeof getVal === 'function' && input.defaultValue !== undefined) {
      value = getVal(input.id, input.defaultValue);
    }
    // Auto-promote a single value to a one-item list for list-typed inputs, so a
    // node that consumes a list (Solid.ByLoft, List.*, Math.Sum, …) works when
    // wired a single item instead of erroring on a non-array. Matches the
    // "single → list of one" behavior of Grasshopper/Dynamo. Null/undefined are
    // left as-is so empty/default handling still applies.
    if (input.type === 'list' && value !== undefined && value !== null && !Array.isArray(value)) {
      value = [value];
    }
    inputs[input.id] = value;
  });

  return inputs;
}

export function applyNodeOutputs(nodeDefinition, nodeInstance, outputs) {
  if (outputs === undefined) return undefined;

  const outputIds = nodeDefinition.outputs.map(output => output.id);
  if (outputIds.length === 0) return outputs;

  const normalizedOutputs = normalizeOutputs(outputIds, outputs);
  nodeInstance._portValues = normalizedOutputs;

  if (outputIds.length === 1) {
    return normalizedOutputs[outputIds[0]];
  }

  return normalizedOutputs;
}

function normalizeOutputs(outputIds, outputs) {
  if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
    const mapped = {};
    outputIds.forEach(function(outputId) {
      mapped[outputId] = outputs[outputId];
    });
    return mapped;
  }

  if (outputIds.length === 1) {
    return { [outputIds[0]]: outputs };
  }

  return outputIds.reduce(function(mapped, outputId, index) {
    mapped[outputId] = Array.isArray(outputs) ? outputs[index] : undefined;
    return mapped;
  }, {});
}
