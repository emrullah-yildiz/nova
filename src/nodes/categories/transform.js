import { Geo } from '../../geometry/index.js';
import { planeFromOriginXY } from '../../geometry/frames.js';
import { orient, arrayLinear, arrayPolar } from '../../geometry/transforms.js';

// ============================================
// NOVA — Transform & Frame node category (T2)
//
// Exposes the T1 geometry-kernel frame/transform backbone
// (src/geometry/frames.js + src/geometry/transforms.js) as modern Nova nodes.
//
// IMPORTANT (T1 reviewer note): these nodes wire to the T1 `transforms.*`
// module exports — the canonical count + total-angle/vector array convention —
// NOT the older spacing-based `Geo.arrayLinear`/`Geo.arrayPolar` globals used by
// the legacy `Geometry.LinearArray`/`Geometry.PolarArray` nodes in
// src/nodes/categories/geometry.js. That keeps one consistent array convention
// in the library.
// ============================================

export const transformCategory = {
  id: 'transform',
  name: 'Transform',
  color: '#f9e2af',
  icon: '⇄'
};

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
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
function toPlane(value) {
  if (value && value._type === 'Plane') return value;
  if (value && value.origin && value.normal) {
    return new Geo.Plane(toPoint(value.origin), toVector(value.normal));
  }
  return new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1));
}
function toCount(value, fallback = 1) {
  return Math.max(0, Math.floor(toNumber(value, fallback)));
}

