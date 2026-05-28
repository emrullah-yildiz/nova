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
    subGroup: definition.subGroup || '',
    description: definition.description || '',
    icon: definition.icon || '',
    color: definition.color || '',
    aliases: Array.isArray(definition.aliases) ? definition.aliases.slice() : [],
    inputs: normalizePorts(definition.inputs || []),
    outputs: normalizePorts(definition.outputs || []),
    controls: normalizeControls(definition.controls || []),
    preview: definition.preview !== false,
    dynamicInputs: definition.dynamicInputs === true,
    lacing: normalizeLacing(definition.lacing),
    execute: definition.execute || null,
    codegen: definition.codegen || {},
    help: normalizeHelp(definition.help),
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
      description: port.description || port.desc || '',
      defaultValue: port.defaultValue,
      metadata: port.metadata || {}
    };
  });
}

function normalizeHelp(help) {
  if (!help || typeof help !== 'object') return null;
  return {
    description: help.description || '',
    inputs: Array.isArray(help.inputs)
      ? help.inputs.map(function(input) {
        return {
          name: input.name || input.id || '',
          description: input.description || input.desc || ''
        };
      })
      : [],
    outputs: Array.isArray(help.outputs)
      ? help.outputs.map(function(output) {
        return {
          name: output.name || output.id || '',
          description: output.description || output.desc || ''
        };
      })
      : [],
    example: help.example || null,
    sampleCode: help.sampleCode || ''
  };
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
  Object.freeze(definition.aliases);
  if (definition.help) Object.freeze(definition.help);
  return Object.freeze(definition);
}
