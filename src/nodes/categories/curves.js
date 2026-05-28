import { Geo } from '../../geometry/index.js';

export const curvesCategory = {
  id: 'curves',
  name: 'Curves',
  color: '#94e2d5',
  icon: '∿'
};

function toPoint(value, fallback = new Geo.Point3(0, 0, 0)) {
  if (value && typeof value === 'object' && value.x !== undefined) return value;
  return fallback;
}
function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}
function toList(value) {
  return Array.isArray(value) ? value : [];
}
function curveStart(c) {
  if (!c) return undefined;
  if (c.start) return c.start;
  if (c.points && c.points.length > 0) return c.points[0];
  if (typeof c.pointAt === 'function') return c.pointAt(0);
  return undefined;
}
function curveEnd(c) {
  if (!c) return undefined;
  if (c.end) return c.end;
  if (c.points && c.points.length > 0) return c.points[c.points.length - 1];
  if (typeof c.pointAt === 'function') return c.pointAt(1);
  return undefined;
}
function curveLen(c) {
  if (!c) return 0;
  if (typeof c.length === 'function') return c.length();
  if (c.points) {
    let l = 0;
    for (let i = 1; i < c.points.length; i++) l += c.points[i - 1].distanceTo(c.points[i]);
    return l;
  }
  return 0;
}
function curveDir(c) {
  const s = curveStart(c);
  const e = curveEnd(c);
  if (!s || !e) return new Geo.Vector3(0, 0, 0);
  const d = e.sub(s);
  const l = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) || 1;
  return new Geo.Vector3(d.x / l, d.y / l, d.z / l);
}
function curveMid(c) {
  if (c && typeof c.getCenter === 'function') return c.getCenter();
  if (c && typeof c.pointAt === 'function') return c.pointAt(0.5);
  const s = curveStart(c);
  const e = curveEnd(c);
  return s && e ? s.lerp(e, 0.5) : undefined;
}
function curveTangent(c, t) {
  if (!c) return undefined;
  if (typeof c.tangentAt === 'function') return c.tangentAt(t);
  return curveDir(c);
}

