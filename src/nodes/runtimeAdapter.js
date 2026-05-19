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
  const inputs = resolveInputs(nodeDefinition, getInput, getVal, controls);
  const outputs = executeWithLacing(nodeDefinition, context, inputs, controls, nodeInstance);

  return applyNodeOutputs(nodeDefinition, nodeInstance, outputs);
}

export function executeWithLacing(nodeDefinition, context, inputs, controls, nodeInstance) {
  const instanceLacingMode = nodeInstance && nodeInstance.controlValues
    ? nodeInstance.controlValues._lacingMode
    : undefined;
  const lacing = {
    ...(nodeDefinition.lacing || { mode: 'none' }),
    mode: instanceLacingMode || (nodeDefinition.lacing && nodeDefinition.lacing.mode) || 'none'
  };
  const mode = lacing.mode || 'none';
  const listInputIds = nodeDefinition.inputs
    .map(input => input.id)
    .filter(inputId => Array.isArray(inputs[inputId]));

  if (mode === 'none' || listInputIds.length === 0) {
    return nodeDefinition.execute(context, inputs, controls, nodeInstance);
  }

  const outputIds = nodeDefinition.outputs.map(output => output.id);
  const frames = createLacingFrames(nodeDefinition.inputs, inputs, mode);
  const framedOutputs = outputIds.reduce(function(outputs, outputId) {
    outputs[outputId] = [];
    return outputs;
  }, {});

  frames.forEach(function(frameInputs) {
    const frameOutput = normalizeOutputs(outputIds, nodeDefinition.execute(context, frameInputs, controls, nodeInstance));
    outputIds.forEach(function(outputId) {
      framedOutputs[outputId].push(frameOutput[outputId]);
    });
  });

  return outputIds.length === 1 ? { [outputIds[0]]: framedOutputs[outputIds[0]] } : framedOutputs;
}

export function createLacingFrames(inputDefinitions, inputs, mode = 'shortest') {
  const listInputs = inputDefinitions
    .map(input => ({ id: input.id, value: inputs[input.id] }))
    .filter(input => Array.isArray(input.value));

  if (listInputs.length === 0) return [inputs];
  if (mode === 'crossProduct') return createCrossProductFrames(inputDefinitions, inputs, listInputs);

  const lengths = listInputs.map(input => input.value.length);
  const frameCount = mode === 'longest' ? Math.max(...lengths) : Math.min(...lengths);

  return Array.from({ length: frameCount }, function(_, index) {
    return inputDefinitions.reduce(function(frame, input) {
      const value = inputs[input.id];
      if (Array.isArray(value)) {
        const valueIndex = mode === 'longest' ? Math.min(index, value.length - 1) : index;
        frame[input.id] = value[valueIndex];
      } else {
        frame[input.id] = value;
      }
      return frame;
    }, {});
  });
}

function createCrossProductFrames(inputDefinitions, inputs, listInputs) {
  const frames = [];

  function walk(listIndex, pickedValues) {
    if (listIndex >= listInputs.length) {
      frames.push(inputDefinitions.reduce(function(frame, input) {
        frame[input.id] = pickedValues[input.id] !== undefined ? pickedValues[input.id] : inputs[input.id];
        return frame;
      }, {}));
      return;
    }

    const listInput = listInputs[listIndex];
    listInput.value.forEach(function(item) {
      walk(listIndex + 1, { ...pickedValues, [listInput.id]: item });
    });
  }

  walk(0, {});
  return frames;
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

export function resolveInputs(nodeDefinition, getInput, getVal, controls = {}) {
  const inputs = {};

  nodeDefinition.inputs.forEach(function(input) {
    let value = typeof getInput === 'function' ? getInput(input.id) : undefined;
    if (value === undefined && controls[input.id] !== undefined) {
      value = controls[input.id];
    }
    if (value === undefined && typeof getVal === 'function' && input.defaultValue !== undefined) {
      value = getVal(input.id, input.defaultValue);
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
