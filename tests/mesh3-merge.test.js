// Unit tests for src/viewer/mesh3-merge.js — the Mesh3-array → single merged
// Mesh3 + per-source faceGroups helper that makes EACH element of a Mesh3 array
// (e.g. Surface.Panelize panels) an independently selectable face, even when all
// elements are coplanar.

import { describe, it, expect } from 'vitest';
import { isMesh3Array, mergeMesh3Array } from '../src/viewer/mesh3-merge.js';
import { Geo } from '../src/geometry/index.js';

function flatPanel(x0, z) {
  // A flat quad panel in the z = `z` plane (all coplanar when z is shared).
  const v = [
    new Geo.Point3(x0, 0, z),
    new Geo.Point3(x0 + 1, 0, z),
    new Geo.Point3(x0 + 1, 1, z),
    new Geo.Point3(x0, 1, z),
  ];
  const f = [[0, 1, 2], [0, 2, 3]];
  return new Geo.Mesh3(v, f, 0x94e2d5);
}

describe('mesh3-merge', () => {
  it('isMesh3Array detects an array of Mesh3 and rejects others', () => {
    expect(isMesh3Array([flatPanel(0, 0), flatPanel(2, 0)])).toBe(true);
    expect(isMesh3Array([flatPanel(0, 0)])).toBe(true);
    expect(isMesh3Array([])).toBe(false);
    expect(isMesh3Array(flatPanel(0, 0))).toBe(false);
    expect(isMesh3Array([{ _type: 'Point3', x: 0, y: 0, z: 0 }])).toBe(false);
    expect(isMesh3Array(null)).toBe(false);
  });

  it('merges N coplanar panels into one mesh with one group PER source panel', () => {
    // Three panels all in the z = 0 plane — groupFaces() would collapse to 1.
    const panels = [flatPanel(0, 0), flatPanel(2, 0), flatPanel(4, 0)];
    const { mesh, faceGroups } = mergeMesh3Array(panels, Geo.Mesh3);

    // One selectable group per source panel — NOT coplanar-merged.
    expect(faceGroups.length).toBe(3);
    // Each panel had 4 verts + 2 faces → merged totals.
    expect(mesh.vertices.length).toBe(12);
    expect(mesh.faces.length).toBe(6);

    // groupFaces() on the merged mesh WOULD collapse them (proves the bug we avoid).
    expect(mesh.groupFaces().length).toBe(1);

    // Each group owns exactly its source panel's 2 triangles, with offset indices.
    expect(faceGroups[0].triangleIndices).toEqual([0, 1]);
    expect(faceGroups[1].triangleIndices).toEqual([2, 3]);
    expect(faceGroups[2].triangleIndices).toEqual([4, 5]);
    expect(faceGroups[1].sourceIndex).toBe(1);
  });

  it('offsets face indices so merged faces reference the correct vertices', () => {
    const panels = [flatPanel(0, 0), flatPanel(2, 0)];
    const { mesh } = mergeMesh3Array(panels, Geo.Mesh3);
    // Panel 1's faces must point into rows 4..7 (after panel 0's 4 verts).
    expect(mesh.faces[2]).toEqual([4, 5, 6]);
    expect(mesh.faces[3]).toEqual([4, 6, 7]);
  });

  it('getFaceVertices on the merged mesh returns each panel polygon independently', () => {
    const panels = [flatPanel(0, 0), flatPanel(10, 0)];
    const { mesh, faceGroups } = mergeMesh3Array(panels, Geo.Mesh3);
    const p0 = mesh.getFaceVertices(0, faceGroups);
    const p1 = mesh.getFaceVertices(1, faceGroups);
    // Panel 0 corners are around x∈[0,1]; panel 1 around x∈[10,11] — distinct.
    expect(p0.every((v) => v[0] <= 1.0001)).toBe(true);
    expect(p1.every((v) => v[0] >= 9.9999)).toBe(true);
    expect(p0.length).toBeGreaterThanOrEqual(3);
    expect(p1.length).toBeGreaterThanOrEqual(3);
  });

  it('a single-element array merges to one group (parity with single mesh)', () => {
    const { mesh, faceGroups } = mergeMesh3Array([flatPanel(0, 0)], Geo.Mesh3);
    expect(faceGroups.length).toBe(1);
    expect(mesh.vertices.length).toBe(4);
    expect(mesh.faces.length).toBe(2);
  });
});