export const curvesNodes = [
  // ─── Arc ─────────────────────────────────────────────────
  {
    type: 'Arc.ByCenterRadiusAngles',
    name: 'Arc.ByCenterRadiusAngles',
    category: 'curves',
    subGroup: 'Arc',
    icon: '⌒',
    aliases: ['curve-arc-by-center-radius-angles'],
    description: 'Creates a circular arc from a center point, a radius, and start/end angles in degrees. Use 0° and 360° for a full circle.',
    inputs: [
      { id: 'center', name: 'Center', type: 'point', description: 'Center point of the arc' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Distance from center to the arc' },
      { id: 'startAngle', name: 'Start°', type: 'number', description: 'Start angle, in degrees' },
      { id: 'endAngle', name: 'End°', type: 'number', description: 'End angle, in degrees' }
    ],
    outputs: [{ id: 'arc', name: 'Arc', type: 'curve', description: 'Resulting arc geometry' }],
    controls: [],
    execute(context, inputs) {
      const c = toPoint(inputs.center);
      const r = toNumber(inputs.radius, 5);
      const sa = toNumber(inputs.startAngle, 0);
      const ea = toNumber(inputs.endAngle, 360);
      return { arc: new Geo.Arc3(c, r, sa * Math.PI / 180, ea * Math.PI / 180) };
    },
    codegen: {
      python: '{{arc}} = Geo.Arc3({{center}}, {{radius}}, math.radians({{startAngle}}), math.radians({{endAngle}}))',
      csharp: 'var {{arc}} = Geo.Arc3({{center}}, {{radius}}, {{startAngle}} * Math.PI / 180, {{endAngle}} * Math.PI / 180);'
    },
    help: {
      inputs: [
        { name: 'Center', description: 'Center of the arc' },
        { name: 'Radius', description: 'Radius' },
        { name: 'Start°', description: 'Start angle' },
        { name: 'End°', description: 'End angle' }
      ],
      outputs: [{ name: 'Arc', description: 'Arc geometry' }],
      example: {
        title: 'Arc length of a quarter circle (r=5)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 90 } },
          { type: 'Arc.ByCenterRadiusAngles', x: 240, y: 110 },
          { type: 'Curve.Length', x: 460, y: 110 },
          { type: 'output-watch', x: 660, y: 110 }
        ],
        wires: [
          [0, 'point', 4, 'center'],
          [1, 'value', 4, 'radius'],
          [2, 'value', 4, 'startAngle'],
          [3, 'value', 4, 'endAngle'],
          [4, 'arc', 5, 'curve'],
          [5, 'length', 6, 'value']
        ]
      },
      sampleCode: '{{arc}} = Geo.Arc3({{center}}, {{radius}}, math.radians({{startAngle}}), math.radians({{endAngle}}))'
    }
  },

  // ─── Bezier ──────────────────────────────────────────────
  {
    type: 'Bezier.ByControlPoints',
    name: 'Bezier.ByControlPoints',
    category: 'curves',
    subGroup: 'Bezier',
    icon: '∿',
    aliases: ['curve-bezier-by-control-points'],
    description: 'Creates a smooth Bezier curve through a list of control points. The curve is pulled toward control points without passing through them, except for the first and last.',
    inputs: [{ id: 'points', name: 'Control Pts', type: 'list', description: 'Ordered list of control points' }],
    outputs: [{ id: 'curve', name: 'Curve', type: 'curve', description: 'Resulting Bezier curve' }],
    controls: [],
    execute(context, inputs) {
      const pts = toList(inputs.points);
      return { curve: pts.length ? Geo.bezier(pts) : undefined };
    },
    codegen: {
      python: '{{curve}} = Geo.bezier({{points}})',
      csharp: 'var {{curve}} = Geo.bezier({{points}});'
    },
    help: {
      inputs: [{ name: 'Control Pts', description: 'List of Point3 control points' }],
      outputs: [{ name: 'Curve', description: 'Bezier curve' }],
      example: {
        title: 'Bezier S-curve length from 4 control points',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 5, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 7, y: -5, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 10, y: 0, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Bezier.ByControlPoints', x: 460, y: 90 },
          { type: 'Curve.Length', x: 680, y: 90 },
          { type: 'output-watch', x: 880, y: 90 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'points'],
          [5, 'curve', 6, 'curve'],
          [6, 'length', 7, 'value']
        ]
      },
      sampleCode: '{{curve}} = Geo.bezier({{points}})'
    }
  },

  // ─── Circle ──────────────────────────────────────────────
  {
    type: 'Circle.ByCenterRadius',
    name: 'Circle.ByCenterRadius',
    category: 'curves',
    subGroup: 'Circle',
    icon: '○',
    aliases: ['geo-circle'],
    description: 'Creates a full circle from a center point and a radius. Returns a Circle geometry that can be used directly by downstream curve operations.',
    inputs: [
      { id: 'center', name: 'Center', type: 'point', description: 'Center point of the circle' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Circle radius' }
    ],
    outputs: [{ id: 'circle', name: 'Circle', type: 'circle', description: 'Resulting Circle3 geometry' }],
    controls: [
      { id: 'plane', type: 'dropdown', options: ['XY', 'XZ', 'YZ'], default: 'XY', label: 'Plane' }
    ],
    execute(context, inputs) {
      const c = toPoint(inputs.center);
      const r = toNumber(inputs.radius, 5);
      return { circle: new Geo.Circle3(c, r) };
    },
    codegen: {
      python: '{{circle}} = Geo.Circle3({{center}}, {{radius}})',
      csharp: 'var {{circle}} = Geo.Circle3({{center}}, {{radius}});'
    },
    help: {
      inputs: [
        { name: 'Center', description: 'Center of the circle' },
        { name: 'Radius', description: 'Circle radius' }
      ],
      outputs: [{ name: 'Circle', description: 'Circle geometry' }],
      example: {
        title: 'Circumference of a radius-10 circle',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 30 },
          { type: 'Curve.Length', x: 460, y: 30 },
          { type: 'output-watch', x: 660, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'center'],
          [1, 'value', 2, 'radius'],
          [2, 'circle', 3, 'curve'],
          [3, 'length', 4, 'value']
        ]
      },
      sampleCode: '{{circle}} = Geo.Circle3({{center}}, {{radius}})'
    }
  },
  {
    type: 'Circle.ByCenterRadiusResolution',
    name: 'Circle.ByCenterRadiusResolution',
    category: 'curves',
    subGroup: 'Circle',
    icon: '◯',
    aliases: ['prof-circle'],
    description: 'Samples a circle as a list of Resolution points around its perimeter. Useful as input for Loft, Sweep, or Extrude operations that consume profiles as point lists.',
    inputs: [
      { id: 'center', name: 'Center', type: 'point', description: 'Center point of the circle' },
      { id: 'radius', name: 'Radius', type: 'number', description: 'Circle radius' },
      { id: 'resolution', name: 'Resolution', type: 'number', description: 'Number of sample points along the perimeter' }
    ],
    outputs: [{ id: 'profile', name: 'Profile', type: 'list', description: 'List of sample points around the circle' }],
    controls: [],
    execute(context, inputs) {
      const c = toPoint(inputs.center);
      const r = toNumber(inputs.radius, 5);
      const res = Math.max(8, Math.floor(toNumber(inputs.resolution, 32)));
      const pts = [];
      for (let j = 0; j < res; j++) {
        const a = 2 * Math.PI * j / res;
        pts.push(new Geo.Point3(c.x + r * Math.cos(a), c.y + r * Math.sin(a), c.z));
      }
      return { profile: pts };
    },
    codegen: {
      python: '{{profile}} = [Geo.Point3({{center}}.x + {{radius}} * math.cos(2*math.pi*j/int({{resolution}})), {{center}}.y + {{radius}} * math.sin(2*math.pi*j/int({{resolution}})), {{center}}.z) for j in range(int({{resolution}}))]',
      csharp: 'var {{profile}} = Enumerable.Range(0, (int){{resolution}}).Select(j => new Point3({{center}}.X + {{radius}} * Math.Cos(2 * Math.PI * j / (int){{resolution}}), {{center}}.Y + {{radius}} * Math.Sin(2 * Math.PI * j / (int){{resolution}}), {{center}}.Z)).ToList();'
    },
    help: {
      inputs: [
        { name: 'Center', description: 'Center point' },
        { name: 'Radius', description: 'Radius' },
        { name: 'Resolution', description: 'Sample count' }
      ],
      outputs: [{ name: 'Profile', description: 'Sampled point list' }],
      example: {
        title: 'Sample 24 points around a radius-5 circle',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 24 } },
          { type: 'Circle.ByCenterRadiusResolution', x: 240, y: 70 },
          { type: 'List.Count', x: 480, y: 70 },
          { type: 'output-watch', x: 680, y: 70 }
        ],
        wires: [
          [0, 'point', 3, 'center'],
          [1, 'value', 3, 'radius'],
          [2, 'value', 3, 'resolution'],
          [3, 'profile', 4, 'list'],
          [4, 'count', 5, 'value']
        ]
      },
      sampleCode: '{{profile}} = [Geo.Point3({{center}}.x + {{radius}} * math.cos(2*math.pi*j/N), {{center}}.y + {{radius}} * math.sin(2*math.pi*j/N), {{center}}.z) for j in range(N)]'
    }
  },

  // ─── Curve ───────────────────────────────────────────────
  {
    type: 'Curve.ChordDirection',
    name: 'Curve.ChordDirection',
    category: 'curves',
    subGroup: 'Curve',
    icon: '→',
    aliases: ['curve-chord-direction'],
    description: 'Returns the unit direction vector from the curve start point to its end point. Works on every curve type (line, arc, polyline, NURBS, circle).',
    inputs: [{ id: 'curve', name: 'Curve', type: 'any', description: 'Any curve geometry' }],
    outputs: [{ id: 'direction', name: 'Direction', type: 'vector', description: 'Unit vector from start to end' }],
    controls: [],
    execute(context, inputs) {
      return { direction: curveDir(inputs.curve) };
    },
    codegen: {
      python: '{{direction}} = {{curve}}.chordDirection()',
      csharp: 'var {{direction}} = {{curve}}.chordDirection();'
    },
    help: {
      inputs: [{ name: 'Curve', description: 'Any curve type' }],
      outputs: [{ name: 'Direction', description: 'Unit direction vector' }],
      example: {
        title: 'Chord direction of a line from (0,0,0) to (3,4,0)',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Curve.ChordDirection', x: 460, y: 30 },
          { type: 'output-watch', x: 680, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 3, 'curve'],
          [3, 'direction', 4, 'value']
        ]
      },
      sampleCode: '{{direction}} = {{curve}}.chordDirection()'
    }
  },
  {
    type: 'Curve.Deconstruct',
    name: 'Curve.Deconstruct',
    category: 'curves',
    subGroup: 'Curve',
    icon: '⊙',
    aliases: ['curve-deconstruct'],
    description: 'Decomposes any curve into its core properties: start point, end point, length, midpoint and chord direction. Useful as a one-stop introspection node.',
    inputs: [{ id: 'curve', name: 'Curve', type: 'any', description: 'Any curve geometry' }],
    outputs: [
      { id: 'start', name: 'Start', type: 'point', description: 'Start point of the curve' },
      { id: 'end', name: 'End', type: 'point', description: 'End point of the curve' },
      { id: 'length', name: 'Length', type: 'number', description: 'Total arc length of the curve' },
      { id: 'midpoint', name: 'MidPoint', type: 'point', description: 'Geometric midpoint of the curve' },
      { id: 'direction', name: 'ChordDir', type: 'vector', description: 'Unit direction vector from start to end' }
    ],
    controls: [],
    execute(context, inputs) {
      const c = inputs.curve;
      return {
        start: curveStart(c),
        end: curveEnd(c),
        length: curveLen(c),
        midpoint: curveMid(c),
        direction: curveDir(c)
      };
    },
    codegen: {
      python: '{{start}} = {{curve}}.pointAt(0)\n{{end}} = {{curve}}.pointAt(1)\n{{length}} = {{curve}}.length()\n{{midpoint}} = {{curve}}.getCenter()\n{{direction}} = {{curve}}.chordDirection()',
      csharp: 'var {{start}} = {{curve}}.pointAt(0); var {{end}} = {{curve}}.pointAt(1); var {{length}} = {{curve}}.length(); var {{midpoint}} = {{curve}}.getCenter(); var {{direction}} = {{curve}}.chordDirection();'
    },
    help: {
      inputs: [{ name: 'Curve', description: 'Curve to deconstruct' }],
      outputs: [
        { name: 'Start', description: 'Start point' },
        { name: 'End', description: 'End point' },
        { name: 'Length', description: 'Arc length' },
        { name: 'MidPoint', description: 'Midpoint' },
        { name: 'ChordDir', description: 'Chord direction' }
      ],
      example: {
        title: 'Deconstruct a 3-4-5 line, watch the length',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Curve.Deconstruct', x: 460, y: 30 },
          { type: 'output-watch', x: 680, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 3, 'curve'],
          [3, 'length', 4, 'value']
        ]
      },
      sampleCode: '{{start}} = {{curve}}.pointAt(0); {{length}} = {{curve}}.length()'
    }
  },
  {
    type: 'Curve.EndPoint',
    name: 'Curve.EndPoint',
    category: 'curves',
    subGroup: 'Curve',
    icon: '◑',
    aliases: ['curve-endpoint'],
    description: 'Returns the end point of a curve (parameter t=1). For lines this is the second endpoint; for arcs and polylines it is the terminal point of the curve.',
    inputs: [{ id: 'curve', name: 'Curve', type: 'any', description: 'Any curve geometry' }],
    outputs: [{ id: 'point', name: 'Point', type: 'point', description: 'End point of the curve' }],
    controls: [],
    execute(context, inputs) {
      return { point: curveEnd(inputs.curve) };
    },
    codegen: {
      python: '{{point}} = {{curve}}.pointAt(1)',
      csharp: 'var {{point}} = {{curve}}.pointAt(1);'
    },
    help: {
      inputs: [{ name: 'Curve', description: 'Any curve type' }],
      outputs: [{ name: 'Point', description: 'End point' }],
      example: {
        title: 'End point of a 3-4-5 line',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Curve.EndPoint', x: 460, y: 30 },
          { type: 'output-watch', x: 660, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 3, 'curve'],
          [3, 'point', 4, 'value']
        ]
      },
      sampleCode: '{{point}} = {{curve}}.pointAt(1)'
    }
  },
  {
    type: 'Curve.Length',
    name: 'Curve.Length',
    category: 'curves',
    subGroup: 'Curve',
    icon: '⟷',
    aliases: ['curve-length'],
    description: 'Returns the total arc length of the curve. For lines this equals the chord length; for arcs and NURBS it is the integrated length along the curve.',
    inputs: [{ id: 'curve', name: 'Curve', type: 'any', description: 'Any curve geometry' }],
    outputs: [{ id: 'length', name: 'Length', type: 'number', description: 'Total arc length' }],
    controls: [],
    execute(context, inputs) {
      return { length: curveLen(inputs.curve) };
    },
    codegen: {
      python: '{{length}} = {{curve}}.length()',
      csharp: 'var {{length}} = {{curve}}.length();'
    },
    help: {
      inputs: [{ name: 'Curve', description: 'Any curve type' }],
      outputs: [{ name: 'Length', description: 'Arc length' }],
      example: {
        title: 'Length of a 3-4-5 line',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Curve.Length', x: 460, y: 30 },
          { type: 'output-watch', x: 660, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 3, 'curve'],
          [3, 'length', 4, 'value']
        ]
      },
      sampleCode: '{{length}} = {{curve}}.length()'
    }
  },
  {
    type: 'Curve.StartPoint',
    name: 'Curve.StartPoint',
    category: 'curves',
    subGroup: 'Curve',
    icon: '◐',
    aliases: ['curve-startpoint'],
    description: 'Returns the start point of a curve (parameter t=0). For lines this is the first endpoint; for arcs and polylines it is the origin point of the curve.',
    inputs: [{ id: 'curve', name: 'Curve', type: 'any', description: 'Any curve geometry' }],
    outputs: [{ id: 'point', name: 'Point', type: 'point', description: 'Start point of the curve' }],
    controls: [],
    execute(context, inputs) {
      return { point: curveStart(inputs.curve) };
    },
    codegen: {
      python: '{{point}} = {{curve}}.pointAt(0)',
      csharp: 'var {{point}} = {{curve}}.pointAt(0);'
    },
    help: {
      inputs: [{ name: 'Curve', description: 'Any curve type' }],
      outputs: [{ name: 'Point', description: 'Start point' }],
      example: {
        title: 'Start point of a 3-4-5 line',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Curve.StartPoint', x: 460, y: 30 },
          { type: 'output-watch', x: 660, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 3, 'curve'],
          [3, 'point', 4, 'value']
        ]
      },
      sampleCode: '{{point}} = {{curve}}.pointAt(0)'
    }
  },
  {
    type: 'Curve.TangentAtPoint',
    name: 'Curve.TangentAtPoint',
    category: 'curves',
    subGroup: 'Curve',
    icon: '↗',
    aliases: ['curve-tangent'],
    description: 'Returns the tangent direction at parameter t along the curve. t=0 is the start, t=0.5 the midpoint, t=1 the end. For lines tangent equals chord direction at every t.',
    inputs: [
      { id: 'curve', name: 'Curve', type: 'any', description: 'Any curve geometry' },
      { id: 'param', name: 'Parameter t', type: 'number', description: 'Position along the curve, in [0, 1]' }
    ],
    outputs: [{ id: 'tangent', name: 'Tangent', type: 'vector', description: 'Tangent vector at parameter t' }],
    controls: [{ id: 'param', type: 'formula', default: '0.5', label: 't' }],
    execute(context, inputs) {
      return { tangent: curveTangent(inputs.curve, toNumber(inputs.param, 0.5)) };
    },
    codegen: {
      python: '{{tangent}} = {{curve}}.tangentAt({{param}})',
      csharp: 'var {{tangent}} = {{curve}}.tangentAt({{param}});'
    },
    help: {
      inputs: [
        { name: 'Curve', description: 'Any curve type' },
        { name: 'Parameter t', description: 'Position along the curve' }
      ],
      outputs: [{ name: 'Tangent', description: 'Tangent vector' }],
      example: {
        title: 'Tangent at the midpoint of a 3-4-5 line',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Input.Number', x: 240, y: 150, controls: { val: 0.5 } },
          { type: 'Curve.TangentAtPoint', x: 460, y: 80 },
          { type: 'output-watch', x: 680, y: 80 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 4, 'curve'],
          [3, 'value', 4, 'param'],
          [4, 'tangent', 5, 'value']
        ]
      },
      sampleCode: '{{tangent}} = {{curve}}.tangentAt({{param}})'
    }
  },

  // ─── Ellipse ─────────────────────────────────────────────
  {
    type: 'Ellipse.ByCenterWidthDepth',
    name: 'Ellipse.ByCenterWidthDepth',
    category: 'curves',
    subGroup: 'Ellipse',
    icon: '⬭',
    aliases: ['prof-ellipse'],
    description: 'Samples an ellipse from a center point, a width (X span), a depth (Y span), an in-plane rotation in degrees, and a perimeter resolution. Returns a list of points usable for Loft, Sweep, or Extrude.',
    inputs: [
      { id: 'center', name: 'Center', type: 'point', description: 'Center point of the ellipse' },
      { id: 'width', name: 'Width', type: 'number', description: 'Total span along the local X axis' },
      { id: 'depth', name: 'Depth', type: 'number', description: 'Total span along the local Y axis' },
      { id: 'rotation', name: 'Rotation°', type: 'number', description: 'In-plane rotation, in degrees' },
      { id: 'resolution', name: 'Resolution', type: 'number', description: 'Number of sample points along the perimeter' }
    ],
    outputs: [{ id: 'profile', name: 'Profile', type: 'list', description: 'List of sample points around the ellipse' }],
    controls: [],
    execute(context, inputs) {
      const c = toPoint(inputs.center);
      const w = toNumber(inputs.width, 10) / 2;
      const d = toNumber(inputs.depth, 6) / 2;
      const rot = toNumber(inputs.rotation, 0) * Math.PI / 180;
      const res = Math.max(8, Math.floor(toNumber(inputs.resolution, 32)));
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const pts = [];
      for (let j = 0; j < res; j++) {
        const a = 2 * Math.PI * j / res;
        const x = w * Math.cos(a);
        const y = d * Math.sin(a);
        pts.push(new Geo.Point3(c.x + x * cosR - y * sinR, c.y + x * sinR + y * cosR, c.z));
      }
      return { profile: pts };
    },
    codegen: {
      python: 'pts = []\nfor j in range(int({{resolution}})):\n    a = 2 * math.pi * j / int({{resolution}})\n    x = {{width}}/2 * math.cos(a)\n    y = {{depth}}/2 * math.sin(a)\n    r = math.radians({{rotation}})\n    pts.append(Geo.Point3({{center}}.x + x*math.cos(r) - y*math.sin(r), {{center}}.y + x*math.sin(r) + y*math.cos(r), {{center}}.z))\n{{profile}} = pts',
      csharp: 'var {{profile}} = Enumerable.Range(0, (int){{resolution}}).Select(j => { double a = 2*Math.PI*j/(int){{resolution}}; double x = {{width}}/2*Math.Cos(a); double y = {{depth}}/2*Math.Sin(a); double r = {{rotation}}*Math.PI/180; return new Point3({{center}}.X + x*Math.Cos(r) - y*Math.Sin(r), {{center}}.Y + x*Math.Sin(r) + y*Math.Cos(r), {{center}}.Z); }).ToList();'
    },
    help: {
      inputs: [
        { name: 'Center', description: 'Center point' },
        { name: 'Width', description: 'Span along X' },
        { name: 'Depth', description: 'Span along Y' },
        { name: 'Rotation°', description: 'In-plane rotation' },
        { name: 'Resolution', description: 'Sample count' }
      ],
      outputs: [{ name: 'Profile', description: 'Sampled point list' }],
      example: {
        title: 'Sample a 10x6 ellipse into 24 points, count them',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 290, controls: { val: 24 } },
          { type: 'Ellipse.ByCenterWidthDepth', x: 240, y: 150 },
          { type: 'List.Count', x: 480, y: 150 },
          { type: 'output-watch', x: 680, y: 150 }
        ],
        wires: [
          [0, 'point', 5, 'center'],
          [1, 'value', 5, 'width'],
          [2, 'value', 5, 'depth'],
          [3, 'value', 5, 'rotation'],
          [4, 'value', 5, 'resolution'],
          [5, 'profile', 6, 'list'],
          [6, 'count', 7, 'value']
        ]
      },
      sampleCode: 'pts = [Geo.Point3({{center}}.x + x*cos(r) - y*sin(r), {{center}}.y + x*sin(r) + y*cos(r), {{center}}.z) for j in range(N)]'
    }
  },

  // ─── Line ────────────────────────────────────────────────
  {
    type: 'Line.ByPointAndDirection',
    name: 'Line.ByPointAndDirection',
    category: 'curves',
    subGroup: 'Line',
    icon: '⟶',
    aliases: ['line-bypointanddirection'],
    description: 'Creates a straight line from an origin point, a direction vector, and a length. The direction is automatically normalised before scaling by length.',
    inputs: [
      { id: 'origin', name: 'Origin', type: 'point', description: 'Start point of the line' },
      { id: 'direction', name: 'Direction', type: 'vector', description: 'Direction vector (normalised internally)' },
      { id: 'length', name: 'Length', type: 'number', description: 'Resulting line length' }
    ],
    outputs: [{ id: 'line', name: 'Line', type: 'line', description: 'Resulting line geometry' }],
    controls: [{ id: 'length', type: 'formula', default: '10', label: 'Length' }],
    execute(context, inputs) {
      const origin = toPoint(inputs.origin);
      const dir = inputs.direction || new Geo.Vector3(1, 0, 0);
      const len = toNumber(inputs.length, 10);
      const normalized = typeof dir.normalize === 'function' ? dir.normalize() : dir;
      const scaled = typeof normalized.scale === 'function' ? normalized.scale(len) : new Geo.Vector3(normalized.x * len, normalized.y * len, normalized.z * len);
      return { line: new Geo.Line3(origin, origin.add(scaled)) };
    },
    codegen: {
      python: '{{line}} = Geo.Line3({{origin}}, {{origin}}.add({{direction}}.normalize().scale({{length}})))',
      csharp: 'var {{line}} = Geo.Line3({{origin}}, {{origin}}.add({{direction}}.normalize().scale({{length}})));'
    },
    help: {
      inputs: [
        { name: 'Origin', description: 'Start point' },
        { name: 'Direction', description: 'Direction vector' },
        { name: 'Length', description: 'Line length' }
      ],
      outputs: [{ name: 'Line', description: 'Resulting line' }],
      example: {
        title: 'A 5-unit line from origin along X, length confirmed',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 5 } },
          { type: 'Line.ByPointAndDirection', x: 240, y: 60 },
          { type: 'Curve.Length', x: 460, y: 60 },
          { type: 'output-watch', x: 660, y: 60 }
        ],
        wires: [
          [0, 'point', 3, 'origin'],
          [1, 'point', 3, 'direction'],
          [2, 'value', 3, 'length'],
          [3, 'line', 4, 'curve'],
          [4, 'length', 5, 'value']
        ]
      },
      sampleCode: '{{line}} = Geo.Line3({{origin}}, {{origin}}.add({{direction}}.normalize().scale({{length}})))'
    }
  },
  {
    type: 'Line.ByStartPointEndPoint',
    name: 'Line.ByStartPointEndPoint',
    category: 'curves',
    subGroup: 'Line',
    icon: '╱',
    aliases: ['line-bystartpointendpoint'],
    description: 'Creates a straight line segment between two given points. The simplest way to construct a line: pick two endpoints, get the segment.',
    inputs: [
      { id: 'startPoint', name: 'Start Point', type: 'point', description: 'Start endpoint' },
      { id: 'endPoint', name: 'End Point', type: 'point', description: 'End endpoint' }
    ],
    outputs: [{ id: 'line', name: 'Line', type: 'line', description: 'Resulting line geometry' }],
    controls: [],
    execute(context, inputs) {
      return { line: new Geo.Line3(toPoint(inputs.startPoint), toPoint(inputs.endPoint, new Geo.Point3(1, 0, 0))) };
    },
    codegen: {
      python: '{{line}} = Geo.Line3({{startPoint}}, {{endPoint}})',
      csharp: 'var {{line}} = Geo.Line3({{startPoint}}, {{endPoint}});'
    },
    help: {
      inputs: [
        { name: 'Start Point', description: 'Start endpoint' },
        { name: 'End Point', description: 'End endpoint' }
      ],
      outputs: [{ name: 'Line', description: 'Resulting line' }],
      example: {
        title: '3-4-5 line, length confirmed',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Curve.Length', x: 460, y: 30 },
          { type: 'output-watch', x: 660, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [2, 'line', 3, 'curve'],
          [3, 'length', 4, 'value']
        ]
      },
      sampleCode: '{{line}} = Geo.Line3({{startPoint}}, {{endPoint}})'
    }
  },

  // ─── NURBS ───────────────────────────────────────────────
  {
    type: 'NURBS.ByControlPoints',
    name: 'NURBS.ByControlPoints',
    category: 'curves',
    subGroup: 'NURBS',
    icon: '〰',
    aliases: ['nurbs-curve'],
    description: 'Creates a NURBS curve from control points and a degree. The curve is attracted toward control points but does not pass through them (except endpoints). Degree controls smoothness; 3 is standard.',
    inputs: [
      { id: 'points', name: 'Control Pts', type: 'list', description: 'Ordered list of control points' },
      { id: 'degree', name: 'Degree', type: 'number', description: 'NURBS degree (typically 2 or 3)' }
    ],
    outputs: [{ id: 'curve', name: 'Curve', type: 'curve', description: 'Resulting NURBS curve' }],
    controls: [{ id: 'degree', type: 'formula', default: '3', label: 'Degree' }],
    execute(context, inputs) {
      const pts = toList(inputs.points);
      const degree = Math.max(1, Math.floor(toNumber(inputs.degree, 3)));
      return { curve: pts.length ? Geo.createNurbsCurve(pts, degree) : undefined };
    },
    codegen: {
      python: '{{curve}} = Geo.createNurbsCurve({{points}}, {{degree}})',
      csharp: 'var {{curve}} = Geo.createNurbsCurve({{points}}, (int){{degree}});'
    },
    help: {
      inputs: [
        { name: 'Control Pts', description: 'Control point list' },
        { name: 'Degree', description: 'NURBS degree' }
      ],
      outputs: [{ name: 'Curve', description: 'NURBS curve' }],
      example: {
        title: 'NURBS curve length from 4 control points (degree 3)',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 5, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 7, y: -5, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 10, y: 0, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Input.Number', x: 240, y: 210, controls: { val: 3 } },
          { type: 'NURBS.ByControlPoints', x: 460, y: 140 },
          { type: 'Curve.Length', x: 680, y: 140 },
          { type: 'output-watch', x: 880, y: 140 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 6, 'points'],
          [5, 'value', 6, 'degree'],
          [6, 'curve', 7, 'curve'],
          [7, 'length', 8, 'value']
        ]
      },
      sampleCode: '{{curve}} = Geo.createNurbsCurve({{points}}, {{degree}})'
    }
  },
  {
    type: 'NURBS.Interpolate',
    name: 'NURBS.Interpolate',
    category: 'curves',
    subGroup: 'NURBS',
    icon: '∽',
    aliases: ['nurbs-interpolate'],
    description: 'Creates a NURBS curve that passes through every given point with a specified degree. Unlike control-point NURBS, this one is exactly anchored at each input point.',
    inputs: [
      { id: 'points', name: 'Through Pts', type: 'list', description: 'Ordered list of points the curve must pass through' },
      { id: 'degree', name: 'Degree', type: 'number', description: 'NURBS degree (typically 2 or 3)' }
    ],
    outputs: [{ id: 'curve', name: 'Curve', type: 'curve', description: 'Interpolating NURBS curve' }],
    controls: [{ id: 'degree', type: 'formula', default: '3', label: 'Degree' }],
    execute(context, inputs) {
      const pts = toList(inputs.points);
      const degree = Math.max(1, Math.floor(toNumber(inputs.degree, 3)));
      return { curve: pts.length ? Geo.nurbsInterpolate(pts, degree) : undefined };
    },
    codegen: {
      python: '{{curve}} = Geo.nurbsInterpolate({{points}}, {{degree}})',
      csharp: 'var {{curve}} = Geo.nurbsInterpolate({{points}}, (int){{degree}});'
    },
    help: {
      inputs: [
        { name: 'Through Pts', description: 'Anchor points' },
        { name: 'Degree', description: 'NURBS degree' }
      ],
      outputs: [{ name: 'Curve', description: 'Interpolated curve' }],
      example: {
        title: 'NURBS interpolated through 4 points, length',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 5, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 7, y: -5, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 10, y: 0, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Input.Number', x: 240, y: 210, controls: { val: 3 } },
          { type: 'NURBS.Interpolate', x: 460, y: 140 },
          { type: 'Curve.Length', x: 680, y: 140 },
          { type: 'output-watch', x: 880, y: 140 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 6, 'points'],
          [5, 'value', 6, 'degree'],
          [6, 'curve', 7, 'curve'],
          [7, 'length', 8, 'value']
        ]
      },
      sampleCode: '{{curve}} = Geo.nurbsInterpolate({{points}}, {{degree}})'
    }
  },

  // ─── Polyline ────────────────────────────────────────────
  {
    type: 'Polyline.ByPoints',
    name: 'Polyline.ByPoints',
    category: 'curves',
    subGroup: 'Polyline',
    icon: '⏣',
    aliases: ['surf-polyline'],
    description: 'Creates a polyline that walks through a list of points with straight segments. Set Closed to true to connect the final point back to the first.',
    inputs: [
      { id: 'points', name: 'Points', type: 'list', description: 'Ordered list of points' },
      { id: 'closed', name: 'Closed', type: 'boolean', description: 'When true, the polyline closes back to its first point' }
    ],
    outputs: [{ id: 'polyline', name: 'Polyline', type: 'curve', description: 'Resulting polyline' }],
    controls: [],
    execute(context, inputs) {
      const pts = toList(inputs.points);
      if (!pts.length) return { polyline: undefined };
      return { polyline: new Geo.Polyline3(pts, !!inputs.closed) };
    },
    codegen: {
      python: '{{polyline}} = Geo.Polyline3({{points}}, {{closed}})',
      csharp: 'var {{polyline}} = Geo.Polyline3({{points}}, {{closed}});'
    },
    help: {
      inputs: [
        { name: 'Points', description: 'Ordered point list' },
        { name: 'Closed', description: 'Close to first point' }
      ],
      outputs: [{ name: 'Polyline', description: 'Resulting polyline' }],
      example: {
        title: 'Perimeter of a unit-square polyline',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 1, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0, y: 1, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Input.Boolean', x: 240, y: 210, controls: { val: 'True' } },
          { type: 'Polyline.ByPoints', x: 460, y: 140 },
          { type: 'Curve.Length', x: 680, y: 140 },
          { type: 'output-watch', x: 880, y: 140 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 6, 'points'],
          [5, 'value', 6, 'closed'],
          [6, 'polyline', 7, 'curve'],
          [7, 'length', 8, 'value']
        ]
      },
      sampleCode: '{{polyline}} = Geo.Polyline3({{points}}, {{closed}})'
    }
  },

  // ─── Rectangle ───────────────────────────────────────────
  {
    type: 'Rectangle.ByCenterWidthDepth',
    name: 'Rectangle.ByCenterWidthDepth',
    category: 'curves',
    subGroup: 'Rectangle',
    icon: '▭',
    aliases: ['prof-rect'],
    description: 'Returns the 4 corner points of a rectangle centred on the given point, spanning Width along X and Depth along Y. Useful as input for Loft, Sweep, or Extrude.',
    inputs: [
      { id: 'center', name: 'Center', type: 'point', description: 'Center point of the rectangle' },
      { id: 'width', name: 'Width', type: 'number', description: 'Total span along X' },
      { id: 'depth', name: 'Depth', type: 'number', description: 'Total span along Y' }
    ],
    outputs: [{ id: 'profile', name: 'Profile', type: 'list', description: 'List of 4 corner points (CCW from lower-left)' }],
    controls: [],
    execute(context, inputs) {
      const c = toPoint(inputs.center);
      const w = toNumber(inputs.width, 10) / 2;
      const d = toNumber(inputs.depth, 6) / 2;
      return {
        profile: [
          new Geo.Point3(c.x - w, c.y - d, c.z),
          new Geo.Point3(c.x + w, c.y - d, c.z),
          new Geo.Point3(c.x + w, c.y + d, c.z),
          new Geo.Point3(c.x - w, c.y + d, c.z)
        ]
      };
    },
    codegen: {
      python: '{{profile}} = [Geo.Point3({{center}}.x - {{width}}/2, {{center}}.y - {{depth}}/2, {{center}}.z), Geo.Point3({{center}}.x + {{width}}/2, {{center}}.y - {{depth}}/2, {{center}}.z), Geo.Point3({{center}}.x + {{width}}/2, {{center}}.y + {{depth}}/2, {{center}}.z), Geo.Point3({{center}}.x - {{width}}/2, {{center}}.y + {{depth}}/2, {{center}}.z)]',
      csharp: 'var {{profile}} = new List<Point3> { new Point3({{center}}.X - {{width}}/2, {{center}}.Y - {{depth}}/2, {{center}}.Z), new Point3({{center}}.X + {{width}}/2, {{center}}.Y - {{depth}}/2, {{center}}.Z), new Point3({{center}}.X + {{width}}/2, {{center}}.Y + {{depth}}/2, {{center}}.Z), new Point3({{center}}.X - {{width}}/2, {{center}}.Y + {{depth}}/2, {{center}}.Z) };'
    },
    help: {
      inputs: [
        { name: 'Center', description: 'Center point' },
        { name: 'Width', description: 'Span along X' },
        { name: 'Depth', description: 'Span along Y' }
      ],
      outputs: [{ name: 'Profile', description: 'Corner point list' }],
      example: {
        title: '4 corners of a 10×6 rectangle',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 6 } },
          { type: 'Rectangle.ByCenterWidthDepth', x: 240, y: 70 },
          { type: 'List.Count', x: 480, y: 70 },
          { type: 'output-watch', x: 680, y: 70 }
        ],
        wires: [
          [0, 'point', 3, 'center'],
          [1, 'value', 3, 'width'],
          [2, 'value', 3, 'depth'],
          [3, 'profile', 4, 'list'],
          [4, 'count', 5, 'value']
        ]
      },
      sampleCode: '{{profile}} = [Geo.Point3({{center}}.x - {{width}}/2, {{center}}.y - {{depth}}/2, {{center}}.z), ...]'
    }
  },

  // ─── Utilities ───────────────────────────────────────────
  {
    type: 'Utilities.Blend',
    name: 'Utilities.Blend',
    category: 'curves',
    subGroup: 'Utilities',
    icon: '↹',
    aliases: ['nurbs-blend'],
    description: 'Blends between two curves at parameter t. t=0 returns Curve A, t=1 returns Curve B, intermediate values produce a smooth blend.',
    inputs: [
      { id: 'curve1', name: 'Curve A', type: 'any', description: 'First curve' },
      { id: 'curve2', name: 'Curve B', type: 'any', description: 'Second curve' },
      { id: 't', name: 'Blend (0-1)', type: 'number', description: 'Blend parameter: 0=A, 1=B, 0.5=halfway' }
    ],
    outputs: [{ id: 'curve', name: 'Curve', type: 'curve', description: 'Blended curve' }],
    controls: [],
    execute(context, inputs) {
      if (!inputs.curve1 || !inputs.curve2) return { curve: undefined };
      return { curve: Geo.blendCurves(inputs.curve1, inputs.curve2, toNumber(inputs.t, 0.5)) };
    },
    codegen: {
      python: '{{curve}} = Geo.blendCurves({{curve1}}, {{curve2}}, {{t}})',
      csharp: 'var {{curve}} = Geo.blendCurves({{curve1}}, {{curve2}}, {{t}});'
    },
    help: {
      inputs: [
        { name: 'Curve A', description: 'First curve' },
        { name: 'Curve B', description: 'Second curve' },
        { name: 'Blend (0-1)', description: 'Blend parameter' }
      ],
      outputs: [{ name: 'Curve', description: 'Blended curve' }],
      example: {
        title: 'Blend two lines at midpoint, measure length',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 10, y: 0, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.ByCoordinates', x: 0, y: 160, controls: { x: 0, y: 10, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 230, controls: { x: 10, y: 10, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 190 },
          { type: 'Input.Number', x: 240, y: 310, controls: { val: 0.5 } },
          { type: 'Utilities.Blend', x: 460, y: 100 },
          { type: 'Curve.Length', x: 680, y: 100 },
          { type: 'output-watch', x: 880, y: 100 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [3, 'point', 5, 'startPoint'],
          [4, 'point', 5, 'endPoint'],
          [2, 'line', 7, 'curve1'],
          [5, 'line', 7, 'curve2'],
          [6, 'value', 7, 't'],
          [7, 'curve', 8, 'curve'],
          [8, 'length', 9, 'value']
        ]
      },
      sampleCode: '{{curve}} = Geo.blendCurves({{curve1}}, {{curve2}}, {{t}})'
    }
  },
  {
    type: 'Utilities.Interpolate',
    name: 'Utilities.Interpolate',
    category: 'curves',
    subGroup: 'Utilities',
    icon: '⌇',
    aliases: ['op-interpolate'],
    description: 'Creates a smooth curve passing through every given point. Unlike Bezier, the curve goes through every anchor point exactly — ideal for path tracing.',
    inputs: [{ id: 'points', name: 'Points', type: 'list', description: 'Ordered anchor points the curve must pass through' }],
    outputs: [{ id: 'curve', name: 'Curve', type: 'curve', description: 'Smooth interpolating curve' }],
    controls: [],
    execute(context, inputs) {
      const pts = toList(inputs.points);
      return { curve: pts.length ? Geo.interpolate(pts) : undefined };
    },
    codegen: {
      python: '{{curve}} = Geo.interpolate({{points}})',
      csharp: 'var {{curve}} = Geo.interpolate({{points}});'
    },
    help: {
      inputs: [{ name: 'Points', description: 'Anchor points' }],
      outputs: [{ name: 'Curve', description: 'Interpolating curve' }],
      example: {
        title: 'Interpolate through 4 points, measure length',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 3, y: 5, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 7, y: -5, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 10, y: 0, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Utilities.Interpolate', x: 460, y: 90 },
          { type: 'Curve.Length', x: 680, y: 90 },
          { type: 'output-watch', x: 880, y: 90 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'points'],
          [5, 'curve', 6, 'curve'],
          [6, 'length', 7, 'value']
        ]
      },
      sampleCode: '{{curve}} = Geo.interpolate({{points}})'
    }
  },
  {
    type: 'Utilities.Tween',
    name: 'Utilities.Tween',
    category: 'curves',
    subGroup: 'Utilities',
    icon: '≋',
    aliases: ['nurbs-tween'],
    description: 'Generates Count intermediate curves evenly spaced between two boundary curves. Useful for floor plates, transition profiles, or surface grids built from curve sweeps.',
    inputs: [
      { id: 'curve1', name: 'Curve A', type: 'any', description: 'First boundary curve' },
      { id: 'curve2', name: 'Curve B', type: 'any', description: 'Second boundary curve' },
      { id: 'count', name: 'Count', type: 'number', description: 'Number of intermediate curves to produce' }
    ],
    outputs: [{ id: 'curves', name: 'Curves', type: 'list', description: 'List of intermediate curves' }],
    controls: [],
    execute(context, inputs) {
      if (!inputs.curve1 || !inputs.curve2) return { curves: [] };
      return { curves: Geo.tweenCurves(inputs.curve1, inputs.curve2, Math.max(0, Math.floor(toNumber(inputs.count, 5)))) };
    },
    codegen: {
      python: '{{curves}} = Geo.tweenCurves({{curve1}}, {{curve2}}, {{count}})',
      csharp: 'var {{curves}} = Geo.tweenCurves({{curve1}}, {{curve2}}, (int){{count}});'
    },
    help: {
      inputs: [
        { name: 'Curve A', description: 'First boundary' },
        { name: 'Curve B', description: 'Second boundary' },
        { name: 'Count', description: 'Number of tween curves' }
      ],
      outputs: [{ name: 'Curves', description: 'Tween curve list' }],
      example: {
        title: 'Tween 5 curves between two parallel lines',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 10, y: 0, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Point.ByCoordinates', x: 0, y: 160, controls: { x: 0, y: 10, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 230, controls: { x: 10, y: 10, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 190 },
          { type: 'Input.Number', x: 240, y: 310, controls: { val: 5 } },
          { type: 'Utilities.Tween', x: 460, y: 100 },
          { type: 'List.Count', x: 680, y: 100 },
          { type: 'output-watch', x: 880, y: 100 }
        ],
        wires: [
          [0, 'point', 2, 'startPoint'],
          [1, 'point', 2, 'endPoint'],
          [3, 'point', 5, 'startPoint'],
          [4, 'point', 5, 'endPoint'],
          [2, 'line', 7, 'curve1'],
          [5, 'line', 7, 'curve2'],
          [6, 'value', 7, 'count'],
          [7, 'curves', 8, 'list'],
          [8, 'count', 9, 'value']
        ]
      },
      sampleCode: '{{curves}} = Geo.tweenCurves({{curve1}}, {{curve2}}, {{count}})'
    }
  }
];
