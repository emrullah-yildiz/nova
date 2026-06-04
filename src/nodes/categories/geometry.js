import { Geo } from '../../geometry/index.js';
import { orient } from '../../geometry/transforms.js';

export const geometryCategory = {
  id: 'geometry',
  name: 'Geometry',
  color: '#89b4fa',
  icon: '◇'
};

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}
function toPoint(value, fallback = new Geo.Point3(0, 0, 0)) {
  if (value && typeof value === 'object' && value.x !== undefined) return value;
  return fallback;
}
function toVector(value, fallback = new Geo.Vector3(0, 0, 0)) {
  if (value instanceof Geo.Vector3) return value;
  if (value && typeof value === 'object' && value.x !== undefined) {
    return new Geo.Vector3(value.x || 0, value.y || 0, value.z || 0);
  }
  return fallback;
}
function toPlane(value) {
  if (value && value._type === 'Plane') return value;
  if (value && value.origin && value.normal) {
    return new Geo.Plane(toPoint(value.origin), toVector(value.normal, new Geo.Vector3(0, 0, 1)));
  }
  return new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1));
}

export const geometryNodes = [
  // ─── Query ───────────────────────────────────────────────
  {
    type: 'Geometry.Distance',
    name: 'Geometry.Distance',
    category: 'geometry',
    subGroup: 'Query',
    icon: '⟷',
    aliases: ['geometry-distance'],
    description: 'Returns the shortest distance between two geometric objects (points, lines, curves, or meshes). Falls back to Point.distanceTo when the kernel does not provide a specialised solver.',
    inputs: [
      { id: 'a', name: 'Geometry A', type: 'any', description: 'First geometry' },
      { id: 'b', name: 'Geometry B', type: 'any', description: 'Second geometry' }
    ],
    outputs: [{ id: 'distance', name: 'Distance', type: 'number', description: 'Shortest distance between A and B' }],
    controls: [],
    execute(context, inputs) {
      const a = inputs.a;
      const b = inputs.b;
      if (a == null || b == null) return { distance: undefined };
      if (typeof Geo !== 'undefined' && typeof Geo.distanceBetween === 'function') {
        return { distance: Geo.distanceBetween(a, b) };
      }
      if (typeof a.distanceTo === 'function') {
        return { distance: a.distanceTo(b) };
      }
      return { distance: undefined };
    },
    codegen: {
      python: '{{distance}} = Geo.distanceBetween({{a}}, {{b}})',
      csharp: 'double {{distance}} = Geo.distanceBetween({{a}}, {{b}});'
    },
    help: {
      inputs: [
        { name: 'Geometry A', description: 'First geometry' },
        { name: 'Geometry B', description: 'Second geometry' }
      ],
      outputs: [{ name: 'Distance', description: 'Shortest distance' }],
      example: {
        title: 'Distance from (0,0,0) to (3,4,0) = 5',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 80, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Geometry.Distance', x: 280, y: 30 },
          { type: 'Output.Watch', x: 500, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'a'],
          [1, 'point', 2, 'b'],
          [2, 'distance', 3, 'value']
        ]
      },
      sampleCode: '{{distance}} = Geo.distanceBetween({{a}}, {{b}})'
    }
  },

  // ─── Transform ───────────────────────────────────────────
  {
    type: 'Geometry.Move',
    name: 'Geometry.Move',
    category: 'geometry',
    subGroup: 'Transform',
    icon: '↗',
    aliases: ['op-move'],
    description: 'Translates a geometry a given Distance along a Direction. The direction is normalised internally, so Distance is the exact amount moved. Returns a new geometry; the input is left unchanged. Length, orientation, and shape are preserved — only position changes.',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to translate' },
      { id: 'direction', name: 'Direction', type: 'vector', description: 'Axis/direction to move along (normalised internally)' },
      { id: 'distance', name: 'Distance', type: 'number', description: 'Distance to move along the direction' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'any', description: 'Translated geometry' }],
    controls: [{ id: 'distance', type: 'formula', default: '1', label: 'Distance' }],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: undefined };
      const dir = toVector(inputs.direction, new Geo.Vector3(0, 0, 1)).normalize();
      const dist = toNumber(inputs.distance, 0);
      return { result: Geo.move(geo, dir.scale(dist)) };
    },
    codegen: {
      python: '{{result}} = Geo.move({{geometry}}, {{direction}}.normalize().scale({{distance}}))',
      csharp: 'var {{result}} = Geo.move({{geometry}}, {{direction}}.normalize().scale({{distance}}));'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to move' },
        { name: 'Direction', description: 'Axis/direction to move along' },
        { name: 'Distance', description: 'Distance to move' }
      ],
      outputs: [{ name: 'Result', description: 'Moved geometry' }],
      example: {
        title: 'Move a 3-4-5 line 10 along X — length unchanged (5)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Vector.XAxis', x: 240, y: 160 },
          { type: 'Geometry.Move', x: 460, y: 90, controls: { distance: 10 } },
          { type: 'Curve.Length', x: 680, y: 90 },
          { type: 'Output.Watch', x: 880, y: 90 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 4, 'geometry'],
          [3, 'vector', 4, 'direction'],
          [4, 'result', 5, 'curve'],
          [5, 'length', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.move({{geometry}}, {{direction}}.normalize().scale({{distance}}))'
    }
  },
  {
    type: 'Geometry.Rotate',
    name: 'Geometry.Rotate',
    category: 'geometry',
    subGroup: 'Transform',
    icon: '↻',
    aliases: ['op-rotate'],
    description: 'Rotates a geometry around an axis defined by an origin point and a direction vector. The angle is given in degrees; positive values rotate counter-clockwise looking along the axis.',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to rotate' },
      { id: 'axisOrigin', name: 'Axis Pt', type: 'point', description: 'Point on the rotation axis' },
      { id: 'axisDir', name: 'Axis Dir', type: 'vector', description: 'Direction of the rotation axis' },
      { id: 'angle', name: 'Angle°', type: 'number', description: 'Rotation angle, in degrees' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'any', description: 'Rotated geometry' }],
    controls: [],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: undefined };
      const ao = toPoint(inputs.axisOrigin);
      const ad = toVector(inputs.axisDir, new Geo.Vector3(0, 0, 1));
      const angle = toNumber(inputs.angle, 0);
      return { result: Geo.rotate(geo, ao, ad, angle * Math.PI / 180) };
    },
    codegen: {
      python: '{{result}} = Geo.rotate({{geometry}}, {{axisOrigin}}, {{axisDir}}, math.radians({{angle}}))',
      csharp: 'var {{result}} = Geo.rotate({{geometry}}, {{axisOrigin}}, {{axisDir}}, {{angle}} * Math.PI / 180);'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to rotate' },
        { name: 'Axis Pt', description: 'Axis origin' },
        { name: 'Axis Dir', description: 'Axis direction' },
        { name: 'Angle°', description: 'Angle in degrees' }
      ],
      outputs: [{ name: 'Result', description: 'Rotated geometry' }],
      example: {
        title: 'Rotate a 3-4-5 line 90° — length unchanged (5)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.Origin', x: 0, y: 160 },
          { type: 'Point.ByCoordinates', x: 0, y: 230, controls: { x: 0, y: 0, z: 1 } },
          { type: 'Input.Number', x: 0, y: 300, controls: { val: 90 } },
          { type: 'Geometry.Rotate', x: 460, y: 150 },
          { type: 'Curve.Length', x: 680, y: 150 },
          { type: 'Output.Watch', x: 880, y: 150 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 6, 'geometry'],
          [3, 'point', 6, 'axisOrigin'],
          [4, 'point', 6, 'axisDir'],
          [5, 'value', 6, 'angle'],
          [6, 'result', 7, 'curve'],
          [7, 'length', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.rotate({{geometry}}, {{axisOrigin}}, {{axisDir}}, math.radians({{angle}}))'
    }
  },
  {
    type: 'Geometry.Scale',
    name: 'Geometry.Scale',
    category: 'geometry',
    subGroup: 'Transform',
    icon: '⤡',
    aliases: ['op-scale'],
    description: 'Uniformly scales a geometry about an origin point by a numeric factor. Distances from the origin are multiplied by the factor; lengths and areas scale accordingly.',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to scale' },
      { id: 'factor', name: 'Factor', type: 'number', description: 'Scale factor (>1 grows, <1 shrinks)' },
      { id: 'origin', name: 'Origin', type: 'point', description: 'Center of scaling' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'any', description: 'Scaled geometry' }],
    controls: [],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: undefined };
      return { result: Geo.scaleGeo(geo, toNumber(inputs.factor, 1), toPoint(inputs.origin)) };
    },
    codegen: {
      python: '{{result}} = Geo.scaleGeo({{geometry}}, {{factor}}, {{origin}})',
      csharp: 'var {{result}} = Geo.scaleGeo({{geometry}}, {{factor}}, {{origin}});'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to scale' },
        { name: 'Factor', description: 'Scale multiplier' },
        { name: 'Origin', description: 'Scaling center' }
      ],
      outputs: [{ name: 'Result', description: 'Scaled geometry' }],
      example: {
        title: 'Scale a 3-4-5 line by 2 → length 10',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Input.Number', x: 0, y: 160, controls: { val: 2 } },
          { type: 'Point.Origin', x: 0, y: 230 },
          { type: 'Geometry.Scale', x: 460, y: 90 },
          { type: 'Curve.Length', x: 680, y: 90 },
          { type: 'Output.Watch', x: 880, y: 90 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 5, 'geometry'],
          [3, 'value', 5, 'factor'],
          [4, 'point', 5, 'origin'],
          [5, 'result', 6, 'curve'],
          [6, 'length', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.scaleGeo({{geometry}}, {{factor}}, {{origin}})'
    }
  },
  {
    type: 'Geometry.Mirror',
    name: 'Geometry.Mirror',
    category: 'geometry',
    subGroup: 'Transform',
    icon: '⎸',
    aliases: ['op-mirror'],
    description: 'Mirrors a geometry across a plane defined by a point on the plane and the plane normal vector. Returns the mirrored geometry; lengths and areas are preserved (the result is a reflection).',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to mirror' },
      { id: 'planeOrigin', name: 'Plane Pt', type: 'point', description: 'Point on the mirror plane' },
      { id: 'planeNormal', name: 'Plane N', type: 'vector', description: 'Normal of the mirror plane' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'any', description: 'Mirrored geometry' }],
    controls: [],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: undefined };
      return {
        result: Geo.mirror(
          geo,
          toPoint(inputs.planeOrigin),
          toVector(inputs.planeNormal, new Geo.Vector3(1, 0, 0))
        )
      };
    },
    codegen: {
      python: '{{result}} = Geo.mirror({{geometry}}, {{planeOrigin}}, {{planeNormal}})',
      csharp: 'var {{result}} = Geo.mirror({{geometry}}, {{planeOrigin}}, {{planeNormal}});'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to mirror' },
        { name: 'Plane Pt', description: 'Point on mirror plane' },
        { name: 'Plane N', description: 'Mirror plane normal' }
      ],
      outputs: [{ name: 'Result', description: 'Mirrored geometry' }],
      example: {
        title: 'Mirror a 3-4-5 line — length unchanged (5)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.Origin', x: 0, y: 160 },
          { type: 'Point.ByCoordinates', x: 0, y: 230, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Geometry.Mirror', x: 460, y: 110 },
          { type: 'Curve.Length', x: 680, y: 110 },
          { type: 'Output.Watch', x: 880, y: 110 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 5, 'geometry'],
          [3, 'point', 5, 'planeOrigin'],
          [4, 'point', 5, 'planeNormal'],
          [5, 'result', 6, 'curve'],
          [6, 'length', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.mirror({{geometry}}, {{planeOrigin}}, {{planeNormal}})'
    }
  },
  {
    type: 'Geometry.LinearArray',
    name: 'Geometry.LinearArray',
    category: 'geometry',
    subGroup: 'Transform',
    icon: '⋯',
    aliases: ['op-array-linear'],
    description: 'Creates a list of Count copies of a geometry, each translated by Spacing units along Direction from the previous. Index 0 is the original; subsequent items are progressively translated.',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to array' },
      { id: 'direction', name: 'Direction', type: 'vector', description: 'Translation direction (normalised internally)' },
      { id: 'count', name: 'Count', type: 'number', description: 'Number of copies in the array' },
      { id: 'spacing', name: 'Spacing', type: 'number', description: 'Distance between consecutive copies' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'list', description: 'List of array copies' }],
    controls: [],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: [] };
      return {
        result: Geo.arrayLinear(
          geo,
          toVector(inputs.direction, new Geo.Vector3(1, 0, 0)),
          Math.max(1, Math.floor(toNumber(inputs.count, 3))),
          toNumber(inputs.spacing, 1)
        )
      };
    },
    codegen: {
      python: '{{result}} = Geo.arrayLinear({{geometry}}, {{direction}}, {{count}}, {{spacing}})',
      csharp: 'var {{result}} = Geo.arrayLinear({{geometry}}, {{direction}}, (int){{count}}, {{spacing}});'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to array' },
        { name: 'Direction', description: 'Translation direction' },
        { name: 'Count', description: 'Number of copies' },
        { name: 'Spacing', description: 'Distance between copies' }
      ],
      outputs: [{ name: 'Result', description: 'Array list' }],
      example: {
        title: '5 copies along X every 2 units — count 5',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.ByCoordinates', x: 0, y: 160, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Input.Integer', x: 0, y: 230, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 300, controls: { val: 2 } },
          { type: 'Geometry.LinearArray', x: 460, y: 150 },
          { type: 'List.Count', x: 680, y: 150 },
          { type: 'Output.Watch', x: 880, y: 150 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 6, 'geometry'],
          [3, 'point', 6, 'direction'],
          [4, 'value', 6, 'count'],
          [5, 'value', 6, 'spacing'],
          [6, 'result', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.arrayLinear({{geometry}}, {{direction}}, {{count}}, {{spacing}})'
    }
  },
  {
    type: 'Geometry.PolarArray',
    name: 'Geometry.PolarArray',
    category: 'geometry',
    subGroup: 'Transform',
    icon: '✱',
    aliases: ['op-array-polar'],
    description: 'Creates a list of Count copies of a geometry, each rotated by 360°/Count around the axis defined by Center and Axis direction. Useful for radial symmetries: bolt patterns, petals, spokes.',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to array' },
      { id: 'center', name: 'Center', type: 'point', description: 'Center point of the rotation axis' },
      { id: 'axis', name: 'Axis', type: 'vector', description: 'Direction of the rotation axis' },
      { id: 'count', name: 'Count', type: 'number', description: 'Number of copies around the full circle' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'list', description: 'List of array copies' }],
    controls: [],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: [] };
      return {
        result: Geo.arrayPolar(
          geo,
          toPoint(inputs.center),
          toVector(inputs.axis, new Geo.Vector3(0, 0, 1)),
          Math.max(1, Math.floor(toNumber(inputs.count, 6)))
        )
      };
    },
    codegen: {
      python: '{{result}} = Geo.arrayPolar({{geometry}}, {{center}}, {{axis}}, {{count}})',
      csharp: 'var {{result}} = Geo.arrayPolar({{geometry}}, {{center}}, {{axis}}, (int){{count}});'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to array' },
        { name: 'Center', description: 'Rotation axis origin' },
        { name: 'Axis', description: 'Rotation axis direction' },
        { name: 'Count', description: 'Number of copies' }
      ],
      outputs: [{ name: 'Result', description: 'Array list' }],
      example: {
        title: '6 radial copies around Z — count 6',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 2, y: 0, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.Origin', x: 0, y: 160 },
          { type: 'Point.ByCoordinates', x: 0, y: 230, controls: { x: 0, y: 0, z: 1 } },
          { type: 'Input.Integer', x: 0, y: 300, controls: { val: 6 } },
          { type: 'Geometry.PolarArray', x: 460, y: 150 },
          { type: 'List.Count', x: 680, y: 150 },
          { type: 'Output.Watch', x: 880, y: 150 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 6, 'geometry'],
          [3, 'point', 6, 'center'],
          [4, 'point', 6, 'axis'],
          [5, 'value', 6, 'count'],
          [6, 'result', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.arrayPolar({{geometry}}, {{center}}, {{axis}}, {{count}})'
    }
  },

  // ─── Transform ───────────────────────────────────────────
  {
    type: 'Geometry.Orient',
    name: 'Geometry.Orient',
    category: 'geometry',
    subGroup: 'Transform',
    icon: '⌖',
    aliases: ['geometry-orient', 'op-orient'],
    description: 'The keystone frame transform: rigidly maps a geometry from a source frame (From Plane) to a target frame (To Plane). Each point is expressed in the source frame coordinates and rebuilt in the target frame; free directions (normals/axes) are rotated by the basis change only. Both frames are right-handed so winding and handedness are preserved.',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to reorient' },
      { id: 'fromPlane', name: 'From Plane', type: 'plane', description: 'Source frame the geometry is currently described in' },
      { id: 'toPlane', name: 'To Plane', type: 'plane', description: 'Target frame to map the geometry into' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'any', description: 'Reoriented geometry (same type as the input)' }],
    controls: [],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: undefined };
      return { result: orient(geo, toPlane(inputs.fromPlane), toPlane(inputs.toPlane)) };
    },
    codegen: {
      python: '{{result}} = Geo.orient({{geometry}}, {{fromPlane}}, {{toPlane}})',
      csharp: 'var {{result}} = Geo.orient({{geometry}}, {{fromPlane}}, {{toPlane}});'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to reorient' },
        { name: 'From Plane', description: 'Source frame' },
        { name: 'To Plane', description: 'Target frame' }
      ],
      outputs: [{ name: 'Result', description: 'Reoriented geometry' }],
      example: {
        title: 'Orient a 3-4-5 line World-XY → tilted XZ frame — length unchanged (5)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Plane.XY', x: 0, y: 160 },
          { type: 'Plane.XZ', x: 0, y: 240 },
          { type: 'Geometry.Orient', x: 480, y: 120 },
          { type: 'Curve.Length', x: 720, y: 120 },
          { type: 'Output.Watch', x: 920, y: 120 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 5, 'geometry'],
          [3, 'plane', 5, 'fromPlane'],
          [4, 'plane', 5, 'toPlane'],
          [5, 'result', 6, 'curve'],
          [6, 'length', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.orient({{geometry}}, {{fromPlane}}, {{toPlane}})'
    }
  }
];
