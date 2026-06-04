import { Geo } from './geometry-lib.js';
import './geo-advanced.js';
import './nurbs-math.js';
import { planeFromOriginXY } from './frames.js';
import {
  orient as t1Orient,
  arrayLinear as t1ArrayLinear,
  arrayPolar as t1ArrayPolar
} from './transforms.js';
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
import { GEOMETRY_LEVELS, createGeometryRef, geometryCacheKey } from './GeometryRef.js';
import { GeometryCache } from './GeometryCache.js';
import { GeometryStore, geometryStore } from './GeometryStore.js';
import { compressMesh, createPreviewMesh, decompressMesh, meshBounds } from './MeshCompression.js';
import { ProgressiveLoading } from './ProgressiveLoading.js';

// ──────────────────────────────────────────────────────────────────────────
// Expose the T1 frame/transform kernel (frames.js + transforms.js) on the
// shared global `Geo` so generated Python/C# from the modern Transform nodes
// (src/nodes/categories/transform.js) resolves at runtime, exactly mirroring
// the execute() behaviour those nodes use in-app.
//
// IMPORTANT: `arrayLinear`/`arrayPolar` are ALREADY taken on Geo by the legacy
// spacing-based / full-turn-only implementations in geo-advanced.js, which the
// legacy Geometry.LinearArray / Geometry.PolarArray nodes depend on. We do NOT
// overwrite them. The T1 count + per-step-vector / count + total-angle versions
// are exposed under distinct, non-colliding names so both conventions coexist.
// See docs/architecture/decisions.md.
// ──────────────────────────────────────────────────────────────────────────
Geo.orient = t1Orient;
Geo.planeFromOriginXY = planeFromOriginXY;
Geo.arrayLinearByVector = t1ArrayLinear;
Geo.arrayPolarByAngle = t1ArrayPolar;

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
