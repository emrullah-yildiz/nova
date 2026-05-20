import { describe, expect, it } from 'vitest';
import { Geo } from '../../src/geometry/index.js';
import { GEOMETRY_LEVELS, createGeometryRef } from '../../src/geometry/GeometryRef.js';
import { GeometryStore } from '../../src/geometry/GeometryStore.js';
import { ProgressiveLoading } from '../../src/geometry/ProgressiveLoading.js';
import { compressMesh, createPreviewMesh } from '../../src/geometry/MeshCompression.js';

/*
 * Large geometry operation test template.
 *
 * This file is intentionally named *.template.js so it is not included in the
 * normal Vitest run. Rename or copy it to `large-geometry-operation.test.js`
 * when you want to run the large synthetic workload.
 */

const OBJECT_COUNT = Number(process.env.NOVA_LARGE_GEOMETRY_COUNT || 10000);
const BATCH_SIZE = Number(process.env.NOVA_LARGE_GEOMETRY_BATCH_SIZE || 500);
const PREVIEW_FACE_LIMIT = Number(process.env.NOVA_LARGE_GEOMETRY_PREVIEW_FACES || 12);

function createBoxMesh(index) {
  const x = index % 100;
  const y = Math.floor(index / 100) % 100;
  const z = Math.floor(index / 10000);
  const size = 0.8;
  const vertices = [
    new Geo.Point3(x, y, z),
    new Geo.Point3(x + size, y, z),
    new Geo.Point3(x + size, y + size, z),
    new Geo.Point3(x, y + size, z),
    new Geo.Point3(x, y, z + size),
    new Geo.Point3(x + size, y, z + size),
    new Geo.Point3(x + size, y + size, z + size),
    new Geo.Point3(x, y + size, z + size)
  ];
  const faces = [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [0, 4, 5], [0, 5, 1],
    [1, 5, 6], [1, 6, 2],
    [2, 6, 7], [2, 7, 3],
    [3, 7, 4], [3, 4, 0]
  ];
  return new Geo.Mesh3(vertices, faces, 0x89b4fa);
}

function createLargeGeometryRefs(count) {
  return Array.from({ length: count }, (_unused, index) => {
    const mesh = createBoxMesh(index);
    const bounds = {
      min: [mesh.vertices[0].x, mesh.vertices[0].y, mesh.vertices[0].z],
      max: [mesh.vertices[6].x, mesh.vertices[6].y, mesh.vertices[6].z]
    };

    return createGeometryRef({
      host: 'nova',
      id: `object-${index}`,
      versionId: 'synthetic-v1',
      bounds,
      nativeRef: { synthetic: true, index },
      levels: {
        [GEOMETRY_LEVELS.PREVIEW_MESH]: async () => compressMesh(createPreviewMesh(mesh, {
          maxFaces: PREVIEW_FACE_LIMIT
        })),
        [GEOMETRY_LEVELS.FULL_MESH]: async () => compressMesh(mesh)
      }
    });
  });
}

describe('large geometry operation template', () => {
  it('loads 10k objects as bounds first, then preview meshes, and full mesh on demand', async () => {
    const store = new GeometryStore({ cacheOptions: { maxEntries: OBJECT_COUNT * 3 } });
    const loader = new ProgressiveLoading({ store, batchSize: BATCH_SIZE });
    const refs = createLargeGeometryRefs(OBJECT_COUNT);
    const progress = [];

    const initial = await loader.loadInitial(refs, {
      onProgress: event => progress.push(event)
    });

    expect(initial.bounds).toHaveLength(OBJECT_COUNT);
    expect(initial.previewMeshes).toHaveLength(OBJECT_COUNT);
    expect(store.cache.size).toBeGreaterThanOrEqual(OBJECT_COUNT * 2);
    expect(progress[0]).toMatchObject({ level: GEOMETRY_LEVELS.BOUNDS });
    expect(progress.at(-1)).toMatchObject({ level: GEOMETRY_LEVELS.PREVIEW_MESH });

    const fullMesh = await loader.loadFullMesh(refs[Math.floor(OBJECT_COUNT / 2)]);
    expect(fullMesh._type).toBe('CompressedMesh');
    expect(store.getCached(refs[Math.floor(OBJECT_COUNT / 2)], GEOMETRY_LEVELS.FULL_MESH)).toBe(fullMesh);
  });
});
