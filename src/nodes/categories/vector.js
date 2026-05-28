import { Geo } from '../../geometry/index.js';

export const vectorCategory = {
  id: 'vector',
  name: 'Vector',
  color: '#b4befe',
  icon: '⟶'
};

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}
function toVector(value, fallback = new Geo.Vector3(0, 0, 0)) {
  if (value instanceof Geo.Vector3) return value;
  if (value && typeof value === 'object' && value.x !== undefined) {
    return new Geo.Vector3(value.x || 0, value.y || 0, value.z || 0);
  }
  return fallback;
}
function toPoint(value, fallback = new Geo.Point3(0, 0, 0)) {
  if (value && typeof value === 'object' && value.x !== undefined) return value;
  return fallback;
}

export const vectorNodes = [
  // ─── Creation ────────────────────────────────────────────
  {
    type: 'Vector.ByCoordinates',
    name: 'Vector.ByCoordinates',
    category: 'vector',
    subGroup: 'Creation',
    icon: '⟶',
    aliases: ['vector-bycoordinates'],
    description: 'Creates a 3-D vector from its X, Y and Z components. The result is a free vector (no anchor point); use it as a direction for moves, rotations, lines, arrays and dot/cross products.',
    inputs: [
      { id: 'x', name: 'X', type: 'number', description: 'X component' },
      { id: 'y', name: 'Y', type: 'number', description: 'Y component' },
      { id: 'z', name: 'Z', type: 'number', description: 'Z component' }
    ],
    outputs: [{ id: 'vector', name: 'Vector', type: 'vector', description: 'The constructed vector' }],
    controls: [
      { id: 'x', type: 'formula', default: '0', label: 'X' },
      { id: 'y', type: 'formula', default: '0', label: 'Y' },
      { id: 'z', type: 'formula', default: '0', label: 'Z' }
    ],
    execute(context, inputs) {
      return { vector: new Geo.Vector3(toNumber(inputs.x), toNumber(inputs.y), toNumber(inputs.z)) };
    },
    codegen: {
      python: '{{vector}} = Geo.Vector3({{x}}, {{y}}, {{z}})',
      csharp: 'var {{vector}} = Geo.Vector3({{x}}, {{y}}, {{z}});'
    },
    help: {
      inputs: [
        { name: 'X', description: 'X component' },
        { name: 'Y', description: 'Y component' },
        { name: 'Z', description: 'Z component' }
      ],
      outputs: [{ name: 'Vector', description: 'Resulting vector' }],
      example: {
        title: 'Magnitude of (3, 4, 0) = 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Vector.Length', x: 460, y: 60 },
          { type: 'output-watch', x: 660, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'vector', 4, 'vector'],
          [4, 'length', 5, 'value']
        ]
      },
      sampleCode: '{{vector}} = Geo.Vector3({{x}}, {{y}}, {{z}})'
    }
  },
  {
    type: 'Vector.ByStartPointEndPoint',
    name: 'Vector.ByStartPointEndPoint',
    category: 'vector',
    subGroup: 'Creation',
    icon: '↦',
    aliases: ['vector-bystartpointendpoint'],
    description: 'Creates a vector that runs from the start point to the end point. The result is End − Start; its length equals the distance between the two points and its direction points from Start toward End.',
    inputs: [
      { id: 'startPoint', name: 'Start Point', type: 'point', description: 'Tail of the vector' },
      { id: 'endPoint', name: 'End Point', type: 'point', description: 'Tip of the vector' }
    ],
    outputs: [{ id: 'vector', name: 'Vector', type: 'vector', description: 'Vector from Start to End' }],
    controls: [],
    execute(context, inputs) {
      const s = toPoint(inputs.startPoint);
      const e = toPoint(inputs.endPoint, new Geo.Point3(1, 0, 0));
      return { vector: new Geo.Vector3(e.x - s.x, e.y - s.y, e.z - s.z) };
    },
    codegen: {
      python: '{{vector}} = Geo.Vector3({{endPoint}}.x - {{startPoint}}.x, {{endPoint}}.y - {{startPoint}}.y, {{endPoint}}.z - {{startPoint}}.z)',
      csharp: 'var {{vector}} = Geo.Vector3({{endPoint}}.X - {{startPoint}}.X, {{endPoint}}.Y - {{startPoint}}.Y, {{endPoint}}.Z - {{startPoint}}.Z);'
    },
    help: {
      inputs: [
        { name: 'Start Point', description: 'Tail point' },
        { name: 'End Point', description: 'Tip point' }
      ],
      outputs: [{ name: 'Vector', description: 'End − Start' }],
      example: {
        title: 'Vector from (0,0,0) to (3,4,0) — length 5',
        nodes: [
          { type: 'point-origin', x: 0, y: 0 },
          { type: 'point-bycoordinates', x: 0, y: 80, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Vector.ByStartPointEndPoint', x: 280, y: 30 },
          { type: 'Vector.Length', x: 500, y: 30 },
          { type: 'output-watch', x: 700, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'vector', 3, 'vector'],
          [3, 'length', 4, 'value']
        ]
      },
      sampleCode: '{{vector}} = Geo.Vector3({{endPoint}}.x - {{startPoint}}.x, {{endPoint}}.y - {{startPoint}}.y, {{endPoint}}.z - {{startPoint}}.z)'
    }
  },

  // ─── Query ───────────────────────────────────────────────
  {
    type: 'Vector.Length',
    name: 'Vector.Length',
    category: 'vector',
    subGroup: 'Query',
    icon: '∥',
    aliases: ['vector-length'],
    description: 'Returns the Euclidean magnitude (length) of a vector: √(x² + y² + z²). Always non-negative; zero for the zero vector.',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vector', description: 'Input vector' }],
    outputs: [{ id: 'length', name: 'Length', type: 'number', description: 'Magnitude of the vector' }],
    controls: [],
    execute(context, inputs) {
      const v = toVector(inputs.vector);
      return { length: v.length() };
    },
    codegen: {
      python: '{{length}} = {{vector}}.length()',
      csharp: 'double {{length}} = {{vector}}.length();'
    },
    help: {
      inputs: [{ name: 'Vector', description: 'Input vector' }],
      outputs: [{ name: 'Length', description: 'Magnitude' }],
      example: {
        title: '|(3, 4, 0)| = 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Vector.Length', x: 460, y: 60 },
          { type: 'output-watch', x: 660, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'vector', 4, 'vector'],
          [4, 'length', 5, 'value']
        ]
      },
      sampleCode: '{{length}} = {{vector}}.length()'
    }
  },
  {
    type: 'Vector.Deconstruct',
    name: 'Vector.Deconstruct',
    category: 'vector',
    subGroup: 'Query',
    icon: '⨁',
    aliases: ['vector-deconstruct'],
    description: 'Decomposes a vector into its scalar X, Y and Z components and reports its length. Useful for inspection, axis-by-axis math, and feeding individual coordinates downstream.',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vector', description: 'Vector to deconstruct' }],
    outputs: [
      { id: 'x', name: 'X', type: 'number', description: 'X component' },
      { id: 'y', name: 'Y', type: 'number', description: 'Y component' },
      { id: 'z', name: 'Z', type: 'number', description: 'Z component' },
      { id: 'length', name: 'Length', type: 'number', description: 'Magnitude' }
    ],
    controls: [],
    execute(context, inputs) {
      const v = toVector(inputs.vector);
      return { x: v.x, y: v.y, z: v.z, length: v.length() };
    },
    codegen: {
      python: '{{x}} = {{vector}}.x\n{{y}} = {{vector}}.y\n{{z}} = {{vector}}.z\n{{length}} = {{vector}}.length()',
      csharp: 'var {{x}} = {{vector}}.X; var {{y}} = {{vector}}.Y; var {{z}} = {{vector}}.Z; var {{length}} = {{vector}}.length();'
    },
    help: {
      inputs: [{ name: 'Vector', description: 'Vector to deconstruct' }],
      outputs: [
        { name: 'X', description: 'X component' },
        { name: 'Y', description: 'Y component' },
        { name: 'Z', description: 'Z component' },
        { name: 'Length', description: 'Magnitude' }
      ],
      example: {
        title: 'Deconstruct (3, 4, 0) — length 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Vector.Deconstruct', x: 460, y: 60 },
          { type: 'output-watch', x: 680, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'vector', 4, 'vector'],
          [4, 'length', 5, 'value']
        ]
      },
      sampleCode: '{{x}} = {{vector}}.x; {{length}} = {{vector}}.length()'
    }
  },
  {
    type: 'Vector.AngleBetween',
    name: 'Vector.AngleBetween',
    category: 'vector',
    subGroup: 'Query',
    icon: '∠',
    aliases: ['vector-angle'],
    description: 'Returns the angle (in degrees) between two vectors, in the range [0°, 180°]. The result is undefined when either vector is zero-length.',
    inputs: [
      { id: 'a', name: 'A', type: 'vector', description: 'First vector' },
      { id: 'b', name: 'B', type: 'vector', description: 'Second vector' }
    ],
    outputs: [{ id: 'angle', name: 'Angle°', type: 'number', description: 'Angle between A and B, in degrees' }],
    controls: [],
    execute(context, inputs) {
      const a = toVector(inputs.a);
      const b = toVector(inputs.b);
      const la = a.length();
      const lb = b.length();
      if (la === 0 || lb === 0) return { angle: undefined };
      const cos = Math.min(1, Math.max(-1, a.dot(b) / (la * lb)));
      return { angle: Math.acos(cos) * 180 / Math.PI };
    },
    codegen: {
      python: 'import math\n{{angle}} = math.degrees(math.acos(max(-1, min(1, {{a}}.dot({{b}}) / ({{a}}.length() * {{b}}.length())))))',
      csharp: 'double {{angle}} = Math.Acos(Math.Max(-1, Math.Min(1, {{a}}.dot({{b}}) / ({{a}}.length() * {{b}}.length())))) * 180 / Math.PI;'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First vector' },
        { name: 'B', description: 'Second vector' }
      ],
      outputs: [{ name: 'Angle°', description: 'Angle in degrees' }],
      example: {
        title: 'Angle between X-axis and (0, 1, 0) = 90°',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Input.Number', x: 0, y: 230, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 300, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 370, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 290 },
          { type: 'Vector.AngleBetween', x: 460, y: 180 },
          { type: 'output-watch', x: 680, y: 180 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [4, 'value', 7, 'x'],
          [5, 'value', 7, 'y'],
          [6, 'value', 7, 'z'],
          [3, 'vector', 8, 'a'],
          [7, 'vector', 8, 'b'],
          [8, 'angle', 9, 'value']
        ]
      },
      sampleCode: 'import math; {{angle}} = math.degrees(math.acos({{a}}.dot({{b}}) / ({{a}}.length() * {{b}}.length())))'
    }
  },

  // ─── Transform ───────────────────────────────────────────
  {
    type: 'Vector.Normalized',
    name: 'Vector.Normalized',
    category: 'vector',
    subGroup: 'Transform',
    icon: '◇',
    aliases: ['vector-normalize'],
    description: 'Returns a unit vector pointing in the same direction as the input. The result has length 1 unless the input is the zero vector (in which case the input is returned unchanged).',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vector', description: 'Vector to normalise' }],
    outputs: [{ id: 'result', name: 'Result', type: 'vector', description: 'Unit-length vector in the same direction' }],
    controls: [],
    execute(context, inputs) {
      return { result: toVector(inputs.vector).normalize() };
    },
    codegen: {
      python: '{{result}} = {{vector}}.normalize()',
      csharp: 'var {{result}} = {{vector}}.normalize();'
    },
    help: {
      inputs: [{ name: 'Vector', description: 'Vector to normalise' }],
      outputs: [{ name: 'Result', description: 'Unit vector' }],
      example: {
        title: 'Normalised (3, 4, 0) → length 1',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Vector.Normalized', x: 460, y: 60 },
          { type: 'Vector.Length', x: 660, y: 60 },
          { type: 'output-watch', x: 860, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'vector', 4, 'vector'],
          [4, 'result', 5, 'vector'],
          [5, 'length', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = {{vector}}.normalize()'
    }
  },
  {
    type: 'Vector.Reverse',
    name: 'Vector.Reverse',
    category: 'vector',
    subGroup: 'Transform',
    icon: '↩',
    aliases: ['vector-reverse'],
    description: 'Reverses the direction of a vector by negating each component. The magnitude is unchanged; the result points exactly opposite to the input.',
    inputs: [{ id: 'vector', name: 'Vector', type: 'vector', description: 'Vector to reverse' }],
    outputs: [{ id: 'result', name: 'Result', type: 'vector', description: 'Vector pointing opposite to the input' }],
    controls: [],
    execute(context, inputs) {
      return { result: toVector(inputs.vector).negate() };
    },
    codegen: {
      python: '{{result}} = {{vector}}.negate()',
      csharp: 'var {{result}} = {{vector}}.negate();'
    },
    help: {
      inputs: [{ name: 'Vector', description: 'Vector to reverse' }],
      outputs: [{ name: 'Result', description: 'Reversed vector' }],
      example: {
        title: 'Reverse (3, 4, 0) — length unchanged (5)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Vector.Reverse', x: 460, y: 60 },
          { type: 'Vector.Length', x: 660, y: 60 },
          { type: 'output-watch', x: 860, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'vector', 4, 'vector'],
          [4, 'result', 5, 'vector'],
          [5, 'length', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = {{vector}}.negate()'
    }
  },

  // ─── Operation ───────────────────────────────────────────
  {
    type: 'Vector.Add',
    name: 'Vector.Add',
    category: 'vector',
    subGroup: 'Operation',
    icon: '⊕',
    aliases: ['vector-add'],
    description: 'Returns the component-wise sum A + B of two vectors. Adding a translation vector to a position-style vector shifts it in space.',
    inputs: [
      { id: 'a', name: 'A', type: 'vector', description: 'First vector' },
      { id: 'b', name: 'B', type: 'vector', description: 'Second vector' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vector', description: 'A + B' }],
    controls: [],
    execute(context, inputs) {
      return { result: toVector(inputs.a).add(toVector(inputs.b)) };
    },
    codegen: {
      python: '{{result}} = {{a}}.add({{b}})',
      csharp: 'var {{result}} = {{a}}.add({{b}});'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First vector' },
        { name: 'B', description: 'Second vector' }
      ],
      outputs: [{ name: 'Result', description: 'A + B' }],
      example: {
        title: '(3, 0, 0) + (0, 4, 0) — length 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Input.Number', x: 0, y: 230, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 300, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 370, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 290 },
          { type: 'Vector.Add', x: 460, y: 180 },
          { type: 'Vector.Length', x: 660, y: 180 },
          { type: 'output-watch', x: 860, y: 180 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [4, 'value', 7, 'x'],
          [5, 'value', 7, 'y'],
          [6, 'value', 7, 'z'],
          [3, 'vector', 8, 'a'],
          [7, 'vector', 8, 'b'],
          [8, 'result', 9, 'vector'],
          [9, 'length', 10, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}}.add({{b}})'
    }
  },
  {
    type: 'Vector.Subtract',
    name: 'Vector.Subtract',
    category: 'vector',
    subGroup: 'Operation',
    icon: '⊖',
    aliases: ['vector-subtract'],
    description: 'Returns the component-wise difference A − B of two vectors. Subtracting two position vectors yields the displacement from B to A.',
    inputs: [
      { id: 'a', name: 'A', type: 'vector', description: 'Minuend vector' },
      { id: 'b', name: 'B', type: 'vector', description: 'Subtrahend vector' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vector', description: 'A − B' }],
    controls: [],
    execute(context, inputs) {
      const a = toVector(inputs.a);
      const b = toVector(inputs.b);
      return { result: new Geo.Vector3(a.x - b.x, a.y - b.y, a.z - b.z) };
    },
    codegen: {
      python: '{{result}} = Geo.Vector3({{a}}.x - {{b}}.x, {{a}}.y - {{b}}.y, {{a}}.z - {{b}}.z)',
      csharp: 'var {{result}} = Geo.Vector3({{a}}.X - {{b}}.X, {{a}}.Y - {{b}}.Y, {{a}}.Z - {{b}}.Z);'
    },
    help: {
      inputs: [
        { name: 'A', description: 'Minuend vector' },
        { name: 'B', description: 'Subtrahend vector' }
      ],
      outputs: [{ name: 'Result', description: 'A − B' }],
      example: {
        title: '(3, 4, 0) − (0, 4, 0) — length 3',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Input.Number', x: 0, y: 230, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 300, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 370, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 290 },
          { type: 'Vector.Subtract', x: 460, y: 180 },
          { type: 'Vector.Length', x: 660, y: 180 },
          { type: 'output-watch', x: 860, y: 180 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [4, 'value', 7, 'x'],
          [5, 'value', 7, 'y'],
          [6, 'value', 7, 'z'],
          [3, 'vector', 8, 'a'],
          [7, 'vector', 8, 'b'],
          [8, 'result', 9, 'vector'],
          [9, 'length', 10, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.Vector3({{a}}.x - {{b}}.x, {{a}}.y - {{b}}.y, {{a}}.z - {{b}}.z)'
    }
  },
  {
    type: 'Vector.Scale',
    name: 'Vector.Scale',
    category: 'vector',
    subGroup: 'Operation',
    icon: '⊗',
    aliases: ['vector-scale'],
    description: 'Multiplies a vector by a scalar factor. Each component is multiplied by Factor; length scales linearly, direction is preserved when Factor is positive and reversed when negative.',
    inputs: [
      { id: 'vector', name: 'Vector', type: 'vector', description: 'Input vector' },
      { id: 'factor', name: 'Factor', type: 'number', description: 'Scalar multiplier' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vector', description: 'Vector × Factor' }],
    controls: [{ id: 'factor', type: 'formula', default: '1', label: 'Factor' }],
    execute(context, inputs) {
      return { result: toVector(inputs.vector).scale(toNumber(inputs.factor, 1)) };
    },
    codegen: {
      python: '{{result}} = {{vector}}.scale({{factor}})',
      csharp: 'var {{result}} = {{vector}}.scale({{factor}});'
    },
    help: {
      inputs: [
        { name: 'Vector', description: 'Input vector' },
        { name: 'Factor', description: 'Multiplier' }
      ],
      outputs: [{ name: 'Result', description: 'Scaled vector' }],
      example: {
        title: '(3, 4, 0) × 2 — length 10',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Input.Number', x: 0, y: 230, controls: { val: 2 } },
          { type: 'Vector.Scale', x: 460, y: 120 },
          { type: 'Vector.Length', x: 680, y: 120 },
          { type: 'output-watch', x: 880, y: 120 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'vector', 5, 'vector'],
          [4, 'value', 5, 'factor'],
          [5, 'result', 6, 'vector'],
          [6, 'length', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = {{vector}}.scale({{factor}})'
    }
  },
  {
    type: 'Vector.Dot',
    name: 'Vector.Dot',
    category: 'vector',
    subGroup: 'Operation',
    icon: '·',
    aliases: ['vector-dot'],
    description: 'Returns the scalar dot product A · B = Ax·Bx + Ay·By + Az·Bz. Positive when A and B point the same way, zero when perpendicular, negative when opposing.',
    inputs: [
      { id: 'a', name: 'A', type: 'vector', description: 'First vector' },
      { id: 'b', name: 'B', type: 'vector', description: 'Second vector' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number', description: 'A · B' }],
    controls: [],
    execute(context, inputs) {
      return { result: toVector(inputs.a).dot(toVector(inputs.b)) };
    },
    codegen: {
      python: '{{result}} = {{a}}.dot({{b}})',
      csharp: 'double {{result}} = {{a}}.dot({{b}});'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First vector' },
        { name: 'B', description: 'Second vector' }
      ],
      outputs: [{ name: 'Result', description: 'Scalar dot product' }],
      example: {
        title: 'X-axis · X-axis = 1',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Vector.Dot', x: 460, y: 60 },
          { type: 'output-watch', x: 660, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'vector', 4, 'a'],
          [3, 'vector', 4, 'b'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}}.dot({{b}})'
    }
  },
  {
    type: 'Vector.Cross',
    name: 'Vector.Cross',
    category: 'vector',
    subGroup: 'Operation',
    icon: '×',
    aliases: ['vector-cross'],
    description: 'Returns the cross product A × B — a vector perpendicular to both A and B, with magnitude equal to the area of the parallelogram they span. Useful for surface normals and right-hand-rule axes.',
    inputs: [
      { id: 'a', name: 'A', type: 'vector', description: 'First vector' },
      { id: 'b', name: 'B', type: 'vector', description: 'Second vector' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'vector', description: 'A × B (perpendicular to both)' }],
    controls: [],
    execute(context, inputs) {
      return { result: toVector(inputs.a).cross(toVector(inputs.b)) };
    },
    codegen: {
      python: '{{result}} = {{a}}.cross({{b}})',
      csharp: 'var {{result}} = {{a}}.cross({{b}});'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First vector' },
        { name: 'B', description: 'Second vector' }
      ],
      outputs: [{ name: 'Result', description: 'Perpendicular vector' }],
      example: {
        title: 'X × Y = Z — length 1',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 60 },
          { type: 'Input.Number', x: 0, y: 230, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 300, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 370, controls: { val: 0 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 290 },
          { type: 'Vector.Cross', x: 460, y: 180 },
          { type: 'Vector.Length', x: 660, y: 180 },
          { type: 'output-watch', x: 860, y: 180 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [4, 'value', 7, 'x'],
          [5, 'value', 7, 'y'],
          [6, 'value', 7, 'z'],
          [3, 'vector', 8, 'a'],
          [7, 'vector', 8, 'b'],
          [8, 'result', 9, 'vector'],
          [9, 'length', 10, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}}.cross({{b}})'
    }
  }
];
