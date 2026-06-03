import { Geo } from './geometry-lib.js';
import './geo-advanced.js';
import './nurbs-math.js';
import { planeFromOriginXY } from './frames.js';
import {
  orient as t1Orient,
  arrayLinear as t1ArrayLinear,
  arrayPolar as t1ArrayPolar
} from './transforms.js';
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
