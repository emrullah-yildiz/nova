import { Geo } from '../../geometry/index.js';

export const solidsCategory = {
  id: 'solids',
  name: 'Solids',
  color: '#f38ba8',
  icon: '◆'
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
function toVector(value, fallback = new Geo.Vector3(0, 0, 1)) {
  if (value instanceof Geo.Vector3) return value;
  if (value && typeof value === 'object' && value.x !== undefined) {
    return new Geo.Vector3(value.x || 0, value.y || 0, value.z || 0);
  }
  return fallback;
}
function toList(value) {
  return Array.isArray(value) ? value : [];
}

export const solidsNodes = [
  // ─── Box ─────────────────────────────────────────────────
  {
    type: 'Box.ByCenterWidthDepthHeight',
    name: 'Box.ByCenterWidthDepthHeight',
    category: 'solids',
    subGroup: 'Box',
    icon: '▣',
    aliases: ['solid-box'],
    description: 'Creates an axis-aligned box (cuboid) centred at the given point, with the given dimensions along X (Width), Y (Depth) and Z (Height). Returns a closed mesh suitable for boolean operations.',
    inputs: [
      { id: 'center', name: 'Center', type: 'point', description: 'Centre point of the box' },
      { id: 'width', name: 'Width', type: 'number', description: 'Span along X' },
      { id: 'depth', name: 'Depth', type: 'number', description: 'Span along Y' },
      { id: 'height', name: 'Height', type: 'number', description: 'Span along Z' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting box mesh' }],
    controls: [
      { id: 'width', type: 'formula', default: '1', label: 'Width' },
      { id: 'depth', type: 'formula', default: '1', label: 'Depth' },
      { id: 'height', type: 'formula', default: '1', label: 'Height' }
    ],
    execute(context, inputs) {
      return {
        solid: Geo.createBox(
          toPoint(inputs.center),
          toNumber(inputs.width, 1),
          toNumber(inputs.depth, 1),
          toNumber(inputs.height, 1)
        )
      };
    },
    codegen: {
      python: '{{solid}} = Geo.createBox({{center}}, {{width}}, {{depth}}, {{height}})',
      csharp: 'var {{solid}} = Geo.createBox({{center}}, {{width}}, {{depth}}, {{height}});'
    },
    help: {
      inputs: [
        { name: 'Center', description: 'Centre point' },
        { name: 'Width', description: 'Span along X' },
        { name: 'Depth', description: 'Span along Y' },
        { name: 'Height', description: 'Span along Z' }
      ],
      outputs: [{ name: 'Solid', description: 'Box mesh' }],
      example: {
        title: '1×1×1 unit cube at the origin',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 1 } },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 90 },
          { type: 'Output.Watch', x: 480, y: 90 }
        ],
        wires: [
          [0, 'point', 4, 'center'],
          [1, 'value', 4, 'width'],
          [2, 'value', 4, 'depth'],
          [3, 'value', 4, 'height'],
          [4, 'solid', 5, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.createBox({{center}}, {{width}}, {{depth}}, {{height}})'
    }
  },

  // ─── Cone ────────────────────────────────────────────────
  {
    type: 'Cone.ByBaseRadiusHeight',
    name: 'Cone.ByBaseRadiusHeight',
    category: 'solids',
    subGroup: 'Cone',
    icon: '▲',
    aliases: ['solid-cone'],
    description: 'Creates an upright cone with its circular base centred at the given point and its apex above the base by Height. The base radius is given directly; the cone is closed and suitable for boolean operations.',
    inputs: [
      { id: 'base', name: 'Base', type: 'point', description: 'Centre of the circular base' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Base circle radius' },
      { id: 'height', name: 'Height', type: 'number', description: 'Apex height above the base' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting cone mesh' }],
    controls: [
      { id: 'radius', type: 'formula', default: '1', label: 'Radius' },
      { id: 'height', type: 'formula', default: '2', label: 'Height' }
    ],
    execute(context, inputs) {
      return {
        solid: Geo.createCone(
          toPoint(inputs.base),
          toNumber(inputs.radius, 1),
          toNumber(inputs.height, 2)
        )
      };
    },
    codegen: {
      python: '{{solid}} = Geo.createCone({{base}}, {{radius}}, {{height}})',
      csharp: 'var {{solid}} = Geo.createCone({{base}}, {{radius}}, {{height}});'
    },
    help: {
      inputs: [
        { name: 'Base', description: 'Base centre' },
        { name: 'Radius', description: 'Base radius' },
        { name: 'Height', description: 'Apex height' }
      ],
      outputs: [{ name: 'Solid', description: 'Cone mesh' }],
      example: {
        title: 'Unit cone radius 1, height 2',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 2 } },
          { type: 'Cone.ByBaseRadiusHeight', x: 240, y: 70 },
          { type: 'Output.Watch', x: 480, y: 70 }
        ],
        wires: [
          [0, 'point', 3, 'base'],
          [1, 'value', 3, 'radius'],
          [2, 'value', 3, 'height'],
          [3, 'solid', 4, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.createCone({{base}}, {{radius}}, {{height}})'
    }
  },

  // ─── Cylinder ────────────────────────────────────────────
  {
    type: 'Cylinder.ByBaseRadiusHeight',
    name: 'Cylinder.ByBaseRadiusHeight',
    category: 'solids',
    subGroup: 'Cylinder',
    icon: '⊡',
    aliases: ['solid-cylinder'],
    description: 'Creates an upright circular cylinder whose bottom face is centred at the given base point. The top face is offset by Height along +Z; useful for columns, posts, pipes and stems.',
    inputs: [
      { id: 'base', name: 'Base', type: 'point', description: 'Centre of the bottom face' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Cylinder radius' },
      { id: 'height', name: 'Height', type: 'number', description: 'Height between bottom and top faces' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting cylinder mesh' }],
    controls: [
      { id: 'radius', type: 'formula', default: '1', label: 'Radius' },
      { id: 'height', type: 'formula', default: '2', label: 'Height' }
    ],
    execute(context, inputs) {
      return {
        solid: Geo.createCylinder(
          toPoint(inputs.base),
          toNumber(inputs.radius, 1),
          toNumber(inputs.height, 2)
        )
      };
    },
    codegen: {
      python: '{{solid}} = Geo.createCylinder({{base}}, {{radius}}, {{height}})',
      csharp: 'var {{solid}} = Geo.createCylinder({{base}}, {{radius}}, {{height}});'
    },
    help: {
      inputs: [
        { name: 'Base', description: 'Bottom-face centre' },
        { name: 'Radius', description: 'Cylinder radius' },
        { name: 'Height', description: 'Cylinder height' }
      ],
      outputs: [{ name: 'Solid', description: 'Cylinder mesh' }],
      example: {
        title: 'Unit cylinder radius 1, height 2',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 2 } },
          { type: 'Cylinder.ByBaseRadiusHeight', x: 240, y: 70 },
          { type: 'Output.Watch', x: 480, y: 70 }
        ],
        wires: [
          [0, 'point', 3, 'base'],
          [1, 'value', 3, 'radius'],
          [2, 'value', 3, 'height'],
          [3, 'solid', 4, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.createCylinder({{base}}, {{radius}}, {{height}})'
    }
  },

  // ─── Sphere ──────────────────────────────────────────────
  {
    type: 'Sphere.ByCenterRadius',
    name: 'Sphere.ByCenterRadius',
    category: 'solids',
    subGroup: 'Sphere',
    icon: '●',
    aliases: ['solid-sphere'],
    description: 'Creates a UV-tessellated sphere centred at the given point with the given radius. Returns a closed mesh suitable for visualisation, intersection, and boolean operations.',
    inputs: [
      { id: 'center', name: 'Center', type: 'point', description: 'Centre point of the sphere' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Sphere radius' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting sphere mesh' }],
    controls: [
      { id: 'radius', type: 'formula', default: '1', label: 'Radius' }
    ],
    execute(context, inputs) {
      return {
        solid: Geo.createSphere(toPoint(inputs.center), toNumber(inputs.radius, 1))
      };
    },
    codegen: {
      python: '{{solid}} = Geo.createSphere({{center}}, {{radius}})',
      csharp: 'var {{solid}} = Geo.createSphere({{center}}, {{radius}});'
    },
    help: {
      inputs: [
        { name: 'Center', description: 'Sphere centre' },
        { name: 'Radius', description: 'Sphere radius' }
      ],
      outputs: [{ name: 'Solid', description: 'Sphere mesh' }],
      example: {
        title: 'Unit sphere at the origin',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Sphere.ByCenterRadius', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'center'],
          [1, 'value', 2, 'radius'],
          [2, 'solid', 3, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.createSphere({{center}}, {{radius}})'
    }
  },

  // ─── Torus ───────────────────────────────────────────────
  {
    type: 'Torus.ByCenterRadii',
    name: 'Torus.ByCenterRadii',
    category: 'solids',
    subGroup: 'Torus',
    icon: '◎',
    aliases: ['solid-torus'],
    description: 'Creates a torus (donut) centred at the given point. Major radius is the distance from the centre to the tube centre-line; Minor radius is the tube radius.',
    inputs: [
      { id: 'center', name: 'Center', type: 'point', description: 'Centre of the torus' },
      { id: 'majorR', name: 'Major R', type: 'number', description: 'Centre-to-tube-centre distance' },
      { id: 'minorR', name: 'Minor R', type: 'number', description: 'Tube radius' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting torus mesh' }],
    controls: [
      { id: 'majorR', type: 'formula', default: '2', label: 'Major R' },
      { id: 'minorR', type: 'formula', default: '0.5', label: 'Minor R' }
    ],
    execute(context, inputs) {
      return {
        solid: Geo.createTorus(
          toPoint(inputs.center),
          toNumber(inputs.majorR, 2),
          toNumber(inputs.minorR, 0.5)
        )
      };
    },
    codegen: {
      python: '{{solid}} = Geo.createTorus({{center}}, {{majorR}}, {{minorR}})',
      csharp: 'var {{solid}} = Geo.createTorus({{center}}, {{majorR}}, {{minorR}});'
    },
    help: {
      inputs: [
        { name: 'Center', description: 'Torus centre' },
        { name: 'Major R', description: 'Major radius' },
        { name: 'Minor R', description: 'Minor (tube) radius' }
      ],
      outputs: [{ name: 'Solid', description: 'Torus mesh' }],
      example: {
        title: 'Torus major 2, minor 0.5',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 2 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 0.5 } },
          { type: 'Torus.ByCenterRadii', x: 240, y: 70 },
          { type: 'Output.Watch', x: 480, y: 70 }
        ],
        wires: [
          [0, 'point', 3, 'center'],
          [1, 'value', 3, 'majorR'],
          [2, 'value', 3, 'minorR'],
          [3, 'solid', 4, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.createTorus({{center}}, {{majorR}}, {{minorR}})'
    }
  },

  // ─── Solid (generation methods) ──────────────────────────
  // (Surface.ByCurveExtrude lives in surfaces.js — it produces an open
  // side-wall ribbon, not a closed solid, so it belongs with surfaces.)
  {
    type: 'Solid.ByLoft',
    name: 'Solid.ByLoft',
    category: 'solids',
    subGroup: 'Solid',
    icon: '⊟',
    aliases: ['op-loft'],
    description: 'Lofts a smooth solid through a list of profile curves arranged along a path. The first and last profiles cap the loft; intermediate profiles shape its cross-section.',
    inputs: [
      { id: 'profiles', name: 'Profiles', type: 'list', description: 'Ordered list of profile curves' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting lofted mesh' }],
    controls: [],
    execute(context, inputs) {
      const profiles = toList(inputs.profiles);
      if (profiles.length < 2) return { solid: undefined };
      return { solid: Geo.loft(profiles) };
    },
    codegen: {
      python: '{{solid}} = Geo.loft({{profiles}})',
      csharp: 'var {{solid}} = Geo.loft({{profiles}});'
    },
    help: {
      inputs: [{ name: 'Profiles', description: 'Profile curves' }],
      outputs: [{ name: 'Solid', description: 'Lofted mesh' }],
      example: {
        title: 'Loft between two unit circles offset in Z',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 30 },
          { type: 'Point.ByCoordinates', x: 0, y: 160, controls: { x: 0, y: 0, z: 2 } },
          { type: 'Input.Number', x: 0, y: 240, controls: { val: 1 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 200 },
          { type: 'List.Create', x: 480, y: 110 },
          { type: 'Solid.ByLoft', x: 700, y: 110 },
          { type: 'Output.Watch', x: 920, y: 110 }
        ],
        wires: [
          [0, 'point', 2, 'center'],
          [1, 'value', 2, 'radius'],
          [3, 'point', 5, 'center'],
          [4, 'value', 5, 'radius'],
          [2, 'circle', 6, 'item0'],
          [5, 'circle', 6, 'item1'],
          [6, 'list', 7, 'profiles'],
          [7, 'solid', 8, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.loft({{profiles}})'
    }
  },
  {
    type: 'Solid.ByRevolve',
    name: 'Solid.ByRevolve',
    category: 'solids',
    subGroup: 'Solid',
    icon: '⥁',
    aliases: ['op-revolve'],
    description: 'Revolves a profile curve around an axis defined by a point and direction vector to produce a solid of revolution. Use 360° for a full revolve; smaller angles produce partial sweeps.',
    inputs: [
      { id: 'curve', name: 'Curve', type: 'any', description: 'Profile curve' },
      { id: 'axisOrigin', name: 'Axis Pt', type: 'point', description: 'Point on the revolution axis' },
      { id: 'axisDir', name: 'Axis Dir', type: 'vector', description: 'Direction of the revolution axis' },
      { id: 'angle', name: 'Angle°', type: 'number', description: 'Sweep angle in degrees' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting solid of revolution' }],
    controls: [
      { id: 'angle', type: 'formula', default: '360', label: 'Angle°' }
    ],
    execute(context, inputs) {
      if (inputs.curve == null) return { solid: undefined };
      return {
        solid: Geo.revolve(
          inputs.curve,
          toPoint(inputs.axisOrigin),
          toVector(inputs.axisDir, new Geo.Vector3(0, 0, 1)),
          toNumber(inputs.angle, 360) * Math.PI / 180
        )
      };
    },
    codegen: {
      python: '{{solid}} = Geo.revolve({{curve}}, {{axisOrigin}}, {{axisDir}}, math.radians({{angle}}))',
      csharp: 'var {{solid}} = Geo.revolve({{curve}}, {{axisOrigin}}, {{axisDir}}, {{angle}} * Math.PI / 180);'
    },
    help: {
      inputs: [
        { name: 'Curve', description: 'Profile curve' },
        { name: 'Axis Pt', description: 'Axis origin' },
        { name: 'Axis Dir', description: 'Axis direction' },
        { name: 'Angle°', description: 'Sweep angle' }
      ],
      outputs: [{ name: 'Solid', description: 'Revolved mesh' }],
      example: {
        title: 'Revolve a 3-4-5 line 360° about Z',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 80, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.Origin', x: 0, y: 170 },
          { type: 'Point.ByCoordinates', x: 0, y: 240, controls: { x: 0, y: 0, z: 1 } },
          { type: 'Input.Number', x: 0, y: 310, controls: { val: 360 } },
          { type: 'Solid.ByRevolve', x: 480, y: 180 },
          { type: 'Output.Watch', x: 720, y: 180 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 6, 'curve'],
          [3, 'point', 6, 'axisOrigin'],
          [4, 'point', 6, 'axisDir'],
          [5, 'value', 6, 'angle'],
          [6, 'solid', 7, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.revolve({{curve}}, {{axisOrigin}}, {{axisDir}}, math.radians({{angle}}))'
    }
  },
  {
    type: 'Solid.BySweep',
    name: 'Solid.BySweep',
    category: 'solids',
    subGroup: 'Solid',
    icon: '⤻',
    aliases: ['op-sweep'],
    description: 'Sweeps a 2-D profile along a 3-D path curve to produce a solid. The profile keeps its orientation relative to the path tangent at every sample, producing a generalised tube.',
    inputs: [
      { id: 'profile', name: 'Profile', type: 'any', description: 'Profile curve swept along the path' },
      { id: 'path', name: 'Path', type: 'any', description: 'Path curve' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting swept mesh' }],
    controls: [],
    execute(context, inputs) {
      if (inputs.profile == null || inputs.path == null) return { solid: undefined };
      return { solid: Geo.sweep(inputs.profile, inputs.path) };
    },
    codegen: {
      python: '{{solid}} = Geo.sweep({{profile}}, {{path}})',
      csharp: 'var {{solid}} = Geo.sweep({{profile}}, {{path}});'
    },
    help: {
      inputs: [
        { name: 'Profile', description: 'Cross-section profile' },
        { name: 'Path', description: 'Path curve' }
      ],
      outputs: [{ name: 'Solid', description: 'Swept mesh' }],
      example: {
        title: 'Sweep a unit circle along a 3-4-5 line',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 30 },
          { type: 'Point.Origin', x: 0, y: 170 },
          { type: 'Point.ByCoordinates', x: 0, y: 240, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 200 },
          { type: 'Solid.BySweep', x: 480, y: 110 },
          { type: 'Output.Watch', x: 720, y: 110 }
        ],
        wires: [
          [0, 'point', 2, 'center'],
          [1, 'value', 2, 'radius'],
          [3, 'point', 5, 'startPoint'],
          [4, 'point', 5, 'endPoint'],
          [2, 'circle', 6, 'profile'],
          [5, 'line', 6, 'path'],
          [6, 'solid', 7, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.sweep({{profile}}, {{path}})'
    }
  },
  {
    type: 'Solid.ByPipe',
    name: 'Solid.ByPipe',
    category: 'solids',
    subGroup: 'Solid',
    icon: '◯',
    aliases: ['op-pipe'],
    description: 'Builds a circular pipe of constant radius around a path curve. A specialised, fast case of Solid.BySweep when the profile is a circle of fixed radius.',
    inputs: [
      { id: 'curve', name: 'Curve', type: 'any', description: 'Path the pipe follows' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Pipe radius' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting pipe mesh' }],
    controls: [
      { id: 'radius', type: 'formula', default: '0.5', label: 'Radius' }
    ],
    execute(context, inputs) {
      if (inputs.curve == null) return { solid: undefined };
      return { solid: Geo.pipe(inputs.curve, toNumber(inputs.radius, 0.5)) };
    },
    codegen: {
      python: '{{solid}} = Geo.pipe({{curve}}, {{radius}})',
      csharp: 'var {{solid}} = Geo.pipe({{curve}}, {{radius}});'
    },
    help: {
      inputs: [
        { name: 'Curve', description: 'Path curve' },
        { name: 'Radius', description: 'Pipe radius' }
      ],
      outputs: [{ name: 'Solid', description: 'Pipe mesh' }],
      example: {
        title: 'Pipe radius 0.3 along a 3-4-5 line',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 80, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Input.Number', x: 240, y: 150, controls: { val: 0.3 } },
          { type: 'Solid.ByPipe', x: 460, y: 80 },
          { type: 'Output.Watch', x: 680, y: 80 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 4, 'curve'],
          [3, 'value', 4, 'radius'],
          [4, 'solid', 5, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.pipe({{curve}}, {{radius}})'
    }
  },

  // ─── Boolean ─────────────────────────────────────────────
  {
    type: 'Solid.BooleanUnion',
    name: 'Solid.BooleanUnion',
    category: 'solids',
    subGroup: 'Boolean',
    icon: '∪',
    aliases: ['op-boolean-union'],
    description: 'Boolean OR of two solid meshes — returns a single solid covering every point that lies inside A, B, or both. Useful for merging overlapping volumes into one part.',
    inputs: [
      { id: 'a', name: 'Solid A', type: 'mesh', description: 'First solid' },
      { id: 'b', name: 'Solid B', type: 'mesh', description: 'Second solid' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'A ∪ B' }],
    controls: [],
    execute(context, inputs) {
      if (inputs.a == null || inputs.b == null) return { result: undefined };
      return { result: Geo.booleanUnion(inputs.a, inputs.b) };
    },
    codegen: {
      python: '{{result}} = Geo.booleanUnion({{a}}, {{b}})',
      csharp: 'var {{result}} = Geo.booleanUnion({{a}}, {{b}});'
    },
    help: {
      inputs: [
        { name: 'Solid A', description: 'First solid' },
        { name: 'Solid B', description: 'Second solid' }
      ],
      outputs: [{ name: 'Result', description: 'Union solid' }],
      example: {
        title: 'Union of two overlapping unit cubes',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 120, controls: { x: 0.5, y: 0, z: 0 } },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 120 },
          { type: 'Solid.BooleanUnion', x: 480, y: 60 },
          { type: 'Output.Watch', x: 720, y: 60 }
        ],
        wires: [
          [0, 'point', 1, 'center'],
          [2, 'point', 3, 'center'],
          [1, 'solid', 4, 'a'],
          [3, 'solid', 4, 'b'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.booleanUnion({{a}}, {{b}})'
    }
  },
  {
    type: 'Solid.BooleanIntersect',
    name: 'Solid.BooleanIntersect',
    category: 'solids',
    subGroup: 'Boolean',
    icon: '∩',
    aliases: ['op-boolean-intersect'],
    description: 'Boolean AND of two solid meshes — returns the volume that lies inside both A and B. Useful for finding overlap zones or constraining one shape to fit inside another.',
    inputs: [
      { id: 'a', name: 'Solid A', type: 'mesh', description: 'First solid' },
      { id: 'b', name: 'Solid B', type: 'mesh', description: 'Second solid' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'A ∩ B' }],
    controls: [],
    execute(context, inputs) {
      if (inputs.a == null || inputs.b == null) return { result: undefined };
      return { result: Geo.booleanIntersect(inputs.a, inputs.b) };
    },
    codegen: {
      python: '{{result}} = Geo.booleanIntersect({{a}}, {{b}})',
      csharp: 'var {{result}} = Geo.booleanIntersect({{a}}, {{b}});'
    },
    help: {
      inputs: [
        { name: 'Solid A', description: 'First solid' },
        { name: 'Solid B', description: 'Second solid' }
      ],
      outputs: [{ name: 'Result', description: 'Intersection solid' }],
      example: {
        title: 'Intersection of two overlapping unit cubes',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 120, controls: { x: 0.5, y: 0, z: 0 } },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 120 },
          { type: 'Solid.BooleanIntersect', x: 480, y: 60 },
          { type: 'Output.Watch', x: 720, y: 60 }
        ],
        wires: [
          [0, 'point', 1, 'center'],
          [2, 'point', 3, 'center'],
          [1, 'solid', 4, 'a'],
          [3, 'solid', 4, 'b'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.booleanIntersect({{a}}, {{b}})'
    }
  },
  {
    type: 'Solid.BooleanSubtract',
    name: 'Solid.BooleanSubtract',
    category: 'solids',
    subGroup: 'Boolean',
    icon: '∖',
    aliases: ['op-boolean-subtract'],
    description: 'Boolean A minus B of two solid meshes — returns the volume of A with B carved out. Useful for cutting holes, slots, and pockets into a target solid.',
    inputs: [
      { id: 'a', name: 'Solid A', type: 'mesh', description: 'Minuend solid' },
      { id: 'b', name: 'Solid B', type: 'mesh', description: 'Subtrahend solid (carved out of A)' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'A ∖ B' }],
    controls: [],
    execute(context, inputs) {
      if (inputs.a == null || inputs.b == null) return { result: undefined };
      return { result: Geo.booleanSubtract(inputs.a, inputs.b) };
    },
    codegen: {
      python: '{{result}} = Geo.booleanSubtract({{a}}, {{b}})',
      csharp: 'var {{result}} = Geo.booleanSubtract({{a}}, {{b}});'
    },
    help: {
      inputs: [
        { name: 'Solid A', description: 'Minuend solid' },
        { name: 'Solid B', description: 'Subtrahend solid' }
      ],
      outputs: [{ name: 'Result', description: 'Difference solid' }],
      example: {
        title: 'Cube with a unit sphere carved out',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 0 },
          { type: 'Input.Number', x: 0, y: 120, controls: { val: 0.5 } },
          { type: 'Sphere.ByCenterRadius', x: 240, y: 90 },
          { type: 'Solid.BooleanSubtract', x: 480, y: 60 },
          { type: 'Output.Watch', x: 720, y: 60 }
        ],
        wires: [
          [0, 'point', 1, 'center'],
          [0, 'point', 3, 'center'],
          [2, 'value', 3, 'radius'],
          [1, 'solid', 4, 'a'],
          [3, 'solid', 4, 'b'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.booleanSubtract({{a}}, {{b}})'
    }
  },
  {
    type: 'Solid.CombineAll',
    name: 'Solid.CombineAll',
    category: 'solids',
    subGroup: 'Boolean',
    icon: '⊕',
    aliases: ['op-combine-all'],
    description: 'Concatenates every mesh in the input list into a single mesh. Faster and simpler than chaining many Solid.BooleanUnion operations when overlap correctness is not required.',
    inputs: [
      { id: 'meshes', name: 'Meshes', type: 'list', description: 'List of solid meshes to combine' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'Combined mesh' }],
    controls: [],
    execute(context, inputs) {
      const meshes = toList(inputs.meshes);
      if (meshes.length === 0) return { result: undefined };
      return { result: Geo.combineAll(meshes) };
    },
    codegen: {
      python: '{{result}} = Geo.combineAll({{meshes}})',
      csharp: 'var {{result}} = Geo.combineAll({{meshes}});'
    },
    help: {
      inputs: [{ name: 'Meshes', description: 'List of solid meshes' }],
      outputs: [{ name: 'Result', description: 'Combined mesh' }],
      example: {
        title: 'Combine a box and a sphere into one mesh',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 120, controls: { x: 2, y: 0, z: 0 } },
          { type: 'Input.Number', x: 0, y: 200, controls: { val: 1 } },
          { type: 'Sphere.ByCenterRadius', x: 240, y: 150 },
          { type: 'List.Create', x: 480, y: 60 },
          { type: 'Solid.CombineAll', x: 700, y: 60 },
          { type: 'Output.Watch', x: 940, y: 60 }
        ],
        wires: [
          [0, 'point', 1, 'center'],
          [2, 'point', 4, 'center'],
          [3, 'value', 4, 'radius'],
          [1, 'solid', 5, 'item0'],
          [4, 'solid', 5, 'item1'],
          [5, 'list', 6, 'meshes'],
          [6, 'result', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.combineAll({{meshes}})'
    }
  },

  // ─── Operations ──────────────────────────────────────────
  {
    type: 'Solid.Smooth',
    name: 'Solid.Smooth',
    category: 'solids',
    subGroup: 'Operations',
    icon: '〰',
    aliases: ['op-smooth'],
    description: 'Applies Laplacian smoothing to a solid mesh, pulling each vertex toward the average of its neighbours. Useful for rounding off faceted boolean results and softening hard edges.',
    inputs: [
      { id: 'mesh', name: 'Solid', type: 'mesh', description: 'Solid mesh to smooth' },
      { id: 'iterations', name: 'Iterations', type: 'number', description: 'Smoothing passes (clamped to 20)' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'Smoothed solid mesh' }],
    controls: [
      { id: 'iterations', type: 'formula', default: '3', label: 'Iterations' }
    ],
    execute(context, inputs) {
      if (inputs.mesh == null) return { result: undefined };
      const it = Math.max(0, Math.min(20, toInteger(inputs.iterations, 3)));
      return { result: Geo.smooth(inputs.mesh, it) };
    },
    codegen: {
      python: '{{result}} = Geo.smooth({{mesh}}, int({{iterations}}))',
      csharp: 'var {{result}} = Geo.smooth({{mesh}}, (int){{iterations}});'
    },
    help: {
      inputs: [
        { name: 'Solid', description: 'Solid mesh' },
        { name: 'Iterations', description: 'Smoothing passes' }
      ],
      outputs: [{ name: 'Result', description: 'Smoothed mesh' }],
      example: {
        title: 'Smooth a unit cube with 3 passes',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 1 } },
          { type: 'Box.ByCenterWidthDepthHeight', x: 240, y: 90 },
          { type: 'Input.Integer', x: 240, y: 230, controls: { val: 3 } },
          { type: 'Solid.Smooth', x: 480, y: 140 },
          { type: 'Output.Watch', x: 720, y: 140 }
        ],
        wires: [
          [0, 'point', 4, 'center'],
          [1, 'value', 4, 'width'],
          [2, 'value', 4, 'depth'],
          [3, 'value', 4, 'height'],
          [4, 'solid', 6, 'mesh'],
          [5, 'value', 6, 'iterations'],
          [6, 'result', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.smooth({{mesh}}, {{iterations}})'
    }
  },
  {
    type: 'Solid.BySurfaceThicken',
    name: 'Solid.BySurfaceThicken',
    category: 'solids',
    subGroup: 'Operations',
    icon: '⊡',
    aliases: ['op-thicken'],
    description: 'Inflates a surface mesh into a closed solid by offsetting both sides along the vertex normals by half of the thickness. Use to turn a patch or extruded ribbon into a printable slab.',
    inputs: [
      { id: 'surface', name: 'Surface', type: 'mesh', description: 'Surface mesh to thicken' },
      { id: 'thickness', name: 'Thickness', type: 'number', description: 'Total wall thickness' }
    ],
    outputs: [{ id: 'solid', name: 'Solid', type: 'mesh', description: 'Resulting thickened solid mesh' }],
    controls: [
      { id: 'thickness', type: 'formula', default: '0.1', label: 'Thickness' }
    ],
    execute(context, inputs) {
      if (inputs.surface == null) return { solid: undefined };
      return { solid: Geo.thicken(inputs.surface, toNumber(inputs.thickness, 0.1)) };
    },
    codegen: {
      python: '{{solid}} = Geo.thicken({{surface}}, {{thickness}})',
      csharp: 'var {{solid}} = Geo.thicken({{surface}}, {{thickness}});'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface mesh' },
        { name: 'Thickness', description: 'Wall thickness' }
      ],
      outputs: [{ name: 'Solid', description: 'Thickened solid mesh' }],
      example: {
        title: 'Thicken a unit-square patch by 0.1',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 1, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0, y: 1, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Surface.ByPatch', x: 460, y: 90 },
          { type: 'Input.Number', x: 460, y: 230, controls: { val: 0.1 } },
          { type: 'Solid.BySurfaceThicken', x: 700, y: 140 },
          { type: 'Output.Watch', x: 940, y: 140 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'boundary'],
          [5, 'surface', 7, 'surface'],
          [6, 'value', 7, 'thickness'],
          [7, 'solid', 8, 'value']
        ]
      },
      sampleCode: '{{solid}} = Geo.thicken({{surface}}, {{thickness}})'
    }
  }
];
