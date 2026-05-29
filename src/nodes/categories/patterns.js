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
    description: 'Divides a surface mesh into a U×V grid of rectangular facade panels. Returns the panels as a list of mesh quads, useful for cladding studies, paneling counts and rationalisation.',
    inputs: [
      { id: 'mesh', name: 'Surface', type: 'mesh', description: 'Surface mesh to panelize' },
      { id: 'uPanels', name: 'U Panels', type: 'number', description: 'Number of panels along U' },
      { id: 'vPanels', name: 'V Panels', type: 'number', description: 'Number of panels along V' }
    ],
    outputs: [{ id: 'panels', name: 'Panels', type: 'list', description: 'Panel mesh list' }],
    controls: [
      { id: 'uPanels', type: 'formula', default: '4', label: 'U Panels' },
      { id: 'vPanels', type: 'formula', default: '4', label: 'V Panels' }
    ],
    execute(context, inputs) {
      if (inputs.mesh == null) return { panels: [] };
      return {
        panels: Geo.facadePanels(
          inputs.mesh,
          toInteger(inputs.uPanels, 4),
          toInteger(inputs.vPanels, 4)
        )
      };
    },
    codegen: {
      python: '{{panels}} = Geo.facadePanels({{mesh}}, int({{uPanels}}), int({{vPanels}}))',
      csharp: 'var {{panels}} = Geo.facadePanels({{mesh}}, (int){{uPanels}}, (int){{vPanels}});'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface mesh' },
        { name: 'U Panels', description: 'U panel count' },
        { name: 'V Panels', description: 'V panel count' }
      ],
      outputs: [{ name: 'Panels', description: 'Panel mesh list' }],
      example: {
        title: '2×2 panels on a unit-square patch — 4 panels',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 1, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0, y: 1, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Surface.ByPatch', x: 460, y: 90 },
          { type: 'Input.Integer', x: 460, y: 230, controls: { val: 2 } },
          { type: 'Input.Integer', x: 460, y: 300, controls: { val: 2 } },
          { type: 'Pattern.FacadePanels', x: 700, y: 170 },
          { type: 'List.Count', x: 940, y: 170 },
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
          [8, 'panels', 9, 'list'],
          [9, 'count', 10, 'value']
        ]
      },
      sampleCode: '{{panels}} = Geo.facadePanels({{mesh}}, {{uPanels}}, {{vPanels}})'
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
      return {
        meshes: Geo.voronoiMesh(
          sites,
          null,
          toNumber(inputs.height, 1),
          toNumber(inputs.gap, 0.1)
        )
      };
    },
    codegen: {
      python: '{{meshes}} = Geo.voronoiMesh({{sites}}, None, {{height}}, {{gap}})',
      csharp: 'var {{meshes}} = Geo.voronoiMesh({{sites}}, null, {{height}}, {{gap}});'
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
  }
];
