import { Geo } from './geometry-lib.js';
import './geo-advanced.js';
import './nurbs-math.js';
import { GEOMETRY_LEVELS, createGeometryRef, geometryCacheKey } from './GeometryRef.js';
import { GeometryCache } from './GeometryCache.js';
import { GeometryStore, geometryStore } from './GeometryStore.js';
import { compressMesh, createPreviewMesh, decompressMesh, meshBounds } from './MeshCompression.js';
import { ProgressiveLoading } from './ProgressiveLoading.js';

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
