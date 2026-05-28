import { Geo } from '../../geometry/index.js';

export const surfacesCategory = {
  id: 'surfaces',
  name: 'Surfaces',
  color: '#94e2d5',
  icon: '◇'
};

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}
function toInteger(value, fallback = 0) {
  return Math.max(1, Math.floor(toNumber(value, fallback)));
}
function toList(value) {
  return Array.isArray(value) ? value : [];
}
function toVector(value, fallback = new Geo.Vector3(0, 0, 1)) {
  if (value instanceof Geo.Vector3) return value;
  if (value && typeof value === 'object' && value.x !== undefined) {
    return new Geo.Vector3(value.x || 0, value.y || 0, value.z || 0);
  }
  return fallback;
}

export const surfacesNodes = [
  // ─── Creation ────────────────────────────────────────────
  {
    type: 'Surface.ByPatch',
    name: 'Surface.ByPatch',
    category: 'surfaces',
    subGroup: 'Creation',
    icon: '⏥',
    aliases: ['surf-patch'],
    description: 'Fills the interior of a single closed boundary (a closed curve or an ordered list of points) by fan-triangulating from the centroid. Produces a mesh suitable for shading, intersection, and downstream patch operations.',
    inputs: [
      { id: 'boundary', name: 'Boundary', type: 'any', description: 'Closed curve or ordered list of points forming the patch outline' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Triangulated patch mesh' }],
    controls: [
      { id: 'segments', type: 'formula', default: '32', label: 'Segments' }
    ],
    execute(context, inputs, controls) {
      const boundary = inputs.boundary;
      if (boundary == null) return { surface: undefined };
      return { surface: Geo.surfaceByPatch(boundary, toInteger(controls.segments, 32)) };
    },
    codegen: {
      python: '{{surface}} = Geo.surfaceByPatch({{boundary}}, int({{ctrl.segments}}))',
      csharp: 'var {{surface}} = Geo.surfaceByPatch({{boundary}}, (int){{ctrl.segments}});'
    },
    help: {
      inputs: [{ name: 'Boundary', description: 'Closed curve or point list' }],
      outputs: [{ name: 'Surface', description: 'Patch mesh' }],
      example: {
        title: 'Patch a unit-square boundary — 4 face triangles',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 1, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 0, y: 1, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Surface.ByPatch', x: 460, y: 90 },
          { type: 'output-watch', x: 660, y: 90 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 5, 'boundary'],
          [5, 'surface', 6, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.surfaceByPatch({{boundary}})'
    }
  },
  {
    type: 'Surface.ByCoonsPatch',
    name: 'Surface.ByCoonsPatch',
    category: 'surfaces',
    subGroup: 'Creation',
    icon: '⊟',
    aliases: ['surf-coons'],
    description: 'Builds a Coons patch surface from four boundary curves arranged as two opposite U pairs and two opposite V pairs. Interior points are derived from a bilinear blend of the boundary parameterisations.',
    inputs: [
      { id: 'curveU0', name: 'U-0', type: 'any', description: 'First U-direction boundary curve' },
      { id: 'curveU1', name: 'U-1', type: 'any', description: 'Second U-direction boundary curve' },
      { id: 'curveV0', name: 'V-0', type: 'any', description: 'First V-direction boundary curve' },
      { id: 'curveV1', name: 'V-1', type: 'any', description: 'Second V-direction boundary curve' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Coons patch mesh' }],
    controls: [
      { id: 'uSegments', type: 'formula', default: '20', label: 'U Segments' },
      { id: 'vSegments', type: 'formula', default: '20', label: 'V Segments' }
    ],
    execute(context, inputs, controls) {
      if (inputs.curveU0 == null || inputs.curveU1 == null || inputs.curveV0 == null || inputs.curveV1 == null) {
        return { surface: undefined };
      }
      return {
        surface: Geo.coonsPatch(
          inputs.curveU0,
          inputs.curveU1,
          inputs.curveV0,
          inputs.curveV1,
          toInteger(controls.uSegments, 20),
          toInteger(controls.vSegments, 20)
        )
      };
    },
    codegen: {
      python: '{{surface}} = Geo.coonsPatch({{curveU0}}, {{curveU1}}, {{curveV0}}, {{curveV1}}, int({{ctrl.uSegments}}), int({{ctrl.vSegments}}))',
      csharp: 'var {{surface}} = Geo.coonsPatch({{curveU0}}, {{curveU1}}, {{curveV0}}, {{curveV1}}, (int){{ctrl.uSegments}}, (int){{ctrl.vSegments}});'
    },
    help: {
      inputs: [
        { name: 'U-0', description: 'First U boundary' },
        { name: 'U-1', description: 'Second U boundary' },
        { name: 'V-0', description: 'First V boundary' },
        { name: 'V-1', description: 'Second V boundary' }
      ],
      outputs: [{ name: 'Surface', description: 'Coons patch mesh' }],
      example: {
        title: 'Coons patch from 4 unit-edge lines',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 0, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 1, y: 1, z: 0 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 0 },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 100 },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 200 },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 300 },
          { type: 'Surface.ByCoonsPatch', x: 480, y: 150 },
          { type: 'output-watch', x: 720, y: 150 }
        ],
        wires: [
          [0, 'point', 4, 'startPoint'],
          [1, 'point', 4, 'endPoint'],
          [2, 'point', 5, 'startPoint'],
          [3, 'point', 5, 'endPoint'],
          [0, 'point', 6, 'startPoint'],
          [2, 'point', 6, 'endPoint'],
          [1, 'point', 7, 'startPoint'],
          [3, 'point', 7, 'endPoint'],
          [4, 'line', 8, 'curveU0'],
          [5, 'line', 8, 'curveU1'],
          [6, 'line', 8, 'curveV0'],
          [7, 'line', 8, 'curveV1'],
          [8, 'surface', 9, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.coonsPatch({{curveU0}}, {{curveU1}}, {{curveV0}}, {{curveV1}})'
    }
  },
  {
    type: 'Surface.ByNurbsControlPoints',
    name: 'Surface.ByNurbsControlPoints',
    category: 'surfaces',
    subGroup: 'Creation',
    icon: '▧',
    aliases: ['nurbs-surface'],
    description: 'Builds a NURBS surface from a 2-D grid of control points and U/V degrees, then tessellates it into a mesh. The surface is pulled toward control points but only passes through the four corner points.',
    inputs: [
      { id: 'grid', name: 'Ctrl Grid', type: 'list', description: '2-D list of Point3 control points (rows of equal length)' },
      { id: 'degU', name: 'Degree U', type: 'number', description: 'NURBS degree in the U direction' },
      { id: 'degV', name: 'Degree V', type: 'number', description: 'NURBS degree in the V direction' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Tessellated NURBS surface mesh' }],
    controls: [
      { id: 'degU', type: 'formula', default: '3', label: 'Degree U' },
      { id: 'degV', type: 'formula', default: '3', label: 'Degree V' }
    ],
    execute(context, inputs) {
      const grid = toList(inputs.grid);
      if (grid.length === 0) return { surface: undefined };
      const surface = Geo.createNurbsSurface(grid, toInteger(inputs.degU, 3), toInteger(inputs.degV, 3));
      return { surface: surface && typeof surface.toMesh === 'function' ? surface.toMesh() : surface };
    },
    codegen: {
      python: '{{surface}} = Geo.createNurbsSurface({{grid}}, {{degU}}, {{degV}}).toMesh()',
      csharp: 'var {{surface}} = Geo.createNurbsSurface({{grid}}, (int){{degU}}, (int){{degV}}).toMesh();'
    },
    help: {
      inputs: [
        { name: 'Ctrl Grid', description: 'Control point grid' },
        { name: 'Degree U', description: 'U degree' },
        { name: 'Degree V', description: 'V degree' }
      ],
      outputs: [{ name: 'Surface', description: 'NURBS mesh' }],
      example: {
        title: 'NURBS surface from a 4-point grid (degree 1×1)',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 0, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 1, y: 1, z: 0 } },
          { type: 'List.Create', x: 240, y: 30 },
          { type: 'List.Create', x: 240, y: 170 },
          { type: 'List.Create', x: 460, y: 100 },
          { type: 'Input.Integer', x: 240, y: 290 },
          { type: 'Input.Integer', x: 240, y: 360 },
          { type: 'Surface.ByNurbsControlPoints', x: 680, y: 150 },
          { type: 'output-watch', x: 900, y: 150 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 5, 'item0'],
          [3, 'point', 5, 'item1'],
          [4, 'list', 6, 'item0'],
          [5, 'list', 6, 'item1'],
          [6, 'list', 9, 'grid'],
          [7, 'value', 9, 'degU'],
          [8, 'value', 9, 'degV'],
          [9, 'surface', 10, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createNurbsSurface({{grid}}, {{degU}}, {{degV}}).toMesh()'
    }
  },
  {
    type: 'Surface.ByPointGrid',
    name: 'Surface.ByPointGrid',
    category: 'surfaces',
    subGroup: 'Creation',
    icon: '▦',
    aliases: ['surf-from-grid'],
    description: 'Builds a triangulated surface mesh from a 1-D list of points laid out in row-major order with given U Count and V Count. Adjacent points in the list become adjacent in the mesh grid.',
    inputs: [
      { id: 'points', name: 'Points', type: 'list', description: 'Flat list of points in row-major order' },
      { id: 'uCount', name: 'U Count', type: 'number', description: 'Number of points along U' },
      { id: 'vCount', name: 'V Count', type: 'number', description: 'Number of points along V' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Triangulated surface mesh' }],
    controls: [
      { id: 'uCount', type: 'formula', default: '2', label: 'U Count' },
      { id: 'vCount', type: 'formula', default: '2', label: 'V Count' }
    ],
    execute(context, inputs) {
      const pts = toList(inputs.points);
      if (pts.length < 4) return { surface: undefined };
      return { surface: Geo.surfaceFromGrid(pts, toInteger(inputs.uCount, 2), toInteger(inputs.vCount, 2)) };
    },
    codegen: {
      python: '{{surface}} = Geo.surfaceFromGrid({{points}}, int({{uCount}}), int({{vCount}}))',
      csharp: 'var {{surface}} = Geo.surfaceFromGrid({{points}}, (int){{uCount}}, (int){{vCount}});'
    },
    help: {
      inputs: [
        { name: 'Points', description: 'Row-major point list' },
        { name: 'U Count', description: 'Points along U' },
        { name: 'V Count', description: 'Points along V' }
      ],
      outputs: [{ name: 'Surface', description: 'Grid surface mesh' }],
      example: {
        title: 'Surface from a 2×2 point grid',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 0, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 1, y: 1, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Input.Integer', x: 0, y: 290, controls: { val: 2 } },
          { type: 'Input.Integer', x: 0, y: 360, controls: { val: 2 } },
          { type: 'Surface.ByPointGrid', x: 460, y: 150 },
          { type: 'output-watch', x: 680, y: 150 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 7, 'points'],
          [5, 'value', 7, 'uCount'],
          [6, 'value', 7, 'vCount'],
          [7, 'surface', 8, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.surfaceFromGrid({{points}}, {{uCount}}, {{vCount}})'
    }
  },
  {
    type: 'Surface.ByRuledLoft',
    name: 'Surface.ByRuledLoft',
    category: 'surfaces',
    subGroup: 'Creation',
    icon: '▨',
    aliases: ['op-ruled-surface'],
    description: 'Builds a ruled surface by interpolating straight ruling lines between two boundary curves. The result is a tessellated mesh sampled at fixed steps along the rulings; suitable for hyperbolic paraboloids and saddle shapes.',
    inputs: [
      { id: 'curve1', name: 'Curve 1', type: 'any', description: 'First boundary curve' },
      { id: 'curve2', name: 'Curve 2', type: 'any', description: 'Second boundary curve' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Ruled surface mesh' }],
    controls: [
      { id: 'segments', type: 'formula', default: '20', label: 'Segments' }
    ],
    execute(context, inputs, controls) {
      if (inputs.curve1 == null || inputs.curve2 == null) return { surface: undefined };
      return { surface: Geo.ruledSurface(inputs.curve1, inputs.curve2, toInteger(controls.segments, 20)) };
    },
    codegen: {
      python: '{{surface}} = Geo.ruledSurface({{curve1}}, {{curve2}}, int({{ctrl.segments}}))',
      csharp: 'var {{surface}} = Geo.ruledSurface({{curve1}}, {{curve2}}, (int){{ctrl.segments}});'
    },
    help: {
      inputs: [
        { name: 'Curve 1', description: 'First boundary curve' },
        { name: 'Curve 2', description: 'Second boundary curve' }
      ],
      outputs: [{ name: 'Surface', description: 'Ruled surface mesh' }],
      example: {
        title: 'Ruled surface between two parallel lines',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 10, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 0, y: 10, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 10, y: 10, z: 5 } },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 30 },
          { type: 'Line.ByStartPointEndPoint', x: 240, y: 170 },
          { type: 'Surface.ByRuledLoft', x: 480, y: 100 },
          { type: 'output-watch', x: 700, y: 100 }
        ],
        wires: [
          [0, 'point', 4, 'startPoint'],
          [1, 'point', 4, 'endPoint'],
          [2, 'point', 5, 'startPoint'],
          [3, 'point', 5, 'endPoint'],
          [4, 'line', 6, 'curve1'],
          [5, 'line', 6, 'curve2'],
          [6, 'surface', 7, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.ruledSurface({{curve1}}, {{curve2}})'
    }
  },
  {
    type: 'Surface.ByCurveExtrude',
    name: 'Surface.ByCurveExtrude',
    category: 'surfaces',
    subGroup: 'Creation',
    icon: '⬆',
    aliases: ['op-extrude', 'solid-byextrusion'],
    description: 'Sweeps a curve along a direction vector to produce the swept side-wall surface mesh. The result is an open ribbon (no top or bottom cap) — use Surface.ByPatch on the start/end profiles separately if a closed solid is needed.',
    inputs: [
      { id: 'curve', name: 'Curve', type: 'any', description: 'Profile curve to sweep along the direction' },
      { id: 'vector', name: 'Direction', type: 'vector', description: 'Direction vector (length sets the extrusion distance)' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Resulting extruded side-wall surface' }],
    controls: [],
    execute(context, inputs) {
      if (inputs.curve == null) return { surface: undefined };
      return { surface: Geo.extrude(inputs.curve, toVector(inputs.vector)) };
    },
    codegen: {
      python: '{{surface}} = Geo.extrude({{curve}}, {{vector}})',
      csharp: 'var {{surface}} = Geo.extrude({{curve}}, {{vector}});'
    },
    help: {
      inputs: [
        { name: 'Curve', description: 'Profile curve' },
        { name: 'Direction', description: 'Extrusion vector' }
      ],
      outputs: [{ name: 'Surface', description: 'Extruded side-wall surface' }],
      example: {
        title: 'Extrude a unit circle one unit along Z',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 30 },
          { type: 'Input.Number', x: 0, y: 160, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 230, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 300, controls: { val: 1 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 230 },
          { type: 'Surface.ByCurveExtrude', x: 480, y: 120 },
          { type: 'output-watch', x: 720, y: 120 }
        ],
        wires: [
          [0, 'point', 2, 'center'],
          [1, 'value', 2, 'radius'],
          [3, 'value', 6, 'x'],
          [4, 'value', 6, 'y'],
          [5, 'value', 6, 'z'],
          [2, 'circle', 7, 'curve'],
          [6, 'vector', 7, 'vector'],
          [7, 'surface', 8, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.extrude({{curve}}, {{vector}})'
    }
  },
  // ─── Query ───────────────────────────────────────────────
  {
    type: 'Surface.Isolines',
    name: 'Surface.Isolines',
    category: 'surfaces',
    subGroup: 'Query',
    icon: '≡',
    aliases: ['op-isolines'],
    description: 'Extracts a list of isoparametric curves at evenly spaced parameter values along the chosen U or V direction. Useful for ribbing, profile extraction and shading studies.',
    inputs: [
      { id: 'mesh', name: 'Surface', type: 'mesh', description: 'Surface mesh to sample' },
      { id: 'count', name: 'Count', type: 'number', description: 'Number of isolines to produce' }
    ],
    outputs: [{ id: 'curves', name: 'Curves', type: 'list', description: 'List of isoparametric curves' }],
    controls: [
      { id: 'dir', type: 'dropdown', options: ['U', 'V'], default: 'U', label: 'Direction' },
      { id: 'count', type: 'formula', default: '10', label: 'Count' }
    ],
    execute(context, inputs, controls) {
      if (inputs.mesh == null) return { curves: [] };
      const count = toInteger(inputs.count, 10);
      const curves = controls.dir === 'V' ? Geo.getIsolinesV(inputs.mesh, count) : Geo.getIsolinesU(inputs.mesh, count);
      return { curves: Array.isArray(curves) ? curves : [] };
    },
    codegen: {
      python: '{{curves}} = Geo.getIsolinesU({{mesh}}, int({{count}})) if "{{ctrl.dir}}" == "U" else Geo.getIsolinesV({{mesh}}, int({{count}}))',
      csharp: 'var {{curves}} = "{{ctrl.dir}}" == "U" ? Geo.getIsolinesU({{mesh}}, (int){{count}}) : Geo.getIsolinesV({{mesh}}, (int){{count}});'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface mesh' },
        { name: 'Count', description: 'Number of isolines' }
      ],
      outputs: [{ name: 'Curves', description: 'List of isolines' }],
      example: {
        title: '10 U-isolines from a 2×2 patch surface',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 0, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 1, y: 1, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Input.Integer', x: 0, y: 290, controls: { val: 2 } },
          { type: 'Input.Integer', x: 0, y: 360, controls: { val: 2 } },
          { type: 'Surface.ByPointGrid', x: 460, y: 150 },
          { type: 'Input.Integer', x: 460, y: 290, controls: { val: 10 } },
          { type: 'Surface.Isolines', x: 700, y: 200 },
          { type: 'List.Count', x: 920, y: 200 },
          { type: 'output-watch', x: 1120, y: 200 }
        ],
        wires: [
          [0, 'point', 4, 'item0'],
          [1, 'point', 4, 'item1'],
          [2, 'point', 4, 'item2'],
          [3, 'point', 4, 'item3'],
          [4, 'list', 7, 'points'],
          [5, 'value', 7, 'uCount'],
          [6, 'value', 7, 'vCount'],
          [7, 'surface', 9, 'mesh'],
          [8, 'value', 9, 'count'],
          [9, 'curves', 10, 'list'],
          [10, 'count', 11, 'value']
        ]
      },
      sampleCode: '{{curves}} = Geo.getIsolinesU({{mesh}}, {{count}})'
    }
  }
];
