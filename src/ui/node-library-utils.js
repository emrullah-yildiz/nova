export function buildOutputTypeMap(nodeLibrary) {
  const map = {};
  nodeLibrary.categories.forEach(cat => {
    cat.nodes.forEach(node => {
      (node.outputs || []).forEach(out => {
        const type = out.type || 'any';
        if (!map[type]) map[type] = [];
        map[type].push({
          nodeType: node.type,
          name: node.name,
          icon: node.icon,
          color: cat.color,
          outputPort: out.id
        });
      });
    });
  });
  return map;
}

export function getInputSuggestions(nodeLibrary, portType) {
  const results = [];
  const seen = new Set();
  nodeLibrary.categories.forEach(cat => {
    cat.nodes.forEach(node => {
      (node.inputs || []).forEach(inp => {
        const type = inp.type || 'any';
        if ((type === portType || type === 'any' || portType === 'any') && !seen.has(node.type)) {
          results.push({
            nodeType: node.type,
            name: node.name,
            icon: node.icon,
            color: cat.color,
            inputPort: inp.id,
            outputPort: inp.id
          });
          seen.add(node.type);
        }
      });
    });
  });
  return results.slice(0, 6);
}

export function getSuggestions(nodeLibrary, portType, nodeTypeMap = {}) {
  const map = buildOutputTypeMap(nodeLibrary);
  const results = [];
  const seen = new Set();
  const addSuggestion = suggestion => {
    if (!seen.has(suggestion.nodeType)) {
      seen.add(suggestion.nodeType);
      results.push(suggestion);
    }
  };

  if (map[portType]) map[portType].forEach(addSuggestion);
  if (map.any && portType !== 'any') map.any.forEach(addSuggestion);

  if (portType === 'number') {
    ['number-input', 'integer-input', 'slider-input'].forEach(nt => {
      if (!seen.has(nt) && nodeTypeMap[nt]) {
        const def = nodeTypeMap[nt];
        addSuggestion({
          nodeType: nt,
          name: def.name,
          icon: def.icon,
          color: def.categoryColor,
          outputPort: 'value'
        });
      }
    });
  }

  return results.slice(0, 6);
}
