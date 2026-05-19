import {
  formatWiredControlDisplayValue,
  getWiredControlDisplay,
  removeControlInputWires
} from '../src/ui/property-wire-controls.js';

describe('property wire controls', () => {
  it('shows scalar wired values in matching property controls', () => {
    const source = { id: 'number', _portValues: { result: 42 } };
    const app = {
      nodes: [source],
      wires: [{ fromNode: 'number', fromPort: 'result', toNode: 'add', toPort: 'a' }],
      computeNodeValue() {
        return 42;
      }
    };

    const display = getWiredControlDisplay(app, { id: 'add' }, 'a', '0');

    expect(display.wired).toBe(true);
    expect(display.displayValue).toBe(42);
    expect(display.isList).toBe(false);
  });

  it('summarizes list wired values as List', () => {
    const formatted = formatWiredControlDisplayValue([1, 2, 3], '0');

    expect(formatted.displayValue).toBe('List');
    expect(formatted.isList).toBe(true);
  });

  it('removes only the wire feeding the edited property input', () => {
    const wires = [
      { fromNode: 'n1', fromPort: 'result', toNode: 'add', toPort: 'a' },
      { fromNode: 'n2', fromPort: 'result', toNode: 'add', toPort: 'b' },
      { fromNode: 'add', fromPort: 'result', toNode: 'next', toPort: 'value' }
    ];

    const result = removeControlInputWires(wires, 'add', 'a');

    expect(result.removed).toBe(true);
    expect(result.wires).toEqual([
      { fromNode: 'n2', fromPort: 'result', toNode: 'add', toPort: 'b' },
      { fromNode: 'add', fromPort: 'result', toNode: 'next', toPort: 'value' }
    ]);
  });
});
