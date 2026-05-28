import { Geo } from '../src/geometry/index.js';
import {
  GEOMETRY_LEVELS,
  createGeometryRef,
  geometryCacheKey
} from '../src/geometry/GeometryRef.js';
import { GeometryCache } from '../src/geometry/GeometryCache.js';
import { GeometryStore } from '../src/geometry/GeometryStore.js';
import {
  compressMesh,
  createPreviewMesh,
  decompressMesh,
  meshBounds
} from '../src/geometry/MeshCompression.js';
import { ProgressiveLoading } from '../src/geometry/ProgressiveLoading.js';

describe('geometry pipeline', () => {
  it('keys and caches geometry by host, id, version, and level', async () => {
    const cache = new GeometryCache();
    const ref = { host: 'revit', id: 'wall-1', versionId: 'v2' };
    let loadCount = 0;

    expect(geometryCacheKey({
      host: 'revit',
      id: 'wall-1',
      versionId: 'v2',
      level: GEOMETRY_LEVELS.PREVIEW_MESH
    })).toBe('revit:wall-1:v2:PreviewMesh');

    const first = await cache.getOrLoad(ref, GEOMETRY_LEVELS.PREVIEW_MESH, async () => {
      loadCount += 1;
      return { preview: true };
    });
    const second = await cache.getOrLoad(ref, GEOMETRY_LEVELS.PREVIEW_MESH, async () => {
      loadCount += 1;
      return { preview: false };
    });

    expect(first).toEqual({ preview: true });
    expect(second).toBe(first);
    expect(loadCount).toBe(1);
  });

  it('loads geometry refs progressively by level and memoizes each level', async () => {
    const calls = [];
    const ref = createGeometryRef({
      host: 'rhino',
      id: 'object-1',
      versionId: '17',
      bounds: { min: [0, 0, 0], max: [1, 2, 3] },
      levels: {
        [GEOMETRY_LEVELS.PREVIEW_MESH]: async () => {
          calls.push(GEOMETRY_LEVELS.PREVIEW_MESH);
          return { mesh: 'preview' };
        },
        [GEOMETRY_LEVELS.FULL_MESH]: async () => {
          calls.push(GEOMETRY_LEVELS.FULL_MESH);
          return { mesh: 'full' };
        }
      }
    });

    await expect(ref.loadLevel(GEOMETRY_LEVELS.BOUNDS)).resolves.toEqual({
      min: [0, 0, 0],
      max: [1, 2, 3]
    });
    await expect(ref.loadLevel(GEOMETRY_LEVELS.PREVIEW_MESH)).resolves.toEqual({ mesh: 'preview' });
    await expect(ref.loadLevel(GEOMETRY_LEVELS.PREVIEW_MESH)).resolves.toEqual({ mesh: 'preview' });
    await expect(ref.load()).resolves.toEqual({ mesh: 'full' });

    expect(calls).toEqual([GEOMETRY_LEVELS.PREVIEW_MESH, GEOMETRY_LEVELS.FULL_MESH]);
    expect(ref.cacheKey(GEOMETRY_LEVELS.FULL_MESH)).toBe('rhino:object-1:17:FullMesh');
  });

  it('compresses meshes, restores meshes, computes bounds, and creates smaller previews', () => {
    const vertices = [
      new Geo.Point3(0, 0, 0),
      new Geo.Point3(2, 0, 0),
      new Geo.Point3(2, 3, 0),
      new Geo.Point3(0, 3, 4)
    ];
    const faces = [
      [0, 1, 2],
      [0, 2, 3],
      [0, 1, 3],
      [1, 2, 3]
    ];
    const mesh = new Geo.Mesh3(vertices, faces, 0x89b4fa);

    expect(meshBounds(mesh)).toEqual({ min: [0, 0, 0], max: [2, 3, 4] });

    const compressed = compressMesh(mesh);
    expect(compressed._type).toBe('CompressedMesh');
    expect(compressed.vertices).toBeInstanceOf(Float32Array);
    expect(compressed.indices.length).toBe(12);

    const restored = decompressMesh(compressed, Geo);
    expect(restored._type).toBe('Mesh3');
    expect(restored.vertices).toHaveLength(4);
    expect(restored.faces).toEqual(faces);

    const preview = createPreviewMesh(mesh, { maxFaces: 2 });
    expect(preview._preview).toBe(true);
    expect(preview.faces.length).toBeLessThan(mesh.faces.length);
  });

  it('progressively loads bounds before preview meshes', async () => {
    const store = new GeometryStore();
    const order = [];
    const refs = ['a', 'b'].map(id => createGeometryRef({
      host: 'revit',
      id,
      versionId: 'v1',
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      levels: {
        [GEOMETRY_LEVELS.BOUNDS]: async () => {
          order.push(`${id}:bounds`);
          return { id, level: GEOMETRY_LEVELS.BOUNDS };
        },
        [GEOMETRY_LEVELS.PREVIEW_MESH]: async () => {
          order.push(`${id}:preview`);
          return { id, level: GEOMETRY_LEVELS.PREVIEW_MESH };
        }
      }
    }));
    const progress = [];
    const loader = new ProgressiveLoading({ store, batchSize: 1 });

    const result = await loader.loadInitial(refs, {
      onProgress: event => progress.push(event.level)
    });

    expect(result.bounds).toEqual([
      { min: [0, 0, 0], max: [1, 1, 1] },
      { min: [0, 0, 0], max: [1, 1, 1] }
    ]);
    expect(result.previewMeshes).toEqual([
      { id: 'a', level: GEOMETRY_LEVELS.PREVIEW_MESH },
      { id: 'b', level: GEOMETRY_LEVELS.PREVIEW_MESH }
    ]);
    expect(order).toEqual(['a:preview', 'b:preview']);
    expect(progress).toEqual([
      GEOMETRY_LEVELS.BOUNDS,
      GEOMETRY_LEVELS.BOUNDS,
      GEOMETRY_LEVELS.PREVIEW_MESH,
      GEOMETRY_LEVELS.PREVIEW_MESH
    ]);
  });
});
