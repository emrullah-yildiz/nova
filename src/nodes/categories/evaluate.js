import {
  pointAtT,
  tangentAtT,
  frameAtT,
  divideCurve
} from '../../geometry/curve-eval.js';
import {
  pointAtUV,
  normalAtUV,
  frameAtUV,
  divideSurface
} from '../../geometry/surface-eval.js';

// ============================================
// NOVA — Curve/Surface Evaluate & Divide node category (T5 / M2)
//
// Exposes the T4 geometry-kernel evaluation backbone
// (src/geometry/curve-eval.js + src/geometry/surface-eval.js) as modern Nova
// nodes: evaluate a point / tangent / normal / oriented FRAME at a normalized
// parameter, and divide a curve or surface into a list of points + frames.
//
// The frames returned are Geo.Plane objects carrying the SAME
// {origin, xaxis, yaxis, normal} shape M1's frames.frameAt produces, so they
// are consumed directly by the existing Geometry.Orient node — divide → frame
// per sample → orient a panel/family onto each frame is the panelization and
// adaptive-component placement payoff this milestone is built around.
//
// execute() wires to the T4 ES-module exports; codegen emits the matching
// `Geo.*` GLOBAL names (Geo.pointAtT, Geo.frameAtUV, Geo.divideSurface, …) that
// T4 attached to the assembled runtime Geo (src/geometry/index.js). The Divide
// kernels return {points, frames}; their codegen destructures that object into
// the node's two outputs. This mirrors the T2 transform category exactly.
// ============================================

export const evaluateCategory = {
  id: 'evaluate',
  name: 'Evaluate',
  color: '#94e2d5',
  icon: '⌁'
};

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}

