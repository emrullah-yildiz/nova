import { Geo } from '../../geometry/index.js';

export const pointCategory = {
  id: 'point',
  name: 'Point',
  color: '#89b4fa',
  icon: '•'
};

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}
function toPoint(value, fallback = new Geo.Point3(0, 0, 0)) {
  if (value && typeof value === 'object' && value.x !== undefined) return value;
  return fallback;
}

export const pointNodes = [
  // ─── Creation ────────────────────────────────────────────
  {
    type: 'Point.ByCoordinates',
    name: 'Point.ByCoordinates',
    category: 'point',
    subGroup: 'Creation',
    icon: '•',
    aliases: ['point-bycoordinates'],
    description: 'Creates a Point3 from its X, Y and Z components. The result is a positioned point in world space; the anchor for nearly every geometry construction downstream.',
    inputs: [
      { id: 'x', name: 'X', type: 'number', description: 'X coordinate' },
      { id: 'y', name: 'Y', type: 'number', description: 'Y coordinate' },
      { id: 'z', name: 'Z', type: 'number', description: 'Z coordinate' }
    ],
    outputs: [{ id: 'point', name: 'Point', type: 'point', description: 'Resulting point' }],
    controls: [
      { id: 'x', type: 'formula', default: '0', label: 'X' },
      { id: 'y', type: 'formula', default: '0', label: 'Y' },
      { id: 'z', type: 'formula', default: '0', label: 'Z' }
    ],
    execute(context, inputs) {
      return { point: new Geo.Point3(toNumber(inputs.x), toNumber(inputs.y), toNumber(inputs.z)) };
    },
    codegen: {
      python: '{{point}} = Geo.Point3({{x}}, {{y}}, {{z}})',
      csharp: 'var {{point}} = Geo.Point3({{x}}, {{y}}, {{z}});'
    },
    help: {
      inputs: [
        { name: 'X', description: 'X coordinate' },
        { name: 'Y', description: 'Y coordinate' },
        { name: 'Z', description: 'Z coordinate' }
      ],
      outputs: [{ name: 'Point', description: 'Positioned point' }],
      example: {
        title: 'Distance from origin to (3, 4, 0) = 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Point.ByCoordinates', x: 240, y: 60 },
          { type: 'Point.Origin', x: 240, y: 180 },
          { type: 'Geometry.Distance', x: 480, y: 90 },
          { type: 'output-watch', x: 700, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'point', 5, 'a'],
          [4, 'point', 5, 'b'],
          [5, 'distance', 6, 'value']
        ]
      },
      sampleCode: '{{point}} = Geo.Point3({{x}}, {{y}}, {{z}})'
    }
  },
  {
    type: 'Point.Origin',
    name: 'Point.Origin',
    category: 'point',
    subGroup: 'Creation',
    icon: '⊕',
    aliases: ['point-origin'],
    description: 'Returns the world origin point (0, 0, 0). The canonical anchor for axes, planes, and reference geometry; saves wiring three explicit zero inputs into Point.ByCoordinates.',
    inputs: [],
    outputs: [{ id: 'point', name: 'Point', type: 'point', description: 'World origin point (0, 0, 0)' }],
    controls: [],
    execute() {
      return { point: new Geo.Point3(0, 0, 0) };
    },
    codegen: {
      python: '{{point}} = Geo.Point3(0, 0, 0)',
      csharp: 'var {{point}} = Geo.Point3(0, 0, 0);'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Point', description: 'World origin' }],
      example: {
        title: 'X-component of the origin = 0',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.X', x: 220, y: 0 },
          { type: 'output-watch', x: 420, y: 0 }
        ],
        wires: [
          [0, 'point', 1, 'point'],
          [1, 'x', 2, 'value']
        ]
      },
      sampleCode: '{{point}} = Geo.Point3(0, 0, 0)'
    }
  },

  // ─── Query ───────────────────────────────────────────────
  {
    type: 'Point.Deconstruct',
    name: 'Point.Deconstruct',
    category: 'point',
    subGroup: 'Query',
    icon: '⊙',
    aliases: ['point-deconstruct'],
    description: 'Decomposes a point into its scalar X, Y and Z coordinates. Useful for axis-by-axis math, debugging, and feeding individual coordinates into downstream numeric nodes.',
    inputs: [{ id: 'point', name: 'Point', type: 'point', description: 'Point to decompose' }],
    outputs: [
      { id: 'x', name: 'X', type: 'number', description: 'X coordinate' },
      { id: 'y', name: 'Y', type: 'number', description: 'Y coordinate' },
      { id: 'z', name: 'Z', type: 'number', description: 'Z coordinate' }
    ],
    controls: [],
    execute(context, inputs) {
      const p = toPoint(inputs.point);
      return { x: p.x, y: p.y, z: p.z };
    },
    codegen: {
      python: '{{x}} = {{point}}.x\n{{y}} = {{point}}.y\n{{z}} = {{point}}.z',
      csharp: 'var {{x}} = {{point}}.X; var {{y}} = {{point}}.Y; var {{z}} = {{point}}.Z;'
    },
    help: {
      inputs: [{ name: 'Point', description: 'Point to decompose' }],
      outputs: [
        { name: 'X', description: 'X coordinate' },
        { name: 'Y', description: 'Y coordinate' },
        { name: 'Z', description: 'Z coordinate' }
      ],
      example: {
        title: 'Y-component of (3, 4, 0) = 4',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Point.ByCoordinates', x: 240, y: 60 },
          { type: 'Point.Deconstruct', x: 460, y: 60 },
          { type: 'output-watch', x: 680, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'point', 4, 'point'],
          [4, 'y', 5, 'value']
        ]
      },
      sampleCode: '{{x}} = {{point}}.x; {{y}} = {{point}}.y; {{z}} = {{point}}.z'
    }
  },
  {
    type: 'Point.X',
    name: 'Point.X',
    category: 'point',
    subGroup: 'Query',
    icon: '→',
    aliases: ['point-x'],
    description: 'Returns the X coordinate (horizontal axis position) of a point. Single-component shortcut equivalent to Point.Deconstruct followed by taking the X output.',
    inputs: [{ id: 'point', name: 'Point', type: 'point', description: 'Point to inspect' }],
    outputs: [{ id: 'x', name: 'X', type: 'number', description: 'X coordinate of the point' }],
    controls: [],
    execute(context, inputs) {
      return { x: toPoint(inputs.point).x };
    },
    codegen: {
      python: '{{x}} = {{point}}.x',
      csharp: 'var {{x}} = {{point}}.X;'
    },
    help: {
      inputs: [{ name: 'Point', description: 'Input point' }],
      outputs: [{ name: 'X', description: 'X coordinate' }],
      example: {
        title: 'X of (3, 4, 0) = 3',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Point.ByCoordinates', x: 240, y: 60 },
          { type: 'Point.X', x: 460, y: 60 },
          { type: 'output-watch', x: 660, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'point', 4, 'point'],
          [4, 'x', 5, 'value']
        ]
      },
      sampleCode: '{{x}} = {{point}}.x'
    }
  },
  {
    type: 'Point.Y',
    name: 'Point.Y',
    category: 'point',
    subGroup: 'Query',
    icon: '↑',
    aliases: ['point-y'],
    description: 'Returns the Y coordinate (vertical axis position) of a point. Single-component shortcut equivalent to Point.Deconstruct followed by taking the Y output.',
    inputs: [{ id: 'point', name: 'Point', type: 'point', description: 'Point to inspect' }],
    outputs: [{ id: 'y', name: 'Y', type: 'number', description: 'Y coordinate of the point' }],
    controls: [],
    execute(context, inputs) {
      return { y: toPoint(inputs.point).y };
    },
    codegen: {
      python: '{{y}} = {{point}}.y',
      csharp: 'var {{y}} = {{point}}.Y;'
    },
    help: {
      inputs: [{ name: 'Point', description: 'Input point' }],
      outputs: [{ name: 'Y', description: 'Y coordinate' }],
      example: {
        title: 'Y of (3, 4, 0) = 4',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0 } },
          { type: 'Point.ByCoordinates', x: 240, y: 60 },
          { type: 'Point.Y', x: 460, y: 60 },
          { type: 'output-watch', x: 660, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'point', 4, 'point'],
          [4, 'y', 5, 'value']
        ]
      },
      sampleCode: '{{y}} = {{point}}.y'
    }
  },
  {
    type: 'Point.Z',
    name: 'Point.Z',
    category: 'point',
    subGroup: 'Query',
    icon: '⤴',
    aliases: ['point-z'],
    description: 'Returns the Z coordinate (depth/elevation axis position) of a point. Single-component shortcut equivalent to Point.Deconstruct followed by taking the Z output.',
    inputs: [{ id: 'point', name: 'Point', type: 'point', description: 'Point to inspect' }],
    outputs: [{ id: 'z', name: 'Z', type: 'number', description: 'Z coordinate of the point' }],
    controls: [],
    execute(context, inputs) {
      return { z: toPoint(inputs.point).z };
    },
    codegen: {
      python: '{{z}} = {{point}}.z',
      csharp: 'var {{z}} = {{point}}.Z;'
    },
    help: {
      inputs: [{ name: 'Point', description: 'Input point' }],
      outputs: [{ name: 'Z', description: 'Z coordinate' }],
      example: {
        title: 'Z of (3, 4, 7) = 7',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 7 } },
          { type: 'Point.ByCoordinates', x: 240, y: 60 },
          { type: 'Point.Z', x: 460, y: 60 },
          { type: 'output-watch', x: 660, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'point', 4, 'point'],
          [4, 'z', 5, 'value']
        ]
      },
      sampleCode: '{{z}} = {{point}}.z'
    }
  }
];
