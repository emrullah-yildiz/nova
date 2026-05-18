import { buildOutputTypeMap, getInputSuggestions, getSuggestions } from '../src/ui/node-library-utils.js';

describe('Node library UI helpers', () => {
  const nodeLibrary = {
    categories: [
      {
        color: '#f00',
        nodes: [
          { type: 'point', name: 'Point', icon: '•', inputs: [{ id: 'x', type: 'number' }], outputs: [{ id: 'point', type: 'point' }] },
          { type: 'number-input', name: 'Number Input', icon: '#', inputs: [], outputs: [{ id: 'value', type: 'number' }] }
        ]
      },
      {
        color: '#0f0',
        nodes: [
          { type: 'distance', name: 'Distance', icon: '↔', inputs: [{ id: 'a', type: 'point' }, { id: 'b', type: 'point' }], outputs: [{ id: 'value', type: 'number' }] }
        ]
      }
    ]
  };

  it('builds an output type map keyed by output type', () => {
    const map = buildOutputTypeMap(nodeLibrary);
    expect(map.point).toHaveLength(1);
    expect(map.number).toHaveLength(2);
    expect(map.point[0].nodeType).toBe('point');
    expect(map.number).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeType: 'number-input', outputPort: 'value' }),
      expect.objectContaining({ nodeType: 'distance', outputPort: 'value' })
    ]));
  });

  it('returns input suggestions for a compatible port', () => {
    const suggestions = getInputSuggestions(nodeLibrary, 'number');
    expect(suggestions).toEqual([
      expect.objectContaining({ nodeType: 'point', inputPort: 'x' })
    ]);
  });

  it('includes any-output nodes for no specific port type', () => {
    const suggestions = getInputSuggestions(nodeLibrary, 'any');
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('returns number helper nodes first for number ports', () => {
    const nodeTypeMap = {
      'number-input': { name: 'Number Input', icon: '#', categoryColor: '#f00' },
      'integer-input': { name: 'Integer Input', icon: '1', categoryColor: '#f00' },
      'slider-input': { name: 'Slider Input', icon: '⇆', categoryColor: '#f00' }
    };
    const suggestions = getSuggestions(nodeLibrary, 'number', nodeTypeMap);
    expect(suggestions[0].nodeType).toBe('number-input');
  });
});
