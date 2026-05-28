export function getInputWire(wires, nodeId, controlId) {
  return (wires || []).find(function(wire) {
    return wire.toNode === nodeId && wire.toPort === controlId;
  }) || null;
}

export function resolveWireValue(app, wire) {
  if (!app || !wire) return undefined;

  var srcNd = (app.nodes || []).find(function(node) {
    return node.id === wire.fromNode;
  });
  if (!srcNd) return undefined;

  var computed = typeof app.computeNodeValue === 'function' ? app.computeNodeValue(srcNd) : undefined;

  if (srcNd._portValues && srcNd._portValues[wire.fromPort] !== undefined) {
    return srcNd._portValues[wire.fromPort];
  }

  if (srcNd._pyResults && srcNd._pyResults[wire.fromPort] !== undefined) {
    return srcNd._pyResults[wire.fromPort];
  }

  if (computed && typeof computed === 'object' && !Array.isArray(computed) && computed[wire.fromPort] !== undefined) {
    return computed[wire.fromPort];
  }

  return computed;
}

export function formatWiredControlDisplayValue(value, fallbackValue) {
  if (value === undefined || value === null) {
    return { displayValue: fallbackValue, isList: false };
  }

  if (Array.isArray(value)) {
    return { displayValue: 'List', isList: true };
  }

  if (typeof value === 'object') {
    return { displayValue: 'Object', isList: false };
  }

  return { displayValue: value, isList: false };
}

export function getWiredControlDisplay(app, node, controlId, fallbackValue) {
  var wire = getInputWire(app && app.wires, node && node.id, controlId);
  if (!wire) {
    return {
      wired: false,
      wire: null,
      displayValue: fallbackValue,
      isList: false
    };
  }

  var formatted = formatWiredControlDisplayValue(resolveWireValue(app, wire), fallbackValue);
  return {
    wired: true,
    wire: wire,
    displayValue: formatted.displayValue,
    isList: formatted.isList
  };
}

export function removeControlInputWires(wires, nodeId, controlId) {
  var removed = false;
  var nextWires = (wires || []).filter(function(wire) {
    var match = wire.toNode === nodeId && wire.toPort === controlId;
    if (match) removed = true;
    return !match;
  });

  return { wires: nextWires, removed: removed };
}
