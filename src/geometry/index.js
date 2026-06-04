import { Geo } from './geometry-lib.js';
import './geo-advanced.js';
import './nurbs-math.js';
import { planeFromOriginXY } from './frames.js';
import { orient as t1Orient } from './transforms.js';
import {
  pointAtT as t4PointAtT,
  tangentAtT as t4TangentAtT,
  frameAtT as t4FrameAtT,
  divideCurve as t4DivideCurve
} from './curve-eval.js';
import {
  pointAtUV as t4PointAtUV,
  normalAtUV as t4NormalAtUV,
  frameAtUV as t4FrameAtUV,
  divideSurface as t4DivideSurface
} from './surface-eval.js';
import {
  panelFrames as m5PanelFrames,
  panelPlanarity as m5PanelPlanarity
} from './panel-frames.js';
import { GEOMETRY_LEVELS, createGeometryRef, geometryCacheKey } from './GeometryRef.js';
import { GeometryCache } from './GeometryCache.js';
import { GeometryStore, geometryStore } from './GeometryStore.js';
import { compressMesh, createPreviewMesh, decompressMesh, meshBounds } from './MeshCompression.js';
import { ProgressiveLoading } from './ProgressiveLoading.js';

// ──────────────────────────────────────────────────────────────────────────
// Expose the frame/transform kernel (frames.js + transforms.js) on the shared
// global `Geo` so generated Python/C# from the Geometry.Orient and
// Plane.ByOriginXAxisYAxis nodes resolves at runtime, exactly mirroring the
// execute() behaviour those nodes use in-app. `Geo.orient` is collision-free
// against geometry-lib.js / geo-advanced.js (which own the spacing-based
// arrayLinear/arrayPolar used by Geometry.LinearArray / Geometry.PolarArray).
// See docs/architecture/decisions.md.
// ──────────────────────────────────────────────────────────────────────────
Geo.orient = t1Orient;
Geo.planeFromOriginXY = planeFromOriginXY;

// ──────────────────────────────────────────────────────────────────────────
// T4 (M2) curve/surface frame-evaluation kernel (curve-eval.js / surface-eval.js).
// Attached under their export names so downstream node codegen (T5) resolves
// `Geo.<name>(...)` at runtime against the assembled global Geo, mirroring the
// T1/T2 pattern above. All eight names were verified collision-free against
// geometry-lib.js / geo-advanced.js / nurbs-math.js before assignment — none
// shadow an existing global. t and (u,v) are NORMALIZED parameters in [0,1].
// ──────────────────────────────────────────────────────────────────────────
Geo.pointAtT = t4PointAtT;
Geo.tangentAtT = t4TangentAtT;
Geo.frameAtT = t4FrameAtT;
Geo.divideCurve = t4DivideCurve;
Geo.pointAtUV = t4PointAtUV;
Geo.normalAtUV = t4NormalAtUV;
Geo.frameAtUV = t4FrameAtUV;
Geo.divideSurface = t4DivideSurface;

// ──────────────────────────────────────────────────────────────────────────
// M5 panel-frame recovery (panel-frames.js). The paneling nodes emit bare quad
// meshes and discard the per-panel frame; these helpers recover it so panels
// feed Geometry.Orient (M1) and the Revit placement nodes (M4). `panelFrames`
// returns the SAME Geo.Plane shape M1/M2 produce. Both names verified
// collision-free against geometry-lib.js / geo-advanced.js / nurbs-math.js —
// neither shadows an existing global — so node codegen (Pattern.Panel*) that
// emits `Geo.<name>(...)` resolves at runtime against the assembled global Geo.
// ──────────────────────────────────────────────────────────────────────────
Geo.panelFrames = m5PanelFrames;
Geo.panelPlanarity = m5PanelPlanarity;

if (typeof window !== 'undefined') {
  window.Geo = Geo;
}

export { Geo };
export {
  GEOMETRY_LEVELS,
  GeometryCache,
  GeometryStore,
  ProgressiveLoading,
  compressMesh,
  createGeometryRef,
  createPreviewMesh,
  decompressMesh,
  geometryCacheKey,
  geometryStore,
  meshBounds
};
export default Geo;
