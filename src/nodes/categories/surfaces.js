import { Geo } from '../../geometry/index.js';
import {
  pointAtUV,
  normalAtUV,
  frameAtUV,
  divideSurface
} from '../../geometry/surface-eval.js';
import { surfaceTrimNode } from '../../geometry/nodes/Surface.Trim.js';
import { surfacePanelizeNode } from '../../geometry/nodes/Surface.Panelize.js';

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
// u/v are NORMALIZED parameters in [0,1]; clamp so a stray control value never
// samples past the surface domain.
function toParam(value, fallback = 0.5) {
  const n = toNumber(value, fallback);
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
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
    description: 'Fills the interior of a closed loop curve by fan-triangulating from the centroid. Accepts Circle, Polygon, Polyline (closed), Arc, Ellipse, or NURBS curves. Produces a mesh suitable for shading, intersection, and downstream patch operations.',
    inputs: [
      { id: 'boundary', name: 'Boundary', type: 'any', description: 'Closed loop curve forming the patch outline (Circle, Polygon, closed Polyline, NURBS, etc.)' }
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
      inputs: [{ name: 'Boundary', description: 'Closed loop curve (Circle, Polygon, closed Polyline, NURBS, etc.)' }],
      outputs: [{ name: 'Surface', description: 'Patch mesh' }],
      example: {
        title: 'Patch a circle — fan-triangulated disk',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 5 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 30 },
          { type: 'Surface.ByPatch', x: 460, y: 30 },
          { type: 'Output.Watch', x: 680, y: 30 }
        ],
        wires: [
          [0, 'point', 2, 'center'],
          [1, 'value', 2, 'radius'],
          [2, 'circle', 3, 'boundary'],
          [3, 'surface', 4, 'value']
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
          { type: 'Output.Watch', x: 720, y: 150 }
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
          { type: 'Output.Watch', x: 900, y: 150 }
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
          { type: 'Output.Watch', x: 680, y: 150 }
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
    type: 'Surface.ByLoft',
    name: 'Surface.ByLoft',
    category: 'surfaces',
    subGroup: 'Creation',
    icon: '▨',
    aliases: ['op-ruled-surface', 'Surface.ByRuledLoft'],
    description: 'Lofts a surface through an ordered list of cross-section curves, skinning a tessellated mesh between successive sections. Two sections give a ruled surface; more sections shape the surface along its length.',
    inputs: [
      { id: 'crossSections', name: 'Cross Sections', type: 'list', description: 'Ordered list of cross-section curves to loft through' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Lofted surface mesh through the cross sections' }],
    controls: [],
    execute(context, inputs) {
      const sections = toList(inputs.crossSections);
      if (sections.length < 2) return { surface: undefined };
      return { surface: Geo.loft(sections) };
    },
    codegen: {
      python: '{{surface}} = Geo.loft({{crossSections}})',
      csharp: 'var {{surface}} = Geo.loft({{crossSections}});'
    },
    help: {
      inputs: [
        { name: 'Cross Sections', description: 'Ordered list of cross-section curves' }
      ],
      outputs: [{ name: 'Surface', description: 'Lofted surface mesh' }],
      example: {
        title: 'Loft a surface through two circles offset in Z',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 1 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 30 },
          { type: 'Point.ByCoordinates', x: 0, y: 160, controls: { x: 0, y: 0, z: 2 } },
          { type: 'Input.Number', x: 0, y: 240, controls: { val: 1 } },
          { type: 'Circle.ByCenterRadius', x: 240, y: 200 },
          { type: 'List.Create', x: 480, y: 110 },
          { type: 'Surface.ByLoft', x: 700, y: 110 },
          { type: 'Output.Watch', x: 920, y: 110 }
        ],
        wires: [
          [0, 'point', 2, 'center'],
          [1, 'value', 2, 'radius'],
          [3, 'point', 5, 'center'],
          [4, 'value', 5, 'radius'],
          [2, 'circle', 6, 'item0'],
          [5, 'circle', 6, 'item1'],
          [6, 'list', 7, 'crossSections'],
          [7, 'surface', 8, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.loft({{crossSections}})'
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
          { type: 'Output.Watch', x: 720, y: 120 }
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
          { type: 'Output.Watch', x: 1120, y: 200 }
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
  },
  // ─── Operations ──────────────────────────────────────────
  {
    type: 'Surface.Subdivide',
    name: 'Surface.Subdivide',
    category: 'surfaces',
    subGroup: 'Operations',
    icon: '◈',
    aliases: ['op-subdivide'],
    description: 'Splits every face of the surface mesh into four smaller faces by inserting midpoint vertices on each edge. Iterations are clamped to 5 to keep tessellation tractable.',
    inputs: [
      { id: 'mesh', name: 'Surface', type: 'mesh', description: 'Surface mesh to subdivide' },
      { id: 'iterations', name: 'Iterations', type: 'number', description: 'Subdivision passes (clamped to 5)' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'mesh', description: 'Subdivided surface mesh' }],
    controls: [
      { id: 'iterations', type: 'formula', default: '1', label: 'Iterations' }
    ],
    execute(context, inputs) {
      if (inputs.mesh == null) return { result: undefined };
      const it = Math.max(0, Math.min(5, toInteger(inputs.iterations, 1)));
      return { result: Geo.subdivide(inputs.mesh, it) };
    },
    codegen: {
      python: '{{result}} = Geo.subdivide({{mesh}}, int({{iterations}}))',
      csharp: 'var {{result}} = Geo.subdivide({{mesh}}, (int){{iterations}});'
    },
    help: {
      inputs: [
        { name: 'Surface', description: 'Surface mesh' },
        { name: 'Iterations', description: 'Subdivision passes' }
      ],
      outputs: [{ name: 'Result', description: 'Subdivided mesh' }],
      example: {
        title: 'Subdivide a 2×2 grid surface once',
        nodes: [
          { type: 'Point.ByCoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 70, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 140, controls: { x: 0, y: 1, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 210, controls: { x: 1, y: 1, z: 0 } },
          { type: 'List.Create', x: 240, y: 90 },
          { type: 'Input.Integer', x: 0, y: 290, controls: { val: 2 } },
          { type: 'Input.Integer', x: 0, y: 360, controls: { val: 2 } },
          { type: 'Surface.ByPointGrid', x: 460, y: 150 },
          { type: 'Input.Integer', x: 460, y: 290, controls: { val: 1 } },
          { type: 'Surface.Subdivide', x: 700, y: 200 },
          { type: 'Output.Watch', x: 920, y: 200 }
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
          [8, 'value', 9, 'iterations'],
          [9, 'result', 10, 'value']
        ]
      },
      sampleCode: '{{result}} = Geo.subdivide({{mesh}}, {{iterations}})'
    }
  },

  // ─── Parametric ──────────────────────────────────────────
  {
    type: 'Surface.CatenaryShell',
    name: 'Surface.CatenaryShell',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '⌓',
    aliases: ['param-catenary'],
    description: 'Generates an inverted catenary shell — the curve a hanging chain assumes, flipped to form a compressive arch surface. Span sets the footprint width; Height sets the rise at the apex.',
    inputs: [
      { id: 'span', name: 'Span', type: 'number', description: 'Footprint span' },
      { id: 'height', name: 'Height', type: 'number', description: 'Apex height above the base' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Catenary shell mesh' }],
    controls: [
      { id: 'span', type: 'formula', default: '20', label: 'Span' },
      { id: 'height', type: 'formula', default: '10', label: 'Height' }
    ],
    execute(context, inputs) {
      return { surface: Geo.createCatenaryShell(toNumber(inputs.span, 20), toNumber(inputs.height, 10)) };
    },
    codegen: {
      python: '{{surface}} = Geo.createCatenaryShell({{span}}, {{height}})',
      csharp: 'var {{surface}} = Geo.createCatenaryShell({{span}}, {{height}});'
    },
    help: {
      inputs: [
        { name: 'Span', description: 'Footprint span' },
        { name: 'Height', description: 'Apex rise' }
      ],
      outputs: [{ name: 'Surface', description: 'Catenary shell' }],
      example: {
        title: 'Catenary shell — span 20, height 10',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 20 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 10 } },
          { type: 'Surface.CatenaryShell', x: 240, y: 30 },
          { type: 'Output.Watch', x: 480, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'span'],
          [1, 'value', 2, 'height'],
          [2, 'surface', 3, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createCatenaryShell({{span}}, {{height}})'
    }
  },
  {
    type: 'Surface.Dini',
    name: 'Surface.Dini',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '⊘',
    aliases: ['param-dini'],
    description: 'Generates a Dini surface — a helicoid wrapped around the pseudosphere, defined by the scale A and twist parameter B. Produces a characteristic seashell-like spiraling surface of constant negative curvature.',
    inputs: [
      { id: 'a', name: 'A', type: 'number', description: 'Scale parameter' },
      { id: 'b', name: 'B', type: 'number', description: 'Twist parameter' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Dini surface mesh' }],
    controls: [
      { id: 'a', type: 'formula', default: '1', label: 'A' },
      { id: 'b', type: 'formula', default: '0.2', label: 'B' }
    ],
    execute(context, inputs) {
      return { surface: Geo.createDiniSurface(toNumber(inputs.a, 1), toNumber(inputs.b, 0.2)) };
    },
    codegen: {
      python: '{{surface}} = Geo.createDiniSurface({{a}}, {{b}})',
      csharp: 'var {{surface}} = Geo.createDiniSurface({{a}}, {{b}});'
    },
    help: {
      inputs: [
        { name: 'A', description: 'Scale' },
        { name: 'B', description: 'Twist' }
      ],
      outputs: [{ name: 'Surface', description: 'Dini surface' }],
      example: {
        title: 'Dini surface — A=1, B=0.2',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 0.2 } },
          { type: 'Surface.Dini', x: 240, y: 30 },
          { type: 'Output.Watch', x: 480, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'surface', 3, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createDiniSurface({{a}}, {{b}})'
    }
  },
  {
    type: 'Surface.Enneper',
    name: 'Surface.Enneper',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '∽',
    aliases: ['param-enneper'],
    description: 'Generates an Enneper minimal surface, a self-intersecting minimal surface of degree 6 with a characteristic four-fold petal symmetry. Scale stretches the surface uniformly.',
    inputs: [
      { id: 'scale', name: 'Scale', type: 'number', description: 'Uniform scale factor' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Enneper surface mesh' }],
    controls: [
      { id: 'scale', type: 'formula', default: '1', label: 'Scale' }
    ],
    execute(context, inputs) {
      return { surface: Geo.createEnneperSurface(toNumber(inputs.scale, 1)) };
    },
    codegen: {
      python: '{{surface}} = Geo.createEnneperSurface({{scale}})',
      csharp: 'var {{surface}} = Geo.createEnneperSurface({{scale}});'
    },
    help: {
      inputs: [{ name: 'Scale', description: 'Uniform scale' }],
      outputs: [{ name: 'Surface', description: 'Enneper surface' }],
      example: {
        title: 'Enneper surface — scale 1',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Surface.Enneper', x: 240, y: 0 },
          { type: 'Output.Watch', x: 480, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'scale'],
          [1, 'surface', 2, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createEnneperSurface({{scale}})'
    }
  },
  {
    type: 'Surface.Gyroid',
    name: 'Surface.Gyroid',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '⎈',
    aliases: ['param-gyroid'],
    description: 'Generates a gyroid — a triply periodic minimal surface defined by sin(x)·cos(y) + sin(y)·cos(z) + sin(z)·cos(x) = 0. Widely used in lattice infill, biological structures and metamaterials.',
    inputs: [
      { id: 'scale', name: 'Scale', type: 'number', description: 'Cell scale' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Gyroid mesh' }],
    controls: [
      { id: 'scale', type: 'formula', default: '5', label: 'Scale' }
    ],
    execute(context, inputs) {
      return { surface: Geo.createGyroid(toNumber(inputs.scale, 5)) };
    },
    codegen: {
      python: '{{surface}} = Geo.createGyroid({{scale}})',
      csharp: 'var {{surface}} = Geo.createGyroid({{scale}});'
    },
    help: {
      inputs: [{ name: 'Scale', description: 'Cell scale' }],
      outputs: [{ name: 'Surface', description: 'Gyroid mesh' }],
      example: {
        title: 'Gyroid — scale 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Surface.Gyroid', x: 240, y: 0 },
          { type: 'Output.Watch', x: 480, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'scale'],
          [1, 'surface', 2, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createGyroid({{scale}})'
    }
  },
  {
    type: 'Surface.HyperbolicParaboloid',
    name: 'Surface.HyperbolicParaboloid',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '⌢',
    aliases: ['param-hypar'],
    description: 'Generates a hyperbolic paraboloid (saddle / HyPar) surface — a doubly-ruled quadric with two opposing corners raised and two lowered. Curvature controls the saddle depth.',
    inputs: [
      { id: 'width', name: 'Width', type: 'number', description: 'Span along X' },
      { id: 'depth', name: 'Depth', type: 'number', description: 'Span along Y' },
      { id: 'curvature', name: 'Curvature', type: 'number', description: 'Saddle depth' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'HyPar mesh' }],
    controls: [
      { id: 'width', type: 'formula', default: '10', label: 'Width' },
      { id: 'depth', type: 'formula', default: '10', label: 'Depth' },
      { id: 'curvature', type: 'formula', default: '3', label: 'Curvature' }
    ],
    execute(context, inputs) {
      return {
        surface: Geo.createHyperbolicParaboloid(
          toNumber(inputs.width, 10),
          toNumber(inputs.depth, 10),
          toNumber(inputs.curvature, 3)
        )
      };
    },
    codegen: {
      python: '{{surface}} = Geo.createHyperbolicParaboloid({{width}}, {{depth}}, {{curvature}})',
      csharp: 'var {{surface}} = Geo.createHyperbolicParaboloid({{width}}, {{depth}}, {{curvature}});'
    },
    help: {
      inputs: [
        { name: 'Width', description: 'X span' },
        { name: 'Depth', description: 'Y span' },
        { name: 'Curvature', description: 'Saddle depth' }
      ],
      outputs: [{ name: 'Surface', description: 'HyPar mesh' }],
      example: {
        title: 'HyPar — 10×10, curvature 3',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 3 } },
          { type: 'Surface.HyperbolicParaboloid', x: 240, y: 60 },
          { type: 'Output.Watch', x: 540, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'width'],
          [1, 'value', 3, 'depth'],
          [2, 'value', 3, 'curvature'],
          [3, 'surface', 4, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createHyperbolicParaboloid({{width}}, {{depth}}, {{curvature}})'
    }
  },
  {
    type: 'Surface.Hyperboloid',
    name: 'Surface.Hyperboloid',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '⧘',
    aliases: ['param-hyperboloid'],
    description: 'Generates a hyperboloid of one sheet — the classic "cooling tower" shape, a doubly-ruled surface defined by an outer Radius, a Waist radius at the narrowest point and total Height.',
    inputs: [
      { id: 'radius', name: 'Radius', type: 'number', description: 'Outer radius at top and bottom' },
      { id: 'waist', name: 'Waist', type: 'number', description: 'Radius at the narrow waist' },
      { id: 'height', name: 'Height', type: 'number', description: 'Total height' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Hyperboloid mesh' }],
    controls: [
      { id: 'radius', type: 'formula', default: '8', label: 'Radius' },
      { id: 'waist', type: 'formula', default: '4', label: 'Waist' },
      { id: 'height', type: 'formula', default: '20', label: 'Height' }
    ],
    execute(context, inputs) {
      return {
        surface: Geo.createHyperboloid(
          toNumber(inputs.radius, 8),
          toNumber(inputs.waist, 4),
          toNumber(inputs.height, 20)
        )
      };
    },
    codegen: {
      python: '{{surface}} = Geo.createHyperboloid({{radius}}, {{waist}}, {{height}})',
      csharp: 'var {{surface}} = Geo.createHyperboloid({{radius}}, {{waist}}, {{height}});'
    },
    help: {
      inputs: [
        { name: 'Radius', description: 'Outer radius' },
        { name: 'Waist', description: 'Waist radius' },
        { name: 'Height', description: 'Total height' }
      ],
      outputs: [{ name: 'Surface', description: 'Hyperboloid mesh' }],
      example: {
        title: 'Hyperboloid — R=8, waist=4, H=20',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 8 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 20 } },
          { type: 'Surface.Hyperboloid', x: 240, y: 60 },
          { type: 'Output.Watch', x: 480, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'radius'],
          [1, 'value', 3, 'waist'],
          [2, 'value', 3, 'height'],
          [3, 'surface', 4, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createHyperboloid({{radius}}, {{waist}}, {{height}})'
    }
  },
  {
    type: 'Surface.KleinBottle',
    name: 'Surface.KleinBottle',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '⊗',
    aliases: ['param-klein'],
    description: 'Generates a Klein bottle — a closed non-orientable surface that has no distinguishable inside or outside. Useful as a topology study object; Scale stretches the bottle uniformly.',
    inputs: [
      { id: 'scale', name: 'Scale', type: 'number', description: 'Uniform scale factor' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Klein bottle mesh' }],
    controls: [
      { id: 'scale', type: 'formula', default: '3', label: 'Scale' }
    ],
    execute(context, inputs) {
      return { surface: Geo.createKleinBottle(toNumber(inputs.scale, 3)) };
    },
    codegen: {
      python: '{{surface}} = Geo.createKleinBottle({{scale}})',
      csharp: 'var {{surface}} = Geo.createKleinBottle({{scale}});'
    },
    help: {
      inputs: [{ name: 'Scale', description: 'Uniform scale' }],
      outputs: [{ name: 'Surface', description: 'Klein bottle mesh' }],
      example: {
        title: 'Klein bottle — scale 3',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Surface.KleinBottle', x: 240, y: 0 },
          { type: 'Output.Watch', x: 480, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'scale'],
          [1, 'surface', 2, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createKleinBottle({{scale}})'
    }
  },
  {
    type: 'Surface.MobiusStrip',
    name: 'Surface.MobiusStrip',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '∞',
    aliases: ['param-mobius'],
    description: 'Generates a Möbius strip — a closed ruled surface with only one side and one edge. Radius sets the centre-line radius; Width sets the cross-strip width.',
    inputs: [
      { id: 'radius', name: 'Radius', type: 'number', description: 'Centre-line radius' },
      { id: 'width', name: 'Width', type: 'number', description: 'Strip width' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Möbius strip mesh' }],
    controls: [
      { id: 'radius', type: 'formula', default: '5', label: 'Radius' },
      { id: 'width', type: 'formula', default: '2', label: 'Width' }
    ],
    execute(context, inputs) {
      return {
        surface: Geo.createMobiusStrip(
          toNumber(inputs.radius, 5),
          toNumber(inputs.width, 2)
        )
      };
    },
    codegen: {
      python: '{{surface}} = Geo.createMobiusStrip({{radius}}, {{width}})',
      csharp: 'var {{surface}} = Geo.createMobiusStrip({{radius}}, {{width}});'
    },
    help: {
      inputs: [
        { name: 'Radius', description: 'Centre-line radius' },
        { name: 'Width', description: 'Strip width' }
      ],
      outputs: [{ name: 'Surface', description: 'Möbius strip mesh' }],
      example: {
        title: 'Möbius strip — radius 5, width 2',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 2 } },
          { type: 'Surface.MobiusStrip', x: 240, y: 30 },
          { type: 'Output.Watch', x: 480, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'radius'],
          [1, 'value', 2, 'width'],
          [2, 'surface', 3, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createMobiusStrip({{radius}}, {{width}})'
    }
  },
  {
    type: 'Surface.Seashell',
    name: 'Surface.Seashell',
    category: 'surfaces',
    subGroup: 'Parametric',
    icon: '🐚',
    aliases: ['param-seashell'],
    description: 'Generates a seashell / conch surface as a logarithmic-spiral tube. Turns controls the number of spiral revolutions; Growth controls how rapidly the radius grows along the spiral.',
    inputs: [
      { id: 'turns', name: 'Turns', type: 'number', description: 'Number of spiral revolutions' },
      { id: 'growth', name: 'Growth', type: 'number', description: 'Radial growth rate' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Seashell mesh' }],
    controls: [
      { id: 'turns', type: 'formula', default: '3', label: 'Turns' },
      { id: 'growth', type: 'formula', default: '0.1', label: 'Growth' }
    ],
    execute(context, inputs) {
      return {
        surface: Geo.createSeashell(
          toNumber(inputs.turns, 3),
          toNumber(inputs.growth, 0.1)
        )
      };
    },
    codegen: {
      python: '{{surface}} = Geo.createSeashell({{turns}}, {{growth}})',
      csharp: 'var {{surface}} = Geo.createSeashell({{turns}}, {{growth}});'
    },
    help: {
      inputs: [
        { name: 'Turns', description: 'Spiral revolutions' },
        { name: 'Growth', description: 'Radial growth rate' }
      ],
      outputs: [{ name: 'Surface', description: 'Seashell mesh' }],
      example: {
        title: 'Seashell — 3 turns, growth 0.1',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 0.1 } },
          { type: 'Surface.Seashell', x: 240, y: 30 },
          { type: 'Output.Watch', x: 480, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'turns'],
          [1, 'value', 2, 'growth'],
          [2, 'surface', 3, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.createSeashell({{turns}}, {{growth}})'
    }
  },

  // ─── Architectural composite (Phase 8) ────────────────────
  // Single-call wavy surface so plan-mode can express "doubly curved
  // roof / canopy" without falling back to a nested for-loop Python block.

  {
    type: 'Surface.WavyGrid',
    name: 'Surface.WavyGrid',
    category: 'surfaces',
    subGroup: 'Composite',
    icon: '🌊',
    description: 'Doubly curved sin/cos-modulated surface from a width×depth rectangle, sampled on a u_count × v_count grid. Amplitude controls vertical sway; freq_u and freq_v control wave frequency along each axis. Output is a Mesh3.',
    inputs: [
      { id: 'width', name: 'Width', type: 'number', description: 'Surface width along X' },
      { id: 'depth', name: 'Depth', type: 'number', description: 'Surface depth along Y' },
      { id: 'uCount', name: 'U Count', type: 'number', description: 'Samples along width' },
      { id: 'vCount', name: 'V Count', type: 'number', description: 'Samples along depth' },
      { id: 'amplitude', name: 'Amplitude', type: 'number', description: 'Vertical sway amount' },
      { id: 'freqU', name: 'Freq U', type: 'number', description: 'Wave frequency along width' },
      { id: 'freqV', name: 'Freq V', type: 'number', description: 'Wave frequency along depth' }
    ],
    outputs: [{ id: 'surface', name: 'Surface', type: 'mesh', description: 'Resulting wavy mesh' }],
    controls: [
      { id: 'width', type: 'formula', default: '30', label: 'Width' },
      { id: 'depth', type: 'formula', default: '30', label: 'Depth' },
      { id: 'uCount', type: 'formula', default: '20', label: 'U Count' },
      { id: 'vCount', type: 'formula', default: '20', label: 'V Count' },
      { id: 'amplitude', type: 'formula', default: '4', label: 'Amplitude' },
      { id: 'freqU', type: 'formula', default: '0.3', label: 'Freq U' },
      { id: 'freqV', type: 'formula', default: '0.3', label: 'Freq V' }
    ],
    execute(context, inputs) {
      return {
        surface: Geo.wavyGrid(
          toNumber(inputs.width, 30),
          toNumber(inputs.depth, 30),
          toInteger(inputs.uCount, 20),
          toInteger(inputs.vCount, 20),
          toNumber(inputs.amplitude, 4),
          toNumber(inputs.freqU, 0.3),
          toNumber(inputs.freqV, 0.3)
        )
      };
    },
    codegen: {
      python: '{{surface}} = Geo.wavyGrid({{width}}, {{depth}}, int({{uCount}}), int({{vCount}}), {{amplitude}}, {{freqU}}, {{freqV}})',
      csharp: 'var {{surface}} = Geo.wavyGrid({{width}}, {{depth}}, (int){{uCount}}, (int){{vCount}}, {{amplitude}}, {{freqU}}, {{freqV}});'
    },
    help: {
      inputs: [
        { name: 'Width', description: 'Surface width' },
        { name: 'Amplitude', description: 'Vertical sway' }
      ],
      outputs: [{ name: 'Surface', description: 'Wavy mesh' }],
      example: {
        title: 'Wavy 30×30 surface with amplitude 4 — typical canopy shape',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 30 } },
          { type: 'Input.Number', x: 0, y: 60, controls: { val: 30 } },
          { type: 'Input.Number', x: 0, y: 120, controls: { val: 4 } },
          { type: 'Surface.WavyGrid', x: 260, y: 60 },
          { type: 'Output.Watch', x: 540, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'width'],
          [1, 'value', 3, 'depth'],
          [2, 'value', 3, 'amplitude'],
          [3, 'surface', 4, 'value']
        ]
      },
      sampleCode: '{{surface}} = Geo.wavyGrid({{width}}, {{depth}}, 20, 20, {{amplitude}}, 0.3, 0.3)'
    }
  },

  // ─── Evaluate & Divide ───────────────────────────────────
  {
    type: 'Surface.PointAtUV',
    name: 'Surface.PointAtUV',
    category: 'surfaces',
    subGroup: 'Evaluate',
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
    category: 'surfaces',
    subGroup: 'Evaluate',
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
    category: 'surfaces',
    subGroup: 'Evaluate',
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
    category: 'surfaces',
    subGroup: 'Evaluate',
    icon: '▦',
    aliases: ['surface-divide', 'surface-isotrim'],
    description: 'Samples a surface on a (U Count × V Count) grid and returns both the grid Points and an oriented Frame at each — the panelization substrate. Unlike Surface.Subdivide (which splits the surface into sub-surface patches), this returns sample points + frames, not new surfaces. U/V Count are SEGMENT counts, so the grid has (U Count+1) × (V Count+1) samples in row-major order. Feed Frames into Geometry.Orient to lay a panel/adaptive component flat onto every cell.',
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
        toInteger(inputs.uCount, 5),
        toInteger(inputs.vCount, 5)
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
      // PANELIZATION PAYOFF: a surface → Surface.Divide → Frames → Geometry.Orient
      // lays a small panel box (built on the world XY plane) flat onto every grid
      // cell, then Output.Watch shows the populated surface.
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
  },
  surfaceTrimNode,
  surfacePanelizeNode
];
