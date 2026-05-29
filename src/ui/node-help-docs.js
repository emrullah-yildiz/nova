export function buildNodeHelpDoc(nodeDefinition, explicitHelp) {
  if (!nodeDefinition) return null;
  var controls = {};
  (nodeDefinition.controls || []).forEach(function(control) {
    if (control.default !== undefined) controls[control.id] = control.default;
  });

  // Modern category nodes ship docs inline on the definition. Prefer that
  // over the legacy window.NODE_HELP map so the panel shows the authored
  // workflow rather than the auto-stub fallback.
  var inlineHelp = nodeDefinition.help || null;
  var primary = inlineHelp || explicitHelp || null;
  var doc = primary ? { ...primary } : {};
  var meta = nodeDefinition.meta || {};

  return {
    description: firstText(doc.description, nodeDefinition.description, meta.description, nodeDefinition.name + ' node.'),
    inputs: normalizePortDocs(doc.inputs, nodeDefinition.inputs),
    outputs: normalizePortDocs(doc.outputs, nodeDefinition.outputs),
    example: doc.example || {
      title: nodeDefinition.name + ' sample',
      nodes: [{ type: nodeDefinition.type, x: 0, y: 0, controls: controls }],
      wires: []
    },
    sampleCode: firstText(doc.sampleCode, meta.python, nodeDefinition.codegen && nodeDefinition.codegen.python, '# ' + nodeDefinition.name)
  };
}

export function validateNodeHelpDoc(nodeDefinition, helpDoc) {
  var errors = [];
  if (!helpDoc) {
    errors.push('missing help doc');
    return errors;
  }
  if (!hasText(helpDoc.description)) errors.push('missing description');
  if (!helpDoc.example || !Array.isArray(helpDoc.example.nodes) || helpDoc.example.nodes.length === 0) {
    errors.push('missing sample graph');
  }
  if (!hasText(helpDoc.sampleCode)) errors.push('missing sample code');

  var outputCount = (nodeDefinition.outputs || []).length;
  var helpOutputCount = (helpDoc.outputs || []).length;
  if (outputCount > 0 && helpOutputCount === 0) errors.push('missing output help');

  return errors;
}

export function validateHelpExample(helpDoc, nodeTypeMap) {
  var errors = [];
  if (!helpDoc || !helpDoc.example) return errors;

  var nodes = helpDoc.example.nodes || [];
  var wires = helpDoc.example.wires || [];
  nodes.forEach(function(node, index) {
    if (!nodeTypeMap[node.type]) errors.push('sample node ' + index + ' references unknown type "' + node.type + '"');
  });

  wires.forEach(function(wire, index) {
    if (!Array.isArray(wire) || wire.length !== 4) {
      errors.push('sample wire ' + index + ' must be [fromIndex, fromPort, toIndex, toPort]');
      return;
    }
    var fromNode = nodes[wire[0]];
    var toNode = nodes[wire[2]];
    if (!fromNode) errors.push('sample wire ' + index + ' has invalid from node index ' + wire[0]);
    if (!toNode) errors.push('sample wire ' + index + ' has invalid to node index ' + wire[2]);
    if (!fromNode || !toNode) return;

    var fromDef = nodeTypeMap[fromNode.type];
    var toDef = nodeTypeMap[toNode.type];
    var fromPorts = fromDef ? (fromDef.outputs || []).map(function(output) { return output.id; }) : [];
    var toPorts = toDef ? (toDef.inputs || []).map(function(input) { return input.id; }) : [];

    if (fromDef && fromPorts.indexOf(wire[1]) < 0) {
      errors.push('sample wire ' + index + ' references unknown output "' + wire[1] + '" on ' + fromNode.type);
    }
    if (toDef && toPorts.indexOf(wire[3]) < 0 && !isDynamicInputPort(toDef, wire[3])) {
      errors.push('sample wire ' + index + ' references unknown input "' + wire[3] + '" on ' + toNode.type);
    }
  });

  return errors;
}

export function isNodeOutputExempt(nodeDefinition) {
  var type = nodeDefinition && nodeDefinition.type;
  if (type === 'custom-comment' || type === 'Custom.Comment') return true;
  if (typeof type !== 'string') return false;
  return type.indexOf('output-') === 0 || type.indexOf('Output.') === 0;
}

function normalizePortDocs(explicitPorts, definitionPorts) {
  if (Array.isArray(explicitPorts) && explicitPorts.length > 0) return explicitPorts.map(function(port) {
    return {
      name: port.name || port.id || '',
      desc: port.desc || port.description || ''
    };
  });

  return (definitionPorts || []).map(function(port) {
    var type = port.type || 'any';
    return {
      name: port.name || port.id,
      desc: type + ' port'
    };
  });
}

function firstText() {
  for (var i = 0; i < arguments.length; i++) {
    if (hasText(arguments[i])) return arguments[i];
  }
  return '';
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDynamicInputPort(nodeDefinition, portId) {
  return nodeDefinition.dynamicInputs === true && /^item\d+$/.test(String(portId || ''));
}
