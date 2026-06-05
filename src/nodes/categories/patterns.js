import { Geo } from '../../geometry/index.js';

export const patternsCategory = {
  id: 'patterns',
  name: 'Patterns',
  color: '#f5c2e7',
  icon: '◈'
};

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}
function toInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(toNumber(value, fallback)));
}
function toPoint(value, fallback = new Geo.Point3(0, 0, 0)) {
  if (value && typeof value === 'object' && value.x !== undefined) return value;
  return fallback;
}
function toList(value) {
  return Array.isArray(value) ? value : [];
}

export const patternsNodes = [
  // ─── Attractor ───────────────────────────────────────────
  {
    type: 'Pattern.AttractorDeform',
    name: 'Pattern.AttractorDeform',
    category: 'patterns',
    subGroup: 'Attractor',
    icon: '⊕',
    aliases: ['field-attractor'],
    description: 'Deforms a mesh by pulling vertices toward (or pushing from) a list of attractor points within the given falloff radius. Strength controls the magnitude of the displacement at the attractor.',
    inputs: [
      { id: 'mesh', name: 'Mesh', type: 'mesh', description: 'Source mesh to deform' },
      { id: 'attractors', name: 'Attractors', type: 'list', description: 'List of attractor points' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Falloff radius from each attractor' },
      { id: 'strength', name: 'Strength', type: 'number', description: 'Maximum displacement magnitude' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'Deformed mesh' }],
    controls: [
      { id: 'radius', type: 'formula', default: '5', label: 'Radius' },
      { id: 'strength', type: 'formula', default: '1', label: 'Strength' }
    ],
    execute(context, inputs) {
      if (inputs.mesh == null) return { result: undefined };
      return {
        result: Geo.attractorDeform(
          inputs.mesh,
          toList(inputs.attractors),
          toNumber(inputs.radius, 5),
          toNumber(inputs.strength, 1)
        )
      };
    },
    codegen: {
      python: '{{result}} = Geo.attractorDeform({{mesh}}, {{attractors}}, {{radius}}, {{strength}})',
      csharp: 'var {{result}} = Geo.attractorDeform({{mesh}}, {{attractors}}, {{radius}}, {{strength}});'
    },
    help: {
      inputs: [
        { name: 'Mesh', description: 'Source mesh' },
        { name: 'Attractors', description: 'Attractor points' },
        { name: 'Radius', description: 'Falloff radius' },
        { name: 'Strength', description: 'Displacement strength' }
      ],
      outputs: [{ name: 'Result', description: 'Deformed mesh' }],
      example: {
        title: 'Deform a unit cube with one attractor at (2,0,0)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 1 } },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 90 },
          { type: 'Point.ByCoordinates', x: 0, y: 300, controls: { x: 2, y: 0, z: 0 } },
          { type: 'List.Create', x: 240, y: 300 },
          { type: 'Input.Number', x: 240, y: 410, controls: { val: 3 } },
          { type: 'Input.Number', x: 240, y: 480, controls: { val: 1 } },
          { type: 'Pattern.AttractorDeform', x: 480, y: 200 },
          { type: 'Output.Watch', x: 720, y: 200 }
        ],
        wires: [
          [0, 'point', 4, 'center'],
          [1, 'value', 4, 'width'],
          [2, 'value', 4, 'depth'],
          [3, 'value', 4, 'height'],
          [5, 'point', 6, 'item0'],
          [4, 'solid', 9, 'mesh'],
          [6, 'list', 9, 'attractors'],
          [7, 'value', 9, 'radius'],
          [8, 'value', 9, 'strength'],
          [9, 'result', 10, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.attractorDeform({{mesh}}, {{attractors}}, {{radius}}, {{strength}})'
    }
  },
  {
    type: 'Pattern.PointAttractor',
    name: 'Pattern.PointAttractor',
    category: 'patterns',
    subGroup: 'Attractor',
    icon: '◎',
    aliases: ['pat-point-attractor'],
    description: 'Returns a 0..1 influence value at a sample point given an attractor point, a falloff radius and a falloff exponent. Useful as a driver for scaling, color or displacement in parametric patterns.',
    inputs: [
      { id: 'point', name: 'Point', type: 'point', description: 'Sample point' },
      { id: 'attractor', name: 'Attractor', type: 'point', description: 'Attractor point' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Falloff radius' },
      { id: 'falloff', name: 'Falloff', type: 'number', description: 'Falloff exponent' }
    ],
    outputs: [{ id: 'influence', name: 'Influence', type: 'number', description: '0..1 influence at the sample point' }],
    controls: [
      { id: 'radius', type: 'formula', default: '10', label: 'Radius' },
      { id: 'falloff', type: 'formula', default: '2', label: 'Falloff' }
    ],
    execute(context, inputs) {
      if (inputs.point == null || inputs.attractor == null) return { influence: 0 };
      return {
        influence: Geo.pointAttractor(
          inputs.point,
          inputs.attractor,
          toNumber(inputs.radius, 10),
          toNumber(inputs.falloff, 2)
        )
      };
    },
    codegen: {
      python: '{{influence}} = Geo.pointAttractor({{point}}, {{attractor}}, {{radius}}, {{falloff}})',
      csharp: 'var {{influence}} = Geo.pointAttractor({{point}}, {{attractor}}, {{radius}}, {{falloff}});'
    },
    help: {
      inputs: [
        { name: 'Point', description: 'Sample point' },
        { name: 'Attractor', description: 'Attractor point' },
        { name: 'Radius', description: 'Falloff radius' },
        { name: 'Falloff', description: 'Falloff exponent' }
      ],
      outputs: [{ name: 'Influence', description: '0..1 influence value' }],
      example: {
        title: 'Influence at (2,0,0) from attractor at origin, r=5',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 2, y: 0, z: 0 } },
          { type: 'Point.Origin', x: 0, y: 80 },
          { type: 'Input.Number', x: 0, y: 160, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 230, controls: { val: 2 } },
          { type: 'Pattern.PointAttractor', x: 260, y: 100 },
          { type: 'Output.Watch', x: 500, y: 100 }
        ],
        wires: [
          [0, 'point', 4, 'point'],
          [1, 'point', 4, 'attractor'],
          [2, 'value', 4, 'radius'],
          [3, 'value', 4, 'falloff'],
          [4, 'influence', 5, 'value']
        ]
      },
      sampleCode: '{{influence}} = Geo.pointAttractor({{point}}, {{attractor}}, {{radius}}, {{falloff}})'
    }
  },

  // ─── Distribution ────────────────────────────────────────
  {
    type: 'Pattern.FibonacciSphere',
    name: 'Pattern.FibonacciSphere',
    category: 'patterns',
    subGroup: 'Distribution',
    icon: '◉',
    aliases: ['pat-fibonacci-sphere'],
    description: 'Distributes Count points roughly uniformly on the surface of a sphere of the given Radius using the golden-angle Fibonacci spiral. Ideal for even point sampling on a sphere.',
    inputs: [
      { id: 'count', name: 'Count', type: 'number', description: 'Number of points to generate' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Sphere radius' }
    ],
    outputs: [{ id: 'points', name: 'Points', type: 'list', description: 'List of sphere-surface points' }],
    controls: [
      { id: 'count', type: 'formula', default: '50', label: 'Count' },
      { id: 'radius', type: 'formula', default: '5', label: 'Radius' }
    ],
    execute(context, inputs) {
      return {
        points: Geo.fibonacciSphere(
          toInteger(inputs.count, 50),
          toNumber(inputs.radius, 5)
        )
      };
    },
    codegen: {
      python: '{{points}} = Geo.fibonacciSphere(int({{count}}), {{radius}})',
      csharp: 'var {{points}} = Geo.fibonacciSphere((int){{count}}, {{radius}});'
    },
    help: {
      inputs: [
        { name: 'Count', description: 'Number of points' },
        { name: 'Radius', description: 'Sphere radius' }
      ],
      outputs: [{ name: 'Points', description: 'Point list' }],
      example: {
        title: 'Fibonacci sphere with 50 points — count = 50',
        nodes: [
          { type: 'Input.Integer', x: 0, y: 0, controls: { val: 50 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Pattern.FibonacciSphere', x: 240, y: 30 },
          { type: 'List.Count', x: 480, y: 30 },
          { type: 'Output.Watch', x: 680, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'count'],
          [1, 'value', 2, 'radius'],
          [2, 'points', 3, 'list'],
          [3, 'count', 4, 'value']
        ]
      },
      sampleCode: '{{points}} = Geo.fibonacciSphere({{count}}, {{radius}})'
    }
  },
  {
    type: 'Pattern.Phyllotaxis',
    name: 'Pattern.Phyllotaxis',
    category: 'patterns',
    subGroup: 'Distribution',
    icon: '✿',
    aliases: ['pat-phyllotaxis'],
    description: 'Generates a phyllotaxis (sunflower-spiral) distribution of Count points within a disk of the given Radius. Replicates the golden-angle floret arrangement found in seed heads.',
    inputs: [
      { id: 'count', name: 'Count', type: 'number', description: 'Number of points' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Outer disk radius' }
    ],
    outputs: [{ id: 'points', name: 'Points', type: 'list', description: 'List of phyllotaxis points' }],
    controls: [
      { id: 'count', type: 'formula', default: '100', label: 'Count' },
      { id: 'radius', type: 'formula', default: '10', label: 'Radius' }
    ],
    execute(context, inputs) {
      return {
        points: Geo.phyllotaxis(
          toInteger(inputs.count, 100),
          toNumber(inputs.radius, 10)
        )
      };
    },
    codegen: {
      python: '{{points}} = Geo.phyllotaxis(int({{count}}), {{radius}})',
      csharp: 'var {{points}} = Geo.phyllotaxis((int){{count}}, {{radius}});'
    },
    help: {
      inputs: [
        { name: 'Count', description: 'Number of points' },
        { name: 'Radius', description: 'Outer radius' }
      ],
      outputs: [{ name: 'Points', description: 'Point list' }],
      example: {
        title: 'Phyllotaxis with 100 points — count = 100',
        nodes: [
          { type: 'Input.Integer', x: 0, y: 0, controls: { val: 100 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 10 } },
          { type: 'Pattern.Phyllotaxis', x: 240, y: 30 },
          { type: 'List.Count', x: 480, y: 30 },
          { type: 'Output.Watch', x: 680, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'count'],
          [1, 'value', 2, 'radius'],
          [2, 'points', 3, 'list'],
          [3, 'count', 4, 'value']
        ]
      },
      sampleCode: '{{points}} = Geo.phyllotaxis({{count}}, {{radius}})'
    }
  },

  // ─── Grid ────────────────────────────────────────────────
  {
    type: 'Pattern.DiamondGrid',
    name: 'Pattern.DiamondGrid',
    category: 'patterns',
    subGroup: 'Grid',
    icon: '◇',
    aliases: ['pat-diamond-grid'],
    description: 'Builds a Rows×Cols array of filled diamond-shaped tiles with the given Width and Height on the XY plane, with alternating-row offset for a true diamond tiling. Each tile is a mesh that shades like a panel.',
    inputs: [
      { id: 'origin', name: 'Origin', type: 'point', description: 'Grid origin point' },
      { id: 'width', name: 'Width', type: 'number', description: 'Diamond width (X direction)' },
      { id: 'height', name: 'Height', type: 'number', description: 'Diamond height (Y direction)' },
      { id: 'rows', name: 'Rows', type: 'number', description: 'Number of rows' },
      { id: 'cols', name: 'Cols', type: 'number', description: 'Number of columns' }
    ],
    outputs: [{ id: 'cells', name: 'Cells', type: 'list', description: 'List of diamond tile meshes' }],
    controls: [
      { id: 'width', type: 'formula', default: '2', label: 'Width' },
      { id: 'height', type: 'formula', default: '2', label: 'Height' },
      { id: 'rows', type: 'formula', default: '5', label: 'Rows' },
      { id: 'cols', type: 'formula', default: '5', label: 'Cols' }
    ],
    execute(context, inputs) {
      return {
        cells: Geo.diamondGrid(
          toPoint(inputs.origin),
          toNumber(inputs.width, 2),
          toNumber(inputs.height, 2),
          toInteger(inputs.rows, 5),
          toInteger(inputs.cols, 5)
        )
      };
    },
    codegen: {
      python: '{{cells}} = Geo.diamondGrid({{origin}}, {{width}}, {{height}}, int({{rows}}), int({{cols}}))',
      csharp: 'var {{cells}} = Geo.diamondGrid({{origin}}, {{width}}, {{height}}, (int){{rows}}, (int){{cols}});'
    },
    help: {
      inputs: [
        { name: 'Origin', description: 'Grid origin' },
        { name: 'Width', description: 'Diamond width' },
        { name: 'Height', description: 'Diamond height' },
        { name: 'Rows', description: 'Row count' },
        { name: 'Cols', description: 'Column count' }
      ],
      outputs: [{ name: 'Cells', description: 'Diamond tile meshes' }],
      example: {
        title: '4×4 diamond grid — 16 cells',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 2 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 2 } },
          { type: 'Input.Integer', x: 0, y: 220, controls: { val: 4 } },
          { type: 'Input.Integer', x: 0, y: 290, controls: { val: 4 } },
          { type: 'Pattern.DiamondGrid', x: 260, y: 150 },
          { type: 'List.Count', x: 500, y: 150 },
          { type: 'Output.Watch', x: 700, y: 150 }
        ],
        wires: [
          [0, 'point', 5, 'origin'],
          [1, 'value', 5, 'width'],
          [2, 'value', 5, 'height'],
          [3, 'value', 5, 'rows'],
          [4, 'value', 5, 'cols'],
          [5, 'cells', 6, 'list'],
          [6, 'count', 7, 'value']
        ]
      },
      sampleCode: '{{cells}} = Geo.diamondGrid({{origin}}, {{width}}, {{height}}, {{rows}}, {{cols}})'
    }
  },
  {
    type: 'Pattern.HexGrid',
    name: 'Pattern.HexGrid',
    category: 'patterns',
    subGroup: 'Grid',
    icon: '⎔',
    aliases: ['pat-hex-grid'],
    description: 'Builds a Rows×Cols array of filled regular hexagonal tiles on the XY plane. Adjacent columns are offset by half a hex height so the cells tile without gaps; each tile is a fan-triangulated mesh that shades like a panel.',
    inputs: [
      { id: 'origin', name: 'Origin', type: 'point', description: 'Grid origin point' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Hexagon circumradius' },
      { id: 'rows', name: 'Rows', type: 'number', description: 'Number of rows' },
      { id: 'cols', name: 'Cols', type: 'number', description: 'Number of columns' }
    ],
    outputs: [{ id: 'cells', name: 'Cells', type: 'list', description: 'List of hex tile meshes' }],
    controls: [
      { id: 'radius', type: 'formula', default: '2', label: 'Radius' },
      { id: 'rows', type: 'formula', default: '5', label: 'Rows' },
      { id: 'cols', type: 'formula', default: '5', label: 'Cols' }
    ],
    execute(context, inputs) {
      return {
        cells: Geo.hexGrid(
          toPoint(inputs.origin),
          toNumber(inputs.radius, 2),
          toInteger(inputs.rows, 5),
          toInteger(inputs.cols, 5)
        )
      };
    },
    codegen: {
      python: '{{cells}} = Geo.hexGrid({{origin}}, {{radius}}, int({{rows}}), int({{cols}}))',
      csharp: 'var {{cells}} = Geo.hexGrid({{origin}}, {{radius}}, (int){{rows}}, (int){{cols}});'
    },
    help: {
      inputs: [
        { name: 'Origin', description: 'Grid origin' },
        { name: 'Radius', description: 'Hex circumradius' },
        { name: 'Rows', description: 'Row count' },
        { name: 'Cols', description: 'Column count' }
      ],
      outputs: [{ name: 'Cells', description: 'Hex tile meshes' }],
      example: {
        title: '3×3 hex grid — 9 cells',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 2 } },
          { type: 'Input.Integer', x: 0, y: 150, controls: { val: 3 } },
          { type: 'Input.Integer', x: 0, y: 220, controls: { val: 3 } },
          { type: 'Pattern.HexGrid', x: 260, y: 100 },
          { type: 'List.Count', x: 500, y: 100 },
          { type: 'Output.Watch', x: 700, y: 100 }
        ],
        wires: [
          [0, 'point', 4, 'origin'],
          [1, 'value', 4, 'radius'],
          [2, 'value', 4, 'rows'],
          [3, 'value', 4, 'cols'],
          [4, 'cells', 5, 'list'],
          [5, 'count', 6, 'value']
        ]
      },
      sampleCode: '{{cells}} = Geo.hexGrid({{origin}}, {{radius}}, {{rows}}, {{cols}})'
    }
  },

  // ─── Noise ───────────────────────────────────────────────
  {
    type: 'Pattern.FBM',
    name: 'Pattern.FBM',
    category: 'patterns',
    subGroup: 'Noise',
    icon: '≈',
    aliases: ['pat-fbm'],
    description: 'Returns a fractal Brownian motion (fBm) noise value at the given (x, y, z) coordinate by summing Octaves of Perlin noise at doubling frequencies and halving amplitudes.',
    inputs: [
      { id: 'x', name: 'X', type: 'number', description: 'X coordinate' },
      { id: 'y', name: 'Y', type: 'number', description: 'Y coordinate' },
      { id: 'z', name: 'Z', type: 'number', description: 'Z coordinate' },
      { id: 'octaves', name: 'Octaves', type: 'number', description: 'Number of octaves to sum' }
    ],
    outputs: [{ id: 'value', name: 'Value', type: 'number', description: 'fBm noise value' }],
    controls: [
      { id: 'octaves', type: 'formula', default: '4', label: 'Octaves' }
    ],
    execute(context, inputs) {
      return {
        value: Geo.fbm(
          toNumber(inputs.x, 0),
          toNumber(inputs.y, 0),
          toNumber(inputs.z, 0),
          toInteger(inputs.octaves, 4)
        )
      };
    },
    codegen: {
      python: '{{value}} = Geo.fbm({{x}}, {{y}}, {{z}}, int({{octaves}}))',
      csharp: 'var {{value}} = Geo.fbm({{x}}, {{y}}, {{z}}, (int){{octaves}});'
    },
    help: {
      inputs: [
        { name: 'X', description: 'X coord' },
        { name: 'Y', description: 'Y coord' },
        { name: 'Z', description: 'Z coord' },
        { name: 'Octaves', description: 'Octave count' }
      ],
      outputs: [{ name: 'Value', description: 'fBm value' }],
      example: {
        title: 'fBm at (1.5, 2.5, 0.5) with 4 octaves',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1.5 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 2.5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0.5 } },
          { type: 'Input.Integer', x: 0, y: 210, controls: { val: 4 } },
          { type: 'Pattern.FBM', x: 240, y: 100 },
          { type: 'Output.Watch', x: 480, y: 100 }
        ],
        wires: [
          [0, 'value', 4, 'x'],
          [1, 'value', 4, 'y'],
          [2, 'value', 4, 'z'],
          [3, 'value', 4, 'octaves'],
          [4, 'value', 5, 'value']
        ]
      },
      sampleCode: '{{value}} = Geo.fbm({{x}}, {{y}}, {{z}}, {{octaves}})'
    }
  },
  {
    type: 'Pattern.NoiseDeform',
    name: 'Pattern.NoiseDeform',
    category: 'patterns',
    subGroup: 'Noise',
    icon: '↝',
    aliases: ['pat-noise-deform'],
    description: 'Displaces each mesh vertex along a Perlin-noise field sampled at the vertex position. Amplitude controls maximum displacement; Frequency controls the noise spatial period.',
    inputs: [
      { id: 'mesh', name: 'Mesh', type: 'mesh', description: 'Source mesh to deform' },
      { id: 'amplitude', name: 'Amplitude', type: 'number', description: 'Maximum displacement' },
      { id: 'frequency', name: 'Frequency', type: 'number', description: 'Noise sampling frequency' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'Deformed mesh' }],
    controls: [
      { id: 'amplitude', type: 'formula', default: '0.5', label: 'Amplitude' },
      { id: 'frequency', type: 'formula', default: '0.3', label: 'Frequency' }
    ],
    execute(context, inputs) {
      if (inputs.mesh == null) return { result: undefined };
      return {
        result: Geo.noiseDeform(
          inputs.mesh,
          toNumber(inputs.amplitude, 0.5),
          toNumber(inputs.frequency, 0.3)
        )
      };
    },
    codegen: {
      python: '{{result}} = Geo.noiseDeform({{mesh}}, {{amplitude}}, {{frequency}})',
      csharp: 'var {{result}} = Geo.noiseDeform({{mesh}}, {{amplitude}}, {{frequency}});'
    },
    help: {
      inputs: [
        { name: 'Mesh', description: 'Source mesh' },
        { name: 'Amplitude', description: 'Displacement amplitude' },
        { name: 'Frequency', description: 'Noise frequency' }
      ],
      outputs: [{ name: 'Result', description: 'Deformed mesh' }],
      example: {
        title: 'Noise-deform a unit cube — amp 0.3, freq 1.0',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 1 } },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 90 },
          { type: 'Input.Number', x: 240, y: 230, controls: { val: 0.3 } },
          { type: 'Input.Number', x: 240, y: 300, controls: { val: 1.0 } },
          { type: 'Pattern.NoiseDeform', x: 480, y: 170 },
          { type: 'Output.Watch', x: 720, y: 170 }
        ],
        wires: [
          [0, 'point', 4, 'center'],
          [1, 'value', 4, 'width'],
          [2, 'value', 4, 'depth'],
          [3, 'value', 4, 'height'],
          [4, 'solid', 7, 'mesh'],
          [5, 'value', 7, 'amplitude'],
          [6, 'value', 7, 'frequency'],
          [7, 'result', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.noiseDeform({{mesh}}, {{amplitude}}, {{frequency}})'
    }
  },
  {
    type: 'Pattern.Perlin2D',
    name: 'Pattern.Perlin2D',
    category: 'patterns',
    subGroup: 'Noise',
    icon: '〰',
    aliases: ['pat-perlin2'],
    description: 'Returns a smooth Perlin-noise value at the 2-D coordinate (x, y). Output is roughly in -1..1 and varies smoothly as the inputs change — the basic building block for procedural patterns.',
    inputs: [
      { id: 'x', name: 'X', type: 'number', description: 'X coordinate' },
      { id: 'y', name: 'Y', type: 'number', description: 'Y coordinate' }
    ],
    outputs: [{ id: 'value', name: 'Value', type: 'number', description: 'Perlin noise value' }],
    controls: [],
    execute(context, inputs) {
      return { value: Geo.perlin2(toNumber(inputs.x, 0), toNumber(inputs.y, 0)) };
    },
    codegen: {
      python: '{{value}} = Geo.perlin2({{x}}, {{y}})',
      csharp: 'var {{value}} = Geo.perlin2({{x}}, {{y}});'
    },
    help: {
      inputs: [
        { name: 'X', description: 'X coord' },
        { name: 'Y', description: 'Y coord' }
      ],
      outputs: [{ name: 'Value', description: 'Noise value' }],
      example: {
        title: 'Perlin 2D at (1.5, 2.5)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1.5 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 2.5 } },
          { type: 'Pattern.Perlin2D', x: 240, y: 30 },
          { type: 'Output.Watch', x: 480, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'x'],
          [1, 'value', 2, 'y'],
          [2, 'value', 3, 'value']
        ]
      },
      sampleCode: '{{value}} = Geo.perlin2({{x}}, {{y}})'
    }
  },
  {
    type: 'Pattern.Perlin3D',
    name: 'Pattern.Perlin3D',
    category: 'patterns',
    subGroup: 'Noise',
    icon: '≋',
    aliases: ['pat-perlin3'],
    description: 'Returns a smooth Perlin-noise value at the 3-D coordinate (x, y, z). Use to drive volumetric patterns, animate noise over a Z parameter, or sample noise on arbitrary 3-D surfaces.',
    inputs: [
      { id: 'x', name: 'X', type: 'number', description: 'X coordinate' },
      { id: 'y', name: 'Y', type: 'number', description: 'Y coordinate' },
      { id: 'z', name: 'Z', type: 'number', description: 'Z coordinate' }
    ],
    outputs: [{ id: 'value', name: 'Value', type: 'number', description: 'Perlin noise value' }],
    controls: [],
    execute(context, inputs) {
      return { value: Geo.perlin3(toNumber(inputs.x, 0), toNumber(inputs.y, 0), toNumber(inputs.z, 0)) };
    },
    codegen: {
      python: '{{value}} = Geo.perlin3({{x}}, {{y}}, {{z}})',
      csharp: 'var {{value}} = Geo.perlin3({{x}}, {{y}}, {{z}});'
    },
    help: {
      inputs: [
        { name: 'X', description: 'X coord' },
        { name: 'Y', description: 'Y coord' },
        { name: 'Z', description: 'Z coord' }
      ],
      outputs: [{ name: 'Value', description: 'Noise value' }],
      example: {
        title: 'Perlin 3D at (1.5, 2.5, 0.5)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1.5 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 2.5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 0.5 } },
          { type: 'Pattern.Perlin3D', x: 240, y: 60 },
          { type: 'Output.Watch', x: 480, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'x'],
          [1, 'value', 3, 'y'],
          [2, 'value', 3, 'z'],
          [3, 'value', 4, 'value']
        ]
      },
      sampleCode: '{{value}} = Geo.perlin3({{x}}, {{y}}, {{z}})'
    }
  },
  {
    type: 'Pattern.SinDeform',
    name: 'Pattern.SinDeform',
    category: 'patterns',
    subGroup: 'Noise',
    icon: '∿',
    aliases: ['field-sin'],
    description: 'Displaces mesh vertices along the chosen Axis by a sine wave whose phase is taken from the perpendicular coordinate. Produces clean periodic ripples — useful for cladding studies and waveform geometry.',
    inputs: [
      { id: 'mesh', name: 'Mesh', type: 'mesh', description: 'Source mesh to deform' },
      { id: 'amplitude', name: 'Amplitude', type: 'number', description: 'Wave amplitude' },
      { id: 'frequency', name: 'Frequency', type: 'number', description: 'Wave frequency' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'Deformed mesh' }],
    controls: [
      { id: 'amplitude', type: 'formula', default: '0.5', label: 'Amplitude' },
      { id: 'frequency', type: 'formula', default: '1', label: 'Frequency' },
      { id: 'axis', type: 'dropdown', options: ['z', 'x', 'y'], default: 'z', label: 'Axis' }
    ],
    execute(context, inputs, controls) {
      if (inputs.mesh == null) return { result: undefined };
      return {
        result: Geo.sinDeform(
          inputs.mesh,
          toNumber(inputs.amplitude, 0.5),
          toNumber(inputs.frequency, 1),
          controls && controls.axis ? controls.axis : 'z'
        )
      };
    },
    codegen: {
      python: '{{result}} = Geo.sinDeform({{mesh}}, {{amplitude}}, {{frequency}}, "{{ctrl.axis}}")',
      csharp: 'var {{result}} = Geo.sinDeform({{mesh}}, {{amplitude}}, {{frequency}}, "{{ctrl.axis}}");'
    },
    help: {
      inputs: [
        { name: 'Mesh', description: 'Source mesh' },
        { name: 'Amplitude', description: 'Wave amplitude' },
        { name: 'Frequency', description: 'Wave frequency' }
      ],
      outputs: [{ name: 'Result', description: 'Deformed mesh' }],
      example: {
        title: 'Sin-deform a unit cube along Z',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 1 } },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 90 },
          { type: 'Input.Number', x: 240, y: 230, controls: { val: 0.3 } },
          { type: 'Input.Number', x: 240, y: 300, controls: { val: 1 } },
          { type: 'Pattern.SinDeform', x: 480, y: 170 },
          { type: 'Output.Watch', x: 720, y: 170 }
        ],
        wires: [
          [0, 'point', 4, 'center'],
          [1, 'value', 4, 'width'],
          [2, 'value', 4, 'depth'],
          [3, 'value', 4, 'height'],
          [4, 'solid', 7, 'mesh'],
          [5, 'value', 7, 'amplitude'],
          [6, 'value', 7, 'frequency'],
          [7, 'result', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.sinDeform({{mesh}}, {{amplitude}}, {{frequency}}, "z")'
    }
  },

  // ─── Panels ──────────────────────────────────────────────
  {
    type: 'Pattern.FacadePanels',
    name: 'Pattern.FacadePanels',
    category: 'patterns',
    subGroup: 'Panels',
    icon: '▦',
    aliases: ['pat-facade-panels'],
    description: 'Divides a surface into a U×V grid of rectangular facade panels. When a curved Surface is wired in, corners are projected onto the actual surface so each panel sits on it. Returns a list of panel objects — each with corner points and an orientation frame — ready for Panel.ByPoints or Pattern.PanelFrames.',
    inputs: [
      { id: 'mesh', name: 'Surface', type: 'any', description: 'Surface or surface mesh to panelize. Accepts Surface.ByPatch output (curved surface) or a flat mesh.' },
      { id: 'uPanels', name: 'U Panels', type: 'number', description: 'Number of panels along U' },
      { id: 'vPanels', name: 'V Panels', type: 'number', description: 'Number of panels along V' }
    ],
    outputs: [{ id: 'panels', name: 'Panels', type: 'list', description: 'List of panel objects { points: Point[], frame: { origin, xAxis, yAxis, normal } }' }],
    controls: [
      { id: 'uPanels', type: 'formula', default: '4', label: 'U Panels' },
      { id: 'vPanels', type: 'formula', default: '4', label: 'V Panels' }
    ],
    execute(context, inputs) {
      if (inputs.mesh == null) return { panels: [] };
      return {
        panels: Geo.facadePanelsOnSurface(
          inputs.mesh,
          toInteger(inputs.uPanels, 4),
          toInteger(inputs.vPanels, 4)
        )
      };
    },
    codegen: {
      python: '{{panels}} = Geo.facadePanelsOnSurface({{mesh}}, int({{uPanels}}), int({{vPanels}}))',
      csharp: 'var {{panels}} = Geo.facadePanelsOnSurface({{mesh}}, (int){{uPanels}}, (int){{vPanels}});'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface or mesh to panelize (accepts Surface.ByPatch curved surfaces)' },
        { name: 'U Panels', description: 'U panel count' },
        { name: 'V Panels', description: 'V panel count' }
      ],
      outputs: [{ name: 'Panels', description: 'List of panel objects (points + frame)' }],
      example: {
        title: '4×4 panels on a curved surface — 16 panel objects ready for Panel.ByPoints',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 10, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 10, y: 10, z: 5 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0, y: 10, z: 2 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Surface.ByPatch', x: 460, y: 90 },
          { type: 'Input.Integer', x: 460, y: 230, controls: { val: 4 } },
          { type: 'Input.Integer', x: 460, y: 300, controls: { val: 4 } },
          { type: 'Pattern.FacadePanels', x: 700, y: 170 },
          { type: 'Panel.ByPoints', x: 940, y: 170 },
          { type: 'Output.Watch', x: 1140, y: 170 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'boundary'],
          [5, 'surface', 8, 'mesh'],
          [6, 'value', 8, 'uPanels'],
          [7, 'value', 8, 'vPanels'],
          [8, 'panels', 9, 'panels'],
          [9, 'meshes', 10, 'value']
        ]
      },
      sampleCode: '{{panels}} = Geo.facadePanelsOnSurface({{mesh}}, {{uPanels}}, {{vPanels}})'
    }
  },

  {
    type: 'Pattern.PanelFrames',
    name: 'Pattern.PanelFrames',
    category: 'patterns',
    subGroup: 'Panels',
    icon: '⌖',
    aliases: ['pat-panel-frames'],
    description: 'Recovers a per-panel orientation frame from a list of panel meshes (e.g. from Pattern.FacadePanels). Each frame is a plane whose origin is the panel centroid, whose normal is the area-weighted (Newell) panel normal, and whose in-plane axes are orthonormal — the SAME plane shape Geometry.Orient consumes, so a panel family, mullion or box drops flat onto every panel.',
    inputs: [
      { id: 'panels', name: 'Panels', type: 'list', description: 'List of panel meshes (quad/polygon meshes)' }
    ],
    outputs: [
      { id: 'frames', name: 'Frames', type: 'list', description: 'Orientation plane per panel (centroid origin + panel normal)' },
      { id: 'centroids', name: 'Centroids', type: 'list', description: 'Centroid point per panel' }
    ],
    controls: [],
    execute(context, inputs) {
      const panels = toList(inputs.panels);
      if (panels.length === 0) return { frames: [], centroids: [] };
      // Backwards-compatible: if items have a `frame` property (new panel-object
      // format from facadePanelsOnSurface / voronoiCellObjects) use it directly;
      // otherwise fall back to centroid computation on raw mesh (existing logic).
      const frames = panels.map((panel) => {
        if (panel && panel.frame) return panel.frame;
        // Legacy path: compute frame from the raw mesh via panelFrames.
        return Geo.panelFrames([panel])[0] || null;
      });
      const centroids = frames.map((f) => (f && f.origin ? f.origin : null));
      return { frames, centroids };
    },
    codegen: {
      python: '{{frames}} = [p["frame"] if hasattr(p, "frame") else Geo.panelFrames([p])[0] for p in {{panels}}]\n{{centroids}} = [f.origin for f in {{frames}}]',
      csharp: 'var {{frames}} = {{panels}}.Select(p => p.frame ?? Geo.panelFrames(new[]{p})[0]).ToList();\nvar {{centroids}} = {{frames}}.Select(f => f.origin).ToList();'
    },
    help: {
      inputs: [
        { name: 'Panels', description: 'List of panel meshes' }
      ],
      outputs: [
        { name: 'Frames', description: 'Orientation plane per panel' },
        { name: 'Centroids', description: 'Centroid point per panel' }
      ],
      // FACADE RATIONALIZATION LOOP (M1 + M2 + M5): a surface patch →
      // Pattern.FacadePanels splits it into quad panels → Pattern.PanelFrames
      // recovers a frame per panel → Geometry.Orient lays a thin panel box
      // (built on world XY) flat onto every frame → Output.Watch shows the
      // populated facade. The frames list laces into Orient's toPlane input.
      example: {
        title: 'Panelize a patch, recover frames, orient a thin box onto every panel',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 4, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 4, y: 4, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0, y: 4, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Surface.ByPatch', x: 460, y: 90 },
          { type: 'Input.Integer', x: 460, y: 230, controls: { val: 3 } },
          { type: 'Input.Integer', x: 460, y: 300, controls: { val: 3 } },
          { type: 'Pattern.FacadePanels', x: 700, y: 150 },
          { type: 'Pattern.PanelFrames', x: 940, y: 150 },
          { type: 'Point.Origin', x: 700, y: 380 },
          { type: 'Box.ByCenterWidthDepthHeight', x: 940, y: 380, controls: { width: 0.8, depth: 0.8, height: 0.05 } },
          { type: 'Plane.XY', x: 940, y: 520 },
          { type: 'Geometry.Orient', x: 1180, y: 250 },
          { type: 'Output.Watch', x: 1420, y: 250 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'boundary'],
          [5, 'surface', 8, 'mesh'],
          [6, 'value', 8, 'uPanels'],
          [7, 'value', 8, 'vPanels'],
          [8, 'panels', 9, 'panels'],
          [10, 'point', 11, 'center'],
          [11, 'solid', 13, 'geometry'],
          [12, 'plane', 13, 'fromPlane'],
          [9, 'frames', 13, 'toPlane'],
          [13, 'result', 14, 'value']
        ]
      },
      sampleCode: '{{frames}} = Geo.panelFrames({{panels}})'
    }
  },
  {
    type: 'Pattern.PanelPlanarity',
    name: 'Pattern.PanelPlanarity',
    category: 'patterns',
    subGroup: 'Panels',
    icon: '⊿',
    aliases: ['pat-panel-planarity'],
    description: 'Measures how planar each panel is. For every panel mesh it returns the maximum corner deviation from the panel best-fit plane (0 = perfectly flat, larger = more warp) plus the worst value across all panels. Use it to rationalise a facade: flag panels that exceed a glass cold-bend tolerance or color-by-metric.',
    inputs: [
      { id: 'panels', name: 'Panels', type: 'list', description: 'List of panel meshes (quad/polygon meshes)' }
    ],
    outputs: [
      { id: 'planarity', name: 'Planarity', type: 'list', description: 'Max corner-to-plane deviation per panel (0 = planar)' },
      { id: 'maxWarp', name: 'Max Warp', type: 'number', description: 'Largest deviation across all panels' }
    ],
    controls: [],
    execute(context, inputs) {
      const panels = toList(inputs.panels);
      if (panels.length === 0) return { planarity: [], maxWarp: 0 };
      const planarity = Geo.panelPlanarity(panels);
      const maxWarp = planarity.reduce((m, v) => (v > m ? v : m), 0);
      return { planarity, maxWarp };
    },
    codegen: {
      python: '{{planarity}} = Geo.panelPlanarity({{panels}})\n{{maxWarp}} = max({{planarity}}) if {{planarity}} else 0',
      csharp: 'var {{planarity}} = Geo.panelPlanarity({{panels}});\nvar {{maxWarp}} = {{planarity}}.Count > 0 ? {{planarity}}.Max() : 0;'
    },
    help: {
      inputs: [
        { name: 'Panels', description: 'List of panel meshes' }
      ],
      outputs: [
        { name: 'Planarity', description: 'Deviation per panel (0 = planar)' },
        { name: 'Max Warp', description: 'Worst deviation across all panels' }
      ],
      // A flat XY patch panelized into quads is perfectly planar, so Max Warp
      // reports 0 — the rationalization baseline. Producer → focal → consumer.
      example: {
        title: 'Planarity of a flat panelized patch — max warp is 0',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 4, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 4, y: 4, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0, y: 4, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Surface.ByPatch', x: 460, y: 90 },
          { type: 'Input.Integer', x: 460, y: 230, controls: { val: 3 } },
          { type: 'Input.Integer', x: 460, y: 300, controls: { val: 3 } },
          { type: 'Pattern.FacadePanels', x: 700, y: 150 },
          { type: 'Pattern.PanelPlanarity', x: 940, y: 150 },
          { type: 'Output.Watch', x: 1180, y: 150 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'boundary'],
          [5, 'surface', 8, 'mesh'],
          [6, 'value', 8, 'uPanels'],
          [7, 'value', 8, 'vPanels'],
          [8, 'panels', 9, 'panels'],
          [9, 'maxWarp', 10, 'value']
        ]
      },
      sampleCode: '{{planarity}} = Geo.panelPlanarity({{panels}})'
    }
  },

  // ─── Panel.ByPoints ──────────────────────────────────────
  {
    type: 'Panel.ByPoints',
    name: 'Panel.ByPoints',
    category: 'patterns',
    subGroup: 'Panels',
    icon: '⬚',
    aliases: ['panel-by-points'],
    description: 'Creates one quad mesh per panel object, with corners snapped to the panel\'s corner points and orientation following the panel frame. Consumes the panel-object list from Pattern.FacadePanels or Pattern.VoronoiMesh.',
    inputs: [
      { id: 'panels', name: 'Panels', type: 'list', description: 'List of panel objects with points + frame (from Pattern.FacadePanels or Pattern.VoronoiMesh)' }
    ],
    outputs: [{ id: 'meshes', name: 'Meshes', type: 'list', description: 'One placed quad mesh per input panel, corners snapped to panel.points' }],
    controls: [],
    execute(context, inputs) {
      const panels = toList(inputs.panels);
      if (panels.length === 0) return { meshes: [] };
      const color = 0xfab387; // NovaPalette3D.extrusion — matches the facade panel family
      const meshes = panels.map((panel) => {
        if (!panel) return null;
        const pts = Array.isArray(panel.points) ? panel.points : [];
        if (pts.length < 3) return null;
        // For quad panels (4 corners): triangulate as two triangles.
        // For polygon panels (>4 corners): fan-triangulate from the first vertex.
        let faces;
        if (pts.length === 4) {
          faces = [[0, 1, 2], [0, 2, 3]];
        } else {
          faces = [];
          for (let k = 1; k < pts.length - 1; k++) {
            faces.push([0, k, k + 1]);
          }
        }
        const mesh = new Geo.Mesh3(pts, faces, color);
        mesh._solidType = 'PanelMesh';
        return mesh;
      }).filter(Boolean);
      return { meshes };
    },
    codegen: {
      python: '{{meshes}} = [Geo.Mesh3(p["points"], [[0,1,2],[0,2,3]], 0xfab387) for p in {{panels}} if p and len(p.get("points", [])) >= 3]',
      csharp: 'var {{meshes}} = {{panels}}.Where(p => p != null && p.points?.Count >= 3).Select(p => new Geo.Mesh3(p.points, new[]{new[]{0,1,2},new[]{0,2,3}}, 0xfab387)).ToList();'
    },
    help: {
      inputs: [
        { name: 'Panels', description: 'Panel object list from Pattern.FacadePanels (or Pattern.VoronoiMesh)' }
      ],
      outputs: [{ name: 'Meshes', description: 'One quad mesh per panel, corners snapped to panel points' }],
      example: {
        title: '4×4 panels on a curved surface — 16 placed quad meshes',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 10, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 10, y: 10, z: 5 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0, y: 10, z: 2 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Surface.ByPatch', x: 460, y: 90 },
          { type: 'Input.Integer', x: 460, y: 230, controls: { val: 4 } },
          { type: 'Input.Integer', x: 460, y: 300, controls: { val: 4 } },
          { type: 'Pattern.FacadePanels', x: 700, y: 170 },
          { type: 'Panel.ByPoints', x: 940, y: 170 },
          { type: 'Output.Watch', x: 1180, y: 170 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'boundary'],
          [5, 'surface', 8, 'mesh'],
          [6, 'value', 8, 'uPanels'],
          [7, 'value', 8, 'vPanels'],
          [8, 'panels', 9, 'panels'],
          [9, 'meshes', 10, 'value']
        ]
      },
      sampleCode: '{{meshes}} = [Geo.Mesh3(p["points"], [[0,1,2],[0,2,3]]) for p in {{panels}}]'
    }
  },

  // ─── Voronoi ─────────────────────────────────────────────
  {
    type: 'Pattern.VoronoiMesh',
    name: 'Pattern.VoronoiMesh',
    category: 'patterns',
    subGroup: 'Voronoi',
    icon: '⬢',
    aliases: ['pat-voronoi-mesh'],
    description: 'Computes a 2-D Voronoi tessellation of the input sites and extrudes each cell vertically by Height, with a Gap inset around each cell for visual separation. Returns one mesh per cell.',
    inputs: [
      { id: 'sites', name: 'Sites', type: 'list', description: 'Point sites for the Voronoi diagram' },
      { id: 'height', name: 'Height', type: 'number', description: 'Extrusion height for each cell' },
      { id: 'gap', name: 'Gap', type: 'number', description: 'Inset gap factor (0..1)' }
    ],
    outputs: [{ id: 'meshes', name: 'Meshes', type: 'list', description: 'Extruded Voronoi cell meshes' }],
    controls: [
      { id: 'height', type: 'formula', default: '1', label: 'Height' },
      { id: 'gap', type: 'formula', default: '0.1', label: 'Gap' }
    ],
    execute(context, inputs) {
      const sites = toList(inputs.sites);
      if (sites.length === 0) return { meshes: [] };
      // Return panel cell objects { points, frame } instead of raw extruded meshes.
      // voronoiCellObjects re-uses the existing voronoiOutlines kernel and wraps
      // each cell boundary as a panel object matching the TICK-004 contract.
      // height/gap are preserved for backward compatibility but not applied to
      // the flat cell objects (they affect the extruded mesh, not the boundary).
      return {
        meshes: Geo.voronoiCellObjects(sites, null, 0.5)
      };
    },
    codegen: {
      python: '{{meshes}} = Geo.voronoiCellObjects({{sites}}, None, 0.5)',
      csharp: 'var {{meshes}} = Geo.voronoiCellObjects({{sites}}, null, 0.5);'
    },
    help: {
      inputs: [
        { name: 'Sites', description: 'Point sites' },
        { name: 'Height', description: 'Cell extrusion height' },
        { name: 'Gap', description: 'Inset gap factor' }
      ],
      outputs: [{ name: 'Meshes', description: 'Cell meshes' }],
      example: {
        title: 'Voronoi mesh from 4 sites in a unit square',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0.2, y: 0.2, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 0.8, y: 0.2, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 0.5, y: 0.8, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0.2, y: 0.7, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Input.Number', x: 240, y: 230, controls: { val: 1 } },
          { type: 'Input.Number', x: 240, y: 300, controls: { val: 0.1 } },
          { type: 'Pattern.VoronoiMesh', x: 480, y: 170 },
          { type: 'List.Count', x: 720, y: 170 },
          { type: 'Output.Watch', x: 920, y: 170 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 7, 'sites'],
          [5, 'value', 7, 'height'],
          [6, 'value', 7, 'gap'],
          [7, 'meshes', 8, 'list'],
          [8, 'count', 9, 'value']
        ]
      },
      sampleCode: '{{meshes}} = Geo.voronoiMesh({{sites}}, None, {{height}}, {{gap}})'
    }
  },
  {
    type: 'Pattern.VoronoiOutlines',
    name: 'Pattern.VoronoiOutlines',
    category: 'patterns',
    subGroup: 'Voronoi',
    icon: '⬡',
    aliases: ['pat-voronoi-outlines'],
    description: 'Computes a 2-D Voronoi tessellation of the input sites and returns each cell as a closed polyline outline. Useful for cladding patterns, road networks and 2-D paneling.',
    inputs: [
      { id: 'sites', name: 'Sites', type: 'list', description: 'Point sites for the Voronoi diagram' }
    ],
    outputs: [{ id: 'outlines', name: 'Outlines', type: 'list', description: 'Cell outline polylines' }],
    controls: [],
    execute(context, inputs) {
      const sites = toList(inputs.sites);
      if (sites.length === 0) return { outlines: [] };
      return { outlines: Geo.voronoiOutlines(sites, null, 0.5) };
    },
    codegen: {
      python: '{{outlines}} = Geo.voronoiOutlines({{sites}}, None, 0.5)',
      csharp: 'var {{outlines}} = Geo.voronoiOutlines({{sites}}, null, 0.5);'
    },
    help: {
      inputs: [{ name: 'Sites', description: 'Point sites' }],
      outputs: [{ name: 'Outlines', description: 'Cell polylines' }],
      example: {
        title: 'Voronoi outlines from 4 sites',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0.2, y: 0.2, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 0.8, y: 0.2, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 0.5, y: 0.8, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0.2, y: 0.7, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Pattern.VoronoiOutlines', x: 480, y: 90 },
          { type: 'List.Count', x: 720, y: 90 },
          { type: 'Output.Watch', x: 920, y: 90 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'sites'],
          [5, 'outlines', 6, 'list'],
          [6, 'count', 7, 'value']
        ]
      },
      sampleCode: '{{outlines}} = Geo.voronoiOutlines({{sites}}, None, 0.5)'
    }
  },

  // ─── Architectural composites (Phase 8) ───────────────────
  // These nodes absorb the for-loop patterns the AI used to dump into a
  // Custom.Python block. A single Geo.* call replaces a 15-line manual
  // construction, so plan-mode can express the request without falling
  // back to opaque Python.

  {
    type: 'Pattern.TwistedEllipsePlates',
    name: 'Pattern.TwistedEllipsePlates',
    category: 'patterns',
    subGroup: 'Composite',
    icon: '🌀',
    description: 'Stacked elliptical floor profiles with per-floor twist and linear taper. Output is a list of point rings ready to feed Solid.ByLoft for a continuous twisted-tower mesh. Encapsulates what would otherwise be a manual nested for-loop.',
    inputs: [
      { id: 'floors', name: 'Floors', type: 'number', description: 'Number of floor plates (>=1)' },
      { id: 'height', name: 'Height', type: 'number', description: 'Total vertical height' },
      { id: 'baseWidth', name: 'Base Width', type: 'number', description: 'Width of the base ellipse' },
      { id: 'baseDepth', name: 'Base Depth', type: 'number', description: 'Depth of the base ellipse' },
      { id: 'twistDeg', name: 'Twist (deg)', type: 'number', description: 'Total twist from base to top in degrees' },
      { id: 'taper', name: 'Taper', type: 'number', description: 'Taper amount 0..1 (0 = no taper, 1 = converges at top)' },
      { id: 'resolution', name: 'Resolution', type: 'number', description: 'Points per profile ring' }
    ],
    outputs: [{ id: 'profiles', name: 'Profiles', type: 'list', description: 'List of profile rings (point[][])' }],
    controls: [
      { id: 'floors', type: 'formula', default: '20', label: 'Floors' },
      { id: 'height', type: 'formula', default: '100', label: 'Height' },
      { id: 'baseWidth', type: 'formula', default: '18', label: 'Base Width' },
      { id: 'baseDepth', type: 'formula', default: '12', label: 'Base Depth' },
      { id: 'twistDeg', type: 'formula', default: '60', label: 'Twist (deg)' },
      { id: 'taper', type: 'formula', default: '0.2', label: 'Taper' },
      { id: 'resolution', type: 'formula', default: '48', label: 'Resolution' }
    ],
    execute(context, inputs) {
      return {
        profiles: Geo.twistedEllipsePlates(
          toInteger(inputs.floors, 20),
          toNumber(inputs.height, 100),
          toNumber(inputs.baseWidth, 18),
          toNumber(inputs.baseDepth, 12),
          toNumber(inputs.twistDeg, 60),
          toNumber(inputs.taper, 0.2),
          toInteger(inputs.resolution, 48)
        )
      };
    },
    codegen: {
      python: '{{profiles}} = Geo.twistedEllipsePlates(int({{floors}}), {{height}}, {{baseWidth}}, {{baseDepth}}, {{twistDeg}}, {{taper}}, int({{resolution}}))',
      csharp: 'var {{profiles}} = Geo.twistedEllipsePlates((int){{floors}}, {{height}}, {{baseWidth}}, {{baseDepth}}, {{twistDeg}}, {{taper}}, (int){{resolution}});'
    },
    help: {
      inputs: [
        { name: 'Floors', description: 'Number of floor plates' },
        { name: 'Height', description: 'Total tower height' },
        { name: 'Twist (deg)', description: 'Per-floor twist amount in degrees' }
      ],
      outputs: [{ name: 'Profiles', description: 'List of point rings' }],
      example: {
        title: '20-floor twisted tower — produces a smooth twisted-prism mesh',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 20 } },
          { type: 'Input.Number', x: 0, y: 60, controls: { val: 100 } },
          { type: 'Input.Number', x: 0, y: 120, controls: { val: 18 } },
          { type: 'Input.Number', x: 0, y: 180, controls: { val: 12 } },
          { type: 'Input.Number', x: 0, y: 240, controls: { val: 60 } },
          { type: 'Pattern.TwistedEllipsePlates', x: 260, y: 100 },
          { type: 'Solid.ByLoft', x: 540, y: 100 },
          { type: 'Output.Watch', x: 760, y: 100 }
        ],
        wires: [
          [0, 'value', 5, 'floors'],
          [1, 'value', 5, 'height'],
          [2, 'value', 5, 'baseWidth'],
          [3, 'value', 5, 'baseDepth'],
          [4, 'value', 5, 'twistDeg'],
          [5, 'profiles', 6, 'profiles'],
          [6, 'solid', 7, 'value']
        ]
      },
      sampleCode: '{{profiles}} = Geo.twistedEllipsePlates({{floors}}, {{height}}, {{baseWidth}}, {{baseDepth}}, {{twistDeg}}, 0.2, 48)'
    }
  },

  {
    type: 'Pattern.OrganicProfileStack',
    name: 'Pattern.OrganicProfileStack',
    category: 'patterns',
    subGroup: 'Composite',
    icon: '🏺',
    description: 'Sin-modulated stack of circular profiles — produces a pavilion or vase silhouette. Pinch controls how aggressively the middle pulls in (0 = cylinder, 1 = bottleneck). Output feeds Solid.ByLoft to make a smooth organic form.',
    inputs: [
      { id: 'count', name: 'Count', type: 'number', description: 'Number of profile rings' },
      { id: 'baseRadius', name: 'Base Radius', type: 'number', description: 'Radius of the widest part' },
      { id: 'height', name: 'Height', type: 'number', description: 'Total height' },
      { id: 'resolution', name: 'Resolution', type: 'number', description: 'Points per profile ring' },
      { id: 'pinch', name: 'Pinch', type: 'number', description: 'Middle-pinch amount 0..1' }
    ],
    outputs: [{ id: 'profiles', name: 'Profiles', type: 'list', description: 'List of profile rings (point[][])' }],
    controls: [
      { id: 'count', type: 'formula', default: '12', label: 'Count' },
      { id: 'baseRadius', type: 'formula', default: '10', label: 'Base Radius' },
      { id: 'height', type: 'formula', default: '8', label: 'Height' },
      { id: 'resolution', type: 'formula', default: '48', label: 'Resolution' },
      { id: 'pinch', type: 'formula', default: '0.7', label: 'Pinch' }
    ],
    execute(context, inputs) {
      return {
        profiles: Geo.organicProfileStack(
          toInteger(inputs.count, 12),
          toNumber(inputs.baseRadius, 10),
          toNumber(inputs.height, 8),
          toInteger(inputs.resolution, 48),
          toNumber(inputs.pinch, 0.7)
        )
      };
    },
    codegen: {
      python: '{{profiles}} = Geo.organicProfileStack(int({{count}}), {{baseRadius}}, {{height}}, int({{resolution}}), {{pinch}})',
      csharp: 'var {{profiles}} = Geo.organicProfileStack((int){{count}}, {{baseRadius}}, {{height}}, (int){{resolution}}, {{pinch}});'
    },
    help: {
      inputs: [
        { name: 'Count', description: 'Number of profile rings' },
        { name: 'Pinch', description: 'Middle pinch amount' }
      ],
      outputs: [{ name: 'Profiles', description: 'List of point rings' }],
      example: {
        title: 'Pavilion with 12 profile rings — vase silhouette',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 12 } },
          { type: 'Input.Number', x: 0, y: 60, controls: { val: 10 } },
          { type: 'Pattern.OrganicProfileStack', x: 260, y: 30 },
          { type: 'Solid.ByLoft', x: 540, y: 30 },
          { type: 'Output.Watch', x: 760, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'count'],
          [1, 'value', 2, 'baseRadius'],
          [2, 'profiles', 3, 'profiles'],
          [3, 'solid', 4, 'value']
        ]
      },
      sampleCode: '{{profiles}} = Geo.organicProfileStack({{count}}, {{baseRadius}}, 8, 48, 0.7)'
    }
  },

  {
    type: 'Pattern.HelicalCurve',
    name: 'Pattern.HelicalCurve',
    category: 'patterns',
    subGroup: 'Composite',
    icon: '🌀',
    description: 'Helical polyline with `turns` revolutions over `height`, sampled at `segments` points. Useful as a sweep path for staircases, structural spines, or decorative spirals. Output is a polyline curve.',
    inputs: [
      { id: 'turns', name: 'Turns', type: 'number', description: 'Number of revolutions (can be fractional)' },
      { id: 'height', name: 'Height', type: 'number', description: 'Total vertical rise' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Helix radius' },
      { id: 'segments', name: 'Segments', type: 'number', description: 'Number of polyline segments' }
    ],
    outputs: [{ id: 'curve', name: 'Curve', type: 'list', description: 'Helical polyline as a list of points' }],
    controls: [
      { id: 'turns', type: 'formula', default: '3', label: 'Turns' },
      { id: 'height', type: 'formula', default: '20', label: 'Height' },
      { id: 'radius', type: 'formula', default: '5', label: 'Radius' },
      { id: 'segments', type: 'formula', default: '60', label: 'Segments' }
    ],
    execute(context, inputs) {
      return {
        curve: Geo.helicalCurve(
          toNumber(inputs.turns, 3),
          toNumber(inputs.height, 20),
          toNumber(inputs.radius, 5),
          toInteger(inputs.segments, 60)
        )
      };
    },
    codegen: {
      python: '{{curve}} = Geo.helicalCurve({{turns}}, {{height}}, {{radius}}, int({{segments}}))',
      csharp: 'var {{curve}} = Geo.helicalCurve({{turns}}, {{height}}, {{radius}}, (int){{segments}});'
    },
    help: {
      inputs: [{ name: 'Turns', description: 'Revolutions' }],
      outputs: [{ name: 'Curve', description: 'Helical polyline' }],
      example: {
        title: '3-turn helix counted to show point density',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 60, controls: { val: 20 } },
          { type: 'Pattern.HelicalCurve', x: 260, y: 30 },
          { type: 'List.Count', x: 540, y: 30 },
          { type: 'Output.Watch', x: 760, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'turns'],
          [1, 'value', 2, 'height'],
          [2, 'curve', 3, 'list'],
          [3, 'count', 4, 'value']
        ]
      },
      sampleCode: '{{curve}} = Geo.helicalCurve({{turns}}, {{height}}, 5, 60)'
    }
  },

  {
    type: 'Pattern.DiagridFacade',
    name: 'Pattern.DiagridFacade',
    category: 'patterns',
    subGroup: 'Composite',
    icon: '◇',
    description: 'Diagrid line pattern for a facade or structural skin. Returns a list of diagonal polylines that span the given width/height rectangle. Drop the lines into Curve.Bezier or Solid.ByPipe for a structural rendering.',
    inputs: [
      { id: 'width', name: 'Width', type: 'number', description: 'Facade width' },
      { id: 'height', name: 'Height', type: 'number', description: 'Facade height' },
      { id: 'cellsX', name: 'Cells X', type: 'number', description: 'Diagonal cells across the width' },
      { id: 'cellsY', name: 'Cells Y', type: 'number', description: 'Diagonal cells across the height' }
    ],
    outputs: [{ id: 'lines', name: 'Lines', type: 'list', description: 'List of polyline curves forming the diagrid' }],
    controls: [
      { id: 'width', type: 'formula', default: '40', label: 'Width' },
      { id: 'height', type: 'formula', default: '30', label: 'Height' },
      { id: 'cellsX', type: 'formula', default: '10', label: 'Cells X' },
      { id: 'cellsY', type: 'formula', default: '12', label: 'Cells Y' }
    ],
    execute(context, inputs) {
      return {
        lines: Geo.diagridPattern(
          toNumber(inputs.width, 40),
          toNumber(inputs.height, 30),
          toInteger(inputs.cellsX, 10),
          toInteger(inputs.cellsY, 12)
        )
      };
    },
    codegen: {
      python: '{{lines}} = Geo.diagridPattern({{width}}, {{height}}, int({{cellsX}}), int({{cellsY}}))',
      csharp: 'var {{lines}} = Geo.diagridPattern({{width}}, {{height}}, (int){{cellsX}}, (int){{cellsY}});'
    },
    help: {
      inputs: [
        { name: 'Width', description: 'Facade width' },
        { name: 'Cells X', description: 'Diagonal cell count' }
      ],
      outputs: [{ name: 'Lines', description: 'Diagonal polylines' }],
      example: {
        title: '40×30 diagrid pattern — line count via List.Count',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 40 } },
          { type: 'Input.Number', x: 0, y: 60, controls: { val: 30 } },
          { type: 'Pattern.DiagridFacade', x: 260, y: 30 },
          { type: 'List.Count', x: 540, y: 30 },
          { type: 'Output.Watch', x: 760, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'width'],
          [1, 'value', 2, 'height'],
          [2, 'lines', 3, 'list'],
          [3, 'count', 4, 'value']
        ]
      },
      sampleCode: '{{lines}} = Geo.diagridPattern({{width}}, {{height}}, 10, 12)'
    }
  },

  {
    type: 'Pattern.HexPanelGrid',
    name: 'Pattern.HexPanelGrid',
    category: 'patterns',
    subGroup: 'Composite',
    icon: '⬡',
    description: 'Wraps a stack of profile rings (e.g. from Pattern.TwistedEllipsePlates) with diamond / hexagonal panel polylines that twist with the underlying tower. Use stagger=true for a brick-laid honeycomb look. Output is a list of closed polylines, one per panel cell.',
    inputs: [
      { id: 'profiles', name: 'Profiles', type: 'list', description: 'Stack of profile rings — each ring is a list of Point3' },
      { id: 'stagger', name: 'Stagger', type: 'boolean', description: 'Offset every other row by half a cell for a honeycomb look' },
      { id: 'skipRings', name: 'Skip Rings', type: 'number', description: 'Panel height in rings (1 = one panel per profile gap, 2 = every other ring)' }
    ],
    outputs: [{ id: 'panels', name: 'Panels', type: 'list', description: 'List of closed polylines (one per panel cell)' }],
    controls: [
      { id: 'stagger', type: 'checkbox', default: true, label: 'Stagger' },
      { id: 'skipRings', type: 'formula', default: '1', label: 'Skip Rings' }
    ],
    execute(context, inputs) {
      return {
        panels: Geo.hexPanelGrid(
          toList(inputs.profiles),
          inputs.stagger !== false,
          toInteger(inputs.skipRings, 1)
        )
      };
    },
    codegen: {
      python: '{{panels}} = Geo.hexPanelGrid({{profiles}}, {{stagger}}, int({{skipRings}}))',
      csharp: 'var {{panels}} = Geo.hexPanelGrid({{profiles}}, {{stagger}}, (int){{skipRings}});'
    },
    help: {
      inputs: [
        { name: 'Profiles', description: 'Stack of profile rings' },
        { name: 'Stagger', description: 'Half-cell offset per row' },
        { name: 'Skip Rings', description: 'Panel height in rings' }
      ],
      outputs: [{ name: 'Panels', description: 'Closed polylines' }],
      example: {
        title: 'Twisted tower with hex panel skin',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 20 } },
          { type: 'Input.Number', x: 0, y: 60, controls: { val: 100 } },
          { type: 'Input.Number', x: 0, y: 120, controls: { val: 18 } },
          { type: 'Input.Number', x: 0, y: 180, controls: { val: 12 } },
          { type: 'Input.Number', x: 0, y: 240, controls: { val: 60 } },
          { type: 'Pattern.TwistedEllipsePlates', x: 260, y: 100 },
          { type: 'Pattern.HexPanelGrid', x: 540, y: 100 },
          { type: 'List.Count', x: 760, y: 100 },
          { type: 'Output.Watch', x: 980, y: 100 }
        ],
        wires: [
          [0, 'value', 5, 'floors'],
          [1, 'value', 5, 'height'],
          [2, 'value', 5, 'baseWidth'],
          [3, 'value', 5, 'baseDepth'],
          [4, 'value', 5, 'twistDeg'],
          [5, 'profiles', 6, 'profiles'],
          [6, 'panels', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{panels}} = Geo.hexPanelGrid({{profiles}}, True, 1)'
    }
  }
];
