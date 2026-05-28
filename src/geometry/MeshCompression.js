export function meshBounds(mesh) {
  if (!mesh || !Array.isArray(mesh.vertices) || mesh.vertices.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  mesh.vertices.forEach(vertex => {
    const coords = Array.isArray(vertex) ? vertex : [vertex.x, vertex.y, vertex.z];
    for (let i = 0; i < 3; i++) {
      const value = Number(coords[i] || 0);
      min[i] = Math.min(min[i], value);
      max[i] = Math.max(max[i], value);
    }
  });
  return { min, max };
}

export function compressMesh(mesh) {
  if (!mesh || !Array.isArray(mesh.vertices)) return null;
  const vertices = new Float32Array(mesh.vertices.length * 3);
  mesh.vertices.forEach((vertex, index) => {
    const coords = Array.isArray(vertex) ? vertex : [vertex.x, vertex.y, vertex.z];
    vertices[index * 3] = Number(coords[0] || 0);
    vertices[index * 3 + 1] = Number(coords[1] || 0);
    vertices[index * 3 + 2] = Number(coords[2] || 0);
  });
  const flatFaces = [];
  (mesh.faces || []).forEach(face => flatFaces.push(face[0] || 0, face[1] || 0, face[2] || 0));
  const IndexArray = mesh.vertices.length > 65535 ? Uint32Array : Uint16Array;
  return {
    _type: 'CompressedMesh',
    vertices,
    indices: new IndexArray(flatFaces),
    color: mesh.color || 0x89b4fa,
    bounds: meshBounds(mesh)
  };
}

export function decompressMesh(compressed, Geo) {
  if (!compressed || compressed._type !== 'CompressedMesh') return compressed;
  if (!Geo || !Geo.Point3 || !Geo.Mesh3) {
    throw new Error('decompressMesh requires the Geo library.');
  }
  const vertices = [];
  for (let i = 0; i < compressed.vertices.length; i += 3) {
    vertices.push(new Geo.Point3(compressed.vertices[i], compressed.vertices[i + 1], compressed.vertices[i + 2]));
  }
  const faces = [];
  for (let i = 0; i < compressed.indices.length; i += 3) {
    faces.push([compressed.indices[i], compressed.indices[i + 1], compressed.indices[i + 2]]);
  }
  return new Geo.Mesh3(vertices, faces, compressed.color);
}

export function createPreviewMesh(mesh, options = {}) {
  if (!mesh || !Array.isArray(mesh.faces)) return mesh;
  const maxFaces = options.maxFaces || 1000;
  if (mesh.faces.length <= maxFaces) return mesh;
  const stride = Math.ceil(mesh.faces.length / maxFaces);
  const faces = mesh.faces.filter((_face, index) => index % stride === 0);
  return {
    ...mesh,
    faces,
    _type: mesh._type || 'Mesh3',
    _preview: true
  };
}

export default {
  meshBounds,
  compressMesh,
  decompressMesh,
  createPreviewMesh
};
