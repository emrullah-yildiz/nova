export function defineNode(definition) {
  validateNodeDefinition(definition);
  return freezeNodeDefinition(normalizeNodeDefinition(definition));
}

export function normalizeNodeDefinition(definition) {
  return {
    type: definition.type,
    name: definition.name || definition.displayName || definition.type,
    displayName: definition.displayName || definition.name || definition.type,
    category: definition.category || 'uncategorized',
    icon: definition.icon || '',
    color: definition.color || '',
    inputs: normalizePorts(definition.inputs || []),
    outputs: normalizePorts(definition.outputs || []),
    controls: normalizeControls(definition.controls || []),
    preview: definition.preview !== false,
    dynamicInputs: definition.dynamicInputs === true,
    lacing: normalizeLacing(definition.lacing),
    execute: definition.execute || null,
    codegen: definition.codegen || {},
    metadata: definition.metadata || {}
  };
}

export function validateNodeDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('Node definition must be an object.');
  }
  if (!definition.type || typeof definition.type !== 'string') {
    throw new TypeError('Node definition requires a string type.');
  }
  if (definition.execute !== undefined && definition.execute !== null && typeof definition.execute !== 'function') {
    throw new TypeError('Node definition execute must be a function when provided.');
  }
}

function normalizePorts(ports) {
  return ports.map(function(port) {
    return {
      id: port.id,
      name: port.name || port.id,
      type: port.type || 'any',
      defaultValue: port.defaultValue,
      metadata: port.metadata || {}
    };
  });
}

function normalizeControls(controls) {
  return controls.map(function(control) {
    return {
      id: control.id,
      type: control.type || 'text',
      label: control.label || control.id,
      default: control.default,
      options: control.options ? control.options.slice() : undefined,
      metadata: control.metadata || {}
    };
  });
}

function normalizeLacing(lacing) {
  if (!lacing) return { mode: 'none', preserveStructure: false };
  if (typeof lacing === 'string') return { mode: lacing, preserveStructure: false };
  return {
    mode: lacing.mode || 'none',
    preserveStructure: lacing.preserveStructure === true
  };
}

function freezeNodeDefinition(definition) {
  Object.freeze(definition.inputs);
  Object.freeze(definition.outputs);
  Object.freeze(definition.controls);
  Object.freeze(definition.lacing);
  Object.freeze(definition.codegen);
  Object.freeze(definition.metadata);
  return Object.freeze(definition);
}