export const transformNodes = [
  // ─── Plane creation (carries an explicit orthonormal frame) ─────────────
  {
    type: 'Plane.ByOriginXAxisYAxis',
    name: 'Plane.ByOriginXAxisYAxis',
    category: 'transform',
    subGroup: 'Plane',
    icon: '⊞',
    aliases: ['plane-byoriginxaxisyaxis', 'frame-byaxes'],
    description: 'Builds a fully oriented plane (an orthonormal frame) from an origin and two in-plane axis hints. The X axis is the normalised X hint; Y is the Y hint made orthogonal to X (Gram-Schmidt); the normal is X × Y. Unlike Plane.ByOriginNormal it carries an explicit in-plane orientation, so it is the right source/target frame for Geometry.Orient.',
    inputs: [
      { id: 'origin', name: 'Origin', type: 'point', description: 'Anchor point of the frame' },
      { id: 'xAxis', name: 'X Axis', type: 'vector', description: 'Desired X direction (normalised internally)' },
      { id: 'yAxis', name: 'Y Axis', type: 'vector', description: 'In-plane Y hint (orthogonalised against X)' }
    ],
    outputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Oriented plane carrying an explicit X/Y/normal frame' }],
    controls: [],
    execute(context, inputs) {
      return {
        plane: planeFromOriginXY(
          toPoint(inputs.origin),
          toVector(inputs.xAxis, new Geo.Vector3(1, 0, 0)),
          toVector(inputs.yAxis, new Geo.Vector3(0, 1, 0))
        )
      };
    },
    codegen: {
      python: '{{plane}} = Geo.planeFromOriginXY({{origin}}, {{xAxis}}, {{yAxis}})',
      csharp: 'var {{plane}} = Geo.planeFromOriginXY({{origin}}, {{xAxis}}, {{yAxis}});'
    },
    help: {
      inputs: [
        { name: 'Origin', description: 'Anchor point of the frame' },
        { name: 'X Axis', description: 'Desired X direction' },
        { name: 'Y Axis', description: 'In-plane Y hint' }
      ],
      outputs: [{ name: 'Plane', description: 'Oriented frame' }],
      example: {
        title: 'Frame from X=(1,0,0), Y=(0,1,0) — normal Z component = 1',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Vector.XAxis', x: 0, y: 80 },
          { type: 'Vector.YAxis', x: 0, y: 150 },
          { type: 'Plane.ByOriginXAxisYAxis', x: 280, y: 60 },
          { type: 'Plane.Normal', x: 520, y: 60 },
          { type: 'Vector.Deconstruct', x: 720, y: 60 },
          { type: 'Output.Watch', x: 940, y: 60 }
        ],
        wires: [
          [0, 'point', 3, 'origin'],
          [1, 'vector', 3, 'xAxis'],
          [2, 'vector', 3, 'yAxis'],
          [3, 'plane', 4, 'plane'],
          [4, 'normal', 5, 'vector'],
          [5, 'z', 6, 'value']
        ]
      },
      sampleCode: '{{plane}} = Geo.planeFromOriginXY({{origin}}, {{xAxis}}, {{yAxis}})'
    }
  },

  // ─── Transform: the keystone orient + array ops (wired to T1) ───────────
  {
    type: 'Geometry.Orient',
    name: 'Geometry.Orient',
    category: 'transform',
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
  },
  {
    type: 'Geometry.ArrayLinear',
    name: 'Geometry.ArrayLinear',
    category: 'transform',
    subGroup: 'Transform',
    icon: '⋯',
    aliases: ['geometry-arraylinear'],
    description: 'Creates a list of Count copies of a geometry, each offset by an additional Direction vector from the previous (copy i is translated by i × Direction; copy 0 is the original). The Direction vector carries the full per-step offset — its length is the spacing — matching the canonical T1 transforms.arrayLinear convention.',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to array' },
      { id: 'direction', name: 'Direction', type: 'vector', description: 'Per-step offset vector (its length is the spacing)' },
      { id: 'count', name: 'Count', type: 'number', description: 'Number of copies (copy 0 is the original)' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'list', description: 'List of arrayed copies' }],
    controls: [],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: [] };
      return {
        result: arrayLinear(
          geo,
          toVector(inputs.direction, new Geo.Vector3(1, 0, 0)),
          toCount(inputs.count, 3)
        )
      };
    },
    codegen: {
      python: '{{result}} = Geo.arrayLinearByVector({{geometry}}, {{direction}}, {{count}})',
      csharp: 'var {{result}} = Geo.arrayLinearByVector({{geometry}}, {{direction}}, (int){{count}});'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to array' },
        { name: 'Direction', description: 'Per-step offset vector' },
        { name: 'Count', description: 'Number of copies' }
      ],
      outputs: [{ name: 'Result', description: 'Array list' }],
      example: {
        title: '5 copies along X by (2,0,0) — count 5',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.ByCoordinates', x: 0, y: 160, controls: { x: 2, y: 0, z: 0 } },
          { type: 'Input.Integer', x: 0, y: 230, controls: { val: 5 } },
          { type: 'Geometry.ArrayLinear', x: 460, y: 120 },
          { type: 'List.Count', x: 700, y: 120 },
          { type: 'Output.Watch', x: 900, y: 120 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 5, 'geometry'],
          [3, 'point', 5, 'direction'],
          [4, 'value', 5, 'count'],
          [5, 'result', 6, 'list'],
          [6, 'count', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.arrayLinearByVector({{geometry}}, {{direction}}, {{count}})'
    }
  },
  {
    type: 'Geometry.ArrayPolar',
    name: 'Geometry.ArrayPolar',
    category: 'transform',
    subGroup: 'Transform',
    icon: '✳',
    aliases: ['geometry-arraypolar'],
    description: 'Creates a list of Count copies of a geometry rotated about an axis (Center + Axis), spread evenly over a total sweep Angle (degrees, default 360°). For a full turn the angular step is Angle/Count so copies do not overlap; for a partial sweep it is Angle/(Count−1) so the first and last copies land on the sweep endpoints — the canonical T1 transforms.arrayPolar convention.',
    inputs: [
      { id: 'geometry', name: 'Geometry', type: 'any', description: 'Geometry to array' },
      { id: 'center', name: 'Center', type: 'point', description: 'Point on the rotation axis' },
      { id: 'axis', name: 'Axis', type: 'vector', description: 'Direction of the rotation axis' },
      { id: 'count', name: 'Count', type: 'number', description: 'Number of copies' },
      { id: 'angle', name: 'Angle°', type: 'number', description: 'Total sweep in degrees (default 360)' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'list', description: 'List of arrayed copies' }],
    controls: [{ id: 'angle', type: 'formula', default: '360', label: 'Angle°' }],
    execute(context, inputs) {
      const geo = inputs.geometry;
      if (geo == null) return { result: [] };
      const angleDeg = toNumber(inputs.angle, 360);
      return {
        result: arrayPolar(
          geo,
          toPoint(inputs.center),
          toVector(inputs.axis, new Geo.Vector3(0, 0, 1)),
          toCount(inputs.count, 6),
          angleDeg * Math.PI / 180
        )
      };
    },
    codegen: {
      python: '{{result}} = Geo.arrayPolarByAngle({{geometry}}, {{center}}, {{axis}}, {{count}}, math.radians({{angle}}))',
      csharp: 'var {{result}} = Geo.arrayPolarByAngle({{geometry}}, {{center}}, {{axis}}, (int){{count}}, {{angle}} * Math.PI / 180);'
    },
    help: {
      inputs: [
        { name: 'Geometry', description: 'Geometry to array' },
        { name: 'Center', description: 'Rotation axis origin' },
        { name: 'Axis', description: 'Rotation axis direction' },
        { name: 'Count', description: 'Number of copies' },
        { name: 'Angle°', description: 'Total sweep in degrees' }
      ],
      outputs: [{ name: 'Result', description: 'Array list' }],
      example: {
        title: '4 radial copies over 360° around Z — count 4',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 2, y: 0, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.Origin', x: 0, y: 160 },
          { type: 'Vector.ZAxis', x: 0, y: 230 },
          { type: 'Input.Integer', x: 0, y: 300, controls: { val: 4 } },
          { type: 'Geometry.ArrayPolar', x: 460, y: 150, controls: { angle: 360 } },
          { type: 'List.Count', x: 700, y: 150 },
          { type: 'Output.Watch', x: 900, y: 150 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 6, 'geometry'],
          [3, 'point', 6, 'center'],
          [4, 'vector', 6, 'axis'],
          [5, 'value', 6, 'count'],
          [6, 'result', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.arrayPolarByAngle({{geometry}}, {{center}}, {{axis}}, {{count}}, math.radians({{angle}}))'
    }
  }
];