// t / u / v are normalized parameters in [0,1]; clamp so a stray control value
// never samples past the curve/surface domain.
function toParam(value, fallback = 0.5) {
  const n = toNumber(value, fallback);
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function toCount(value, fallback = 1) {
  return Math.max(1, Math.floor(toNumber(value, fallback)));
}

export const evaluateNodes = [
  // ─── Curve evaluation ───────────────────────────────────────────────────
  {
    type: 'Curve.PointAtParameter',
    name: 'Curve.PointAtParameter',
    category: 'evaluate',
    subGroup: 'Curve',
    icon: '•',
    aliases: ['curve-pointatparameter', 'curve-pointat'],
    description: 'Evaluates the point on a curve at a normalized parameter t ∈ [0,1] (t=0 is the start, t=1 is the end). Works for lines, polylines, arcs, circles, ellipses and NURBS curves — the parameter is normalized arc-domain, not raw knot value, so 0.5 is always the parametric midpoint.',
    inputs: [
      { id: 'curve', name: 'Curve', type: 'curve', description: 'Curve to evaluate' },
      { id: 't', name: 't', type: 'number', description: 'Normalized parameter in [0,1]' }
    ],
    outputs: [{ id: 'point', name: 'Point', type: 'point', description: 'Point on the curve at t' }],
    controls: [{ id: 't', type: 'formula', default: '0.5', label: 't' }],
    execute(context, inputs) {
      if (inputs.curve == null) return { point: undefined };
      return { point: pointAtT(inputs.curve, toParam(inputs.t, 0.5)) };
    },
    codegen: {
      python: '{{point}} = Geo.pointAtT({{curve}}, {{t}})',
      csharp: 'var {{point}} = Geo.pointAtT({{curve}}, {{t}});'
    },
    help: {
      inputs: [
        { name: 'Curve', description: 'Curve to evaluate' },
        { name: 't', description: 'Normalized parameter in [0,1]' }
      ],
      outputs: [{ name: 'Point', description: 'Point on the curve at t' }],
      example: {
        title: 'Midpoint (t=0.5) of a 3-4-5 line — point (1.5, 2, 0)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Input.Number', x: 0, y: 160, controls: { val: 0.5 } },
          { type: 'Curve.PointAtParameter', x: 480, y: 60 },
          { type: 'Output.Watch', x: 720, y: 60 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 4, 'curve'],
          [3, 'value', 4, 't'],
          [4, 'point', 5, 'value']
        ]
      },
      sampleCode: '{{point}} = Geo.pointAtT({{curve}}, {{t}})'
    }
  },
  {
    type: 'Curve.TangentAtParameter',
    name: 'Curve.TangentAtParameter',
    category: 'evaluate',
    subGroup: 'Curve',
    icon: '↗',
    aliases: ['curve-tangentatparameter', 'curve-tangentat'],
    description: 'Evaluates the unit tangent vector of a curve at a normalized parameter t ∈ [0,1] — the direction the curve is travelling at that point. Always unit length; uses the curve\'s own analytic tangent where available, otherwise a finite-difference approximation.',
    inputs: [
      { id: 'curve', name: 'Curve', type: 'curve', description: 'Curve to evaluate' },
      { id: 't', name: 't', type: 'number', description: 'Normalized parameter in [0,1]' }
    ],
    outputs: [{ id: 'tangent', name: 'Tangent', type: 'vector', description: 'Unit tangent vector at t' }],
    controls: [{ id: 't', type: 'formula', default: '0.5', label: 't' }],
    execute(context, inputs) {
      if (inputs.curve == null) return { tangent: undefined };
      return { tangent: tangentAtT(inputs.curve, toParam(inputs.t, 0.5)) };
    },
    codegen: {
      python: '{{tangent}} = Geo.tangentAtT({{curve}}, {{t}})',
      csharp: 'var {{tangent}} = Geo.tangentAtT({{curve}}, {{t}});'
    },
    help: {
      inputs: [
        { name: 'Curve', description: 'Curve to evaluate' },
        { name: 't', description: 'Normalized parameter in [0,1]' }
      ],
      outputs: [{ name: 'Tangent', description: 'Unit tangent vector at t' }],
      example: {
        title: 'Tangent of a quarter-circle at t=0.5 — unit vector along the sweep',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 30 },
          { type: 'Input.Number', x: 0, y: 170, controls: { val: 0.25 } },
          { type: 'Curve.TangentAtParameter', x: 480, y: 60 },
          { type: 'Vector.Deconstruct', x: 720, y: 60 },
          { type: 'Output.Watch', x: 940, y: 60 }
        ],
        wires: [
          [0, 'point', 2, 'center'],
          [1, 'value', 2, 'radius'],
          [2, 'circle', 4, 'curve'],
          [3, 'value', 4, 't'],
          [4, 'tangent', 5, 'vector'],
          [5, 'y', 6, 'value']
        ]
      },
      sampleCode: '{{tangent}} = Geo.tangentAtT({{curve}}, {{t}})'
    }
  },
  {
    type: 'Curve.FrameAtParameter',
    name: 'Curve.FrameAtParameter',
    category: 'evaluate',
    subGroup: 'Curve',
    icon: '⊹',
    aliases: ['curve-frameatparameter', 'curve-frameat'],
    description: 'Evaluates an oriented frame (a Plane) on a curve at a normalized parameter t ∈ [0,1]. The frame origin is the curve point; its normal is the unit tangent (local Z runs ALONG the curve) and the in-plane X/Y are chosen deterministically for a continuous, non-tumbling frame. Feed straight into Geometry.Orient to place a family member at that station.',
    inputs: [
      { id: 'curve', name: 'Curve', type: 'curve', description: 'Curve to evaluate' },
      { id: 't', name: 't', type: 'number', description: 'Normalized parameter in [0,1]' }
    ],
    outputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Oriented frame at t (normal = tangent)' }],
    controls: [{ id: 't', type: 'formula', default: '0.5', label: 't' }],
    execute(context, inputs) {
      if (inputs.curve == null) return { plane: undefined };
      return { plane: frameAtT(inputs.curve, toParam(inputs.t, 0.5)) };
    },
    codegen: {
      python: '{{plane}} = Geo.frameAtT({{curve}}, {{t}})',
      csharp: 'var {{plane}} = Geo.frameAtT({{curve}}, {{t}});'
    },
    help: {
      inputs: [
        { name: 'Curve', description: 'Curve to evaluate' },
        { name: 't', description: 'Normalized parameter in [0,1]' }
      ],
      outputs: [{ name: 'Plane', description: 'Oriented frame at t (normal = tangent)' }],
      example: {
        title: 'Frame at the midpoint of a line — its normal is the line tangent',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 5, y: 0, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Input.Number', x: 0, y: 160, controls: { val: 0.5 } },
          { type: 'Curve.FrameAtParameter', x: 480, y: 60 },
          { type: 'Plane.Normal', x: 720, y: 60 },
          { type: 'Output.Watch', x: 940, y: 60 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 4, 'curve'],
          [3, 'value', 4, 't'],
          [4, 'plane', 5, 'plane'],
          [5, 'normal', 6, 'value']
        ]
      },
      sampleCode: '{{plane}} = Geo.frameAtT({{curve}}, {{t}})'
    }
  },
  {
    type: 'Curve.Divide',
    name: 'Curve.Divide',
    category: 'evaluate',
    subGroup: 'Curve',
    icon: '⋮',
    aliases: ['curve-divide', 'curve-dividebycount'],
    description: 'Divides a curve into Count equal segments (by normalized parameter) and returns both the sample Points and an oriented Frame at each. An OPEN curve yields Count+1 samples (both endpoints included); a CLOSED curve (circle / closed polyline) yields exactly Count (the wrap-around duplicate is dropped). The frames feed Geometry.Orient for placing a family along the curve.',
    inputs: [
      { id: 'curve', name: 'Curve', type: 'curve', description: 'Curve to divide' },
      { id: 'count', name: 'Count', type: 'number', description: 'Number of segments (open curve → Count+1 points)' }
    ],
    outputs: [
      { id: 'points', name: 'Points', type: 'list', description: 'Sample points along the curve' },
      { id: 'frames', name: 'Frames', type: 'list', description: 'Oriented frame at each sample (normal = tangent)' }
    ],
    controls: [{ id: 'count', type: 'formula', default: '10', label: 'Count' }],
    execute(context, inputs) {
      if (inputs.curve == null) return { points: [], frames: [] };
      const { points, frames } = divideCurve(inputs.curve, toCount(inputs.count, 10));
      return { points, frames };
    },
    codegen: {
      python: "_d = Geo.divideCurve({{curve}}, int({{count}}))\n{{points}} = _d['points']\n{{frames}} = _d['frames']",
      csharp: 'var _d = Geo.divideCurve({{curve}}, (int){{count}});\nvar {{points}} = _d.points;\nvar {{frames}} = _d.frames;'
    },
    help: {
      inputs: [
        { name: 'Curve', description: 'Curve to divide' },
        { name: 'Count', description: 'Number of segments' }
      ],
      outputs: [
        { name: 'Points', description: 'Sample points along the curve' },
        { name: 'Frames', description: 'Oriented frame at each sample' }
      ],
      example: {
        title: 'Divide a line into 4 segments → 5 points (open-curve Count+1 convention)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 8, y: 0, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Input.Integer', x: 0, y: 160, controls: { val: 4 } },
          { type: 'Curve.Divide', x: 480, y: 60 },
          { type: 'List.Count', x: 720, y: 60 },
          { type: 'Output.Watch', x: 920, y: 60 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 4, 'curve'],
          [3, 'value', 4, 'count'],
          [4, 'points', 5, 'list'],
          [5, 'count', 6, 'value']
        ]
      },
      sampleCode: "_d = Geo.divideCurve({{curve}}, int({{count}}))\n{{points}} = _d['points']\n{{frames}} = _d['frames']"
    }
  },

  // ─── Surface evaluation ─────────────────────────────────────────────────
  {
    type: 'Surface.PointAtUV',
    name: 'Surface.PointAtUV',
    category: 'evaluate',
    subGroup: 'Surface',
    icon: '•',
    aliases: ['surface-pointatuv', 'surface-pointat'],
    description: 'Evaluates the point on a surface at a normalized parameter pair (u, v) ∈ [0,1]². Handles parametric surfaces, NURBS surfaces and grid/mesh surfaces; the parameters are normalized so (0,0) is one corner and (1,1) the opposite.',
    inputs: [
      { id: 'surface', name: 'Surface', type: 'mesh', description: 'Surface to evaluate' },
      { id: 'u', name: 'u', type: 'number', description: 'Normalized U parameter in [0,1]' },
      { id: 'v', name: 'v', type: 'number', description: 'Normalized V parameter in [0,1]' }
    ],
    outputs: [{ id: 'point', name: 'Point', type: 'point', description: 'Point on the surface at (u, v)' }],
    controls: [
      { id: 'u', type: 'formula', default: '0.5', label: 'u' },
      { id: 'v', type: 'formula', default: '0.5', label: 'v' }
    ],
    execute(context, inputs) {
      if (inputs.surface == null) return { point: undefined };
      return { point: pointAtUV(inputs.surface, toParam(inputs.u, 0.5), toParam(inputs.v, 0.5)) };
    },
    codegen: {
      python: '{{point}} = Geo.pointAtUV({{surface}}, {{u}}, {{v}})',
      csharp: 'var {{point}} = Geo.pointAtUV({{surface}}, {{u}}, {{v}});'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface to evaluate' },
        { name: 'u', description: 'Normalized U parameter in [0,1]' },
        { name: 'v', description: 'Normalized V parameter in [0,1]' }
      ],
      outputs: [{ name: 'Point', description: 'Point on the surface at (u, v)' }],
      example: {
        title: 'Center point (u=0.5, v=0.5) of a Dini surface',
        nodes: [
          { type: 'Surface.Dini', x: 0, y: 0, controls: { a: 1, b: 0.2 } },
          { type: 'Input.Number', x: 0, y: 110, controls: { val: 0.5 } },
          { type: 'Input.Number', x: 0, y: 180, controls: { val: 0.5 } },
          { type: 'Surface.PointAtUV', x: 280, y: 60 },
          { type: 'Output.Watch', x: 520, y: 60 }
        ],
        wires: [
          [0, 'surface', 3, 'surface'],
          [1, 'value', 3, 'u'],
          [2, 'value', 3, 'v'],
          [3, 'point', 4, 'value']
        ]
      },
      sampleCode: '{{point}} = Geo.pointAtUV({{surface}}, {{u}}, {{v}})'
    }
  },
  {
    type: 'Surface.NormalAtUV',
    name: 'Surface.NormalAtUV',
    category: 'evaluate',
    subGroup: 'Surface',
    icon: '⊥',
    aliases: ['surface-normalatuv', 'surface-normalat'],
    description: 'Evaluates the unit surface normal at a normalized parameter pair (u, v) ∈ [0,1]² — the direction perpendicular to the tangent plane at that point. Uses the surface\'s analytic normal where available, otherwise dU × dV from finite differences. Always unit length.',
    inputs: [
      { id: 'surface', name: 'Surface', type: 'mesh', description: 'Surface to evaluate' },
      { id: 'u', name: 'u', type: 'number', description: 'Normalized U parameter in [0,1]' },
      { id: 'v', name: 'v', type: 'number', description: 'Normalized V parameter in [0,1]' }
    ],
    outputs: [{ id: 'normal', name: 'Normal', type: 'vector', description: 'Unit surface normal at (u, v)' }],
    controls: [
      { id: 'u', type: 'formula', default: '0.5', label: 'u' },
      { id: 'v', type: 'formula', default: '0.5', label: 'v' }
    ],
    execute(context, inputs) {
      if (inputs.surface == null) return { normal: undefined };
      return { normal: normalAtUV(inputs.surface, toParam(inputs.u, 0.5), toParam(inputs.v, 0.5)) };
    },
    codegen: {
      python: '{{normal}} = Geo.normalAtUV({{surface}}, {{u}}, {{v}})',
      csharp: 'var {{normal}} = Geo.normalAtUV({{surface}}, {{u}}, {{v}});'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface to evaluate' },
        { name: 'u', description: 'Normalized U parameter in [0,1]' },
        { name: 'v', description: 'Normalized V parameter in [0,1]' }
      ],
      outputs: [{ name: 'Normal', description: 'Unit surface normal at (u, v)' }],
      example: {
        title: 'Normal at the center of a Dini surface — deconstruct its Z',
        nodes: [
          { type: 'Surface.Dini', x: 0, y: 0, controls: { a: 1, b: 0.2 } },
          { type: 'Input.Number', x: 0, y: 110, controls: { val: 0.5 } },
          { type: 'Input.Number', x: 0, y: 180, controls: { val: 0.5 } },
          { type: 'Surface.NormalAtUV', x: 280, y: 60 },
          { type: 'Vector.Deconstruct', x: 520, y: 60 },
          { type: 'Output.Watch', x: 740, y: 60 }
        ],
        wires: [
          [0, 'surface', 3, 'surface'],
          [1, 'value', 3, 'u'],
          [2, 'value', 3, 'v'],
          [3, 'normal', 4, 'vector'],
          [4, 'z', 5, 'value']
        ]
      },
      sampleCode: '{{normal}} = Geo.normalAtUV({{surface}}, {{u}}, {{v}})'
    }
  },
  {
    type: 'Surface.FrameAtUV',
    name: 'Surface.FrameAtUV',
    category: 'evaluate',
    subGroup: 'Surface',
    icon: '⊹',
    aliases: ['surface-frameatuv', 'surface-frameat'],
    description: 'Evaluates an oriented frame (a Plane) on a surface at a normalized parameter pair (u, v) ∈ [0,1]². Origin = surface point; normal = surface normal; in-plane X follows the dU direction, Y = normal × X. Lay a panel flat onto the surface by orienting it from the world XY plane onto this frame via Geometry.Orient.',
    inputs: [
      { id: 'surface', name: 'Surface', type: 'mesh', description: 'Surface to evaluate' },
      { id: 'u', name: 'u', type: 'number', description: 'Normalized U parameter in [0,1]' },
      { id: 'v', name: 'v', type: 'number', description: 'Normalized V parameter in [0,1]' }
    ],
    outputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Oriented frame at (u, v) (normal = surface normal)' }],
    controls: [
      { id: 'u', type: 'formula', default: '0.5', label: 'u' },
      { id: 'v', type: 'formula', default: '0.5', label: 'v' }
    ],
    execute(context, inputs) {
      if (inputs.surface == null) return { plane: undefined };
      return { plane: frameAtUV(inputs.surface, toParam(inputs.u, 0.5), toParam(inputs.v, 0.5)) };
    },
    codegen: {
      python: '{{plane}} = Geo.frameAtUV({{surface}}, {{u}}, {{v}})',
      csharp: 'var {{plane}} = Geo.frameAtUV({{surface}}, {{u}}, {{v}});'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface to evaluate' },
        { name: 'u', description: 'Normalized U parameter in [0,1]' },
        { name: 'v', description: 'Normalized V parameter in [0,1]' }
      ],
      outputs: [{ name: 'Plane', description: 'Oriented frame at (u, v)' }],
      example: {
        title: 'Frame at the center of a Dini surface — its normal is the surface normal',
        nodes: [
          { type: 'Surface.Dini', x: 0, y: 0, controls: { a: 1, b: 0.2 } },
          { type: 'Input.Number', x: 0, y: 110, controls: { val: 0.5 } },
          { type: 'Input.Number', x: 0, y: 180, controls: { val: 0.5 } },
          { type: 'Surface.FrameAtUV', x: 280, y: 60 },
          { type: 'Plane.Normal', x: 520, y: 60 },
          { type: 'Output.Watch', x: 740, y: 60 }
        ],
        wires: [
          [0, 'surface', 3, 'surface'],
          [1, 'value', 3, 'u'],
          [2, 'value', 3, 'v'],
          [3, 'plane', 4, 'plane'],
          [4, 'normal', 5, 'value']
        ]
      },
      sampleCode: '{{plane}} = Geo.frameAtUV({{surface}}, {{u}}, {{v}})'
    }
  },
  {
    type: 'Surface.Divide',
    name: 'Surface.Divide',
    category: 'evaluate',
    subGroup: 'Surface',
    icon: '▦',
    aliases: ['surface-divide', 'surface-isotrim'],
    description: 'Divides a surface into a (U Count × V Count) grid of cells and returns both the grid Points and an oriented Frame at each — the panelization substrate. U/V Count are SEGMENT counts, so the grid has (U Count+1) × (V Count+1) samples in row-major order. Feed Frames into Geometry.Orient to lay a panel/adaptive component flat onto every cell.',
    inputs: [
      { id: 'surface', name: 'Surface', type: 'mesh', description: 'Surface to divide' },
      { id: 'uCount', name: 'U Count', type: 'number', description: 'U segment count ((U Count+1) samples along U)' },
      { id: 'vCount', name: 'V Count', type: 'number', description: 'V segment count ((V Count+1) samples along V)' }
    ],
    outputs: [
      { id: 'points', name: 'Points', type: 'list', description: 'Grid sample points (row-major)' },
      { id: 'frames', name: 'Frames', type: 'list', description: 'Oriented frame at each sample (normal = surface normal)' }
    ],
    controls: [
      { id: 'uCount', type: 'formula', default: '5', label: 'U Count' },
      { id: 'vCount', type: 'formula', default: '5', label: 'V Count' }
    ],
    execute(context, inputs) {
      if (inputs.surface == null) return { points: [], frames: [] };
      const { points, frames } = divideSurface(
        inputs.surface,
        toCount(inputs.uCount, 5),
        toCount(inputs.vCount, 5)
      );
      return { points, frames };
    },
    codegen: {
      python: "_d = Geo.divideSurface({{surface}}, int({{uCount}}), int({{vCount}}))\n{{points}} = _d['points']\n{{frames}} = _d['frames']",
      csharp: 'var _d = Geo.divideSurface({{surface}}, (int){{uCount}}, (int){{vCount}});\nvar {{points}} = _d.points;\nvar {{frames}} = _d.frames;'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface to divide' },
        { name: 'U Count', description: 'U segment count' },
        { name: 'V Count', description: 'V segment count' }
      ],
      outputs: [
        { name: 'Points', description: 'Grid sample points (row-major)' },
        { name: 'Frames', description: 'Oriented frame at each sample' }
      ],
      // PANELIZATION PAYOFF (M1 + M2 chain): a surface → Surface.Divide → Frames
      // → Geometry.Orient lays a small panel box (built on the world XY plane)
      // flat onto every grid cell, then Output.Watch shows the populated surface.
      example: {
        title: 'Panelize a Dini surface: 4×4 grid → orient a flat panel onto every frame',
        nodes: [
          { type: 'Surface.Dini', x: 0, y: 0, controls: { a: 1, b: 0.2 } },
          { type: 'Input.Integer', x: 0, y: 110, controls: { val: 4 } },
          { type: 'Input.Integer', x: 0, y: 180, controls: { val: 4 } },
          { type: 'Surface.Divide', x: 280, y: 60 },
          { type: 'Point.Origin', x: 0, y: 300 },
          { type: 'Box.ByCenterWidthDepthHeight', x: 280, y: 300, controls: { width: 0.4, depth: 0.4, height: 0.05 } },
          { type: 'Plane.XY', x: 280, y: 440 },
          { type: 'Geometry.Orient', x: 560, y: 200 },
          { type: 'Output.Watch', x: 820, y: 200 }
        ],
        wires: [
          [0, 'surface', 3, 'surface'],
          [1, 'value', 3, 'uCount'],
          [2, 'value', 3, 'vCount'],
          [4, 'point', 5, 'center'],
          [5, 'solid', 7, 'geometry'],
          [6, 'plane', 7, 'fromPlane'],
          [3, 'frames', 7, 'toPlane'],
          [7, 'result', 8, 'value']
        ]
      },
      sampleCode: "_d = Geo.divideSurface({{surface}}, int({{uCount}}), int({{vCount}}))\n{{points}} = _d['points']\n{{frames}} = _d['frames']"
    }
  }
];
