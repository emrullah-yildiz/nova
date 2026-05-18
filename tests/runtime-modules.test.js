import { CodeParser } from '../src/runtime/parser.js';
import { PythonRunner } from '../src/runtime/pyrunner.js';

describe('Runtime parser and Python runner modules', () => {
  it('parses simple Python assignments into graph nodes', () => {
    const graph = CodeParser.parseToGraph('x = 2\ny = x + 3');

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'number-input', variable: 'x' }),
      expect.objectContaining({ type: 'math-add', variable: 'y' })
    ]));
    expect(graph.wires).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPort: 'value', toPort: 'a' })
    ]));
  });

  it('executes Python-like code with loops and math helpers', () => {
    const result = PythonRunner.execute([
      'total = 0',
      'for i in range(4):',
      '    total = total + i',
      'angle = math.degrees(math.pi)'
    ].join('\n'));

    expect(result.error).toBeNull();
    expect(result.outputs.total).toBe(6);
    expect(result.outputs.angle).toBe(180);
  });

  it('uses the compatibility Geo global when code creates geometry', () => {
    const previousWindow = globalThis.window;
    globalThis.window = globalThis;
    globalThis.Geo = {
      Point3: class {
        constructor(x, y, z) {
          this.x = x;
          this.y = y;
          this.z = z;
        }

        toArray() {
          return [this.x, this.y, this.z];
        }
      }
    };

    try {
      const result = PythonRunner.execute('pt = Geo.Point3(1, 2, 3)');

      expect(result.error).toBeNull();
      expect(result.outputs.pt).toMatchObject({ x: 1, y: 2, z: 3 });
    } finally {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = previousWindow;
      }
      delete globalThis.Geo;
    }
  });
});
