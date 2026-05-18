import {
  SOURCES,
  createEnvelope,
  createGeometryEnvelope,
  createIdentity,
  normalizeElementRecord,
  validateEnvelope
} from '../src/integrations/connect/protocol.js';
import { Geo } from '../src/geometry/index.js';

describe('Nova Connect protocol', () => {
  it('validates required envelope fields', () => {
    const envelope = createEnvelope({
      type: 'elements.query',
      source: 'nova-browser',
      target: 'host',
      sessionId: 'session-1'
    });

    expect(validateEnvelope(envelope)).toEqual({ ok: true, errors: [] });
    expect(validateEnvelope({ source: 'nova-browser' }).ok).toBe(false);
  });

  it('normalizes source identity for model elements', () => {
    const record = normalizeElementRecord({
      id: 42,
      name: 'Wall A',
      category: 'Walls',
      params: { Mark: 'W-01' }
    }, {
      source: SOURCES.REVIT_LOCAL,
      versionId: 'doc-123'
    });

    expect(record._type).toBe('ElementRecord');
    expect(record.identity.source).toBe('revit-local');
    expect(record.identity.sourceId).toBe('42');
    expect(record.identity.versionId).toBe('doc-123');
  });

  it('serializes mesh geometry with units and coordinate identity', () => {
    const mesh = new Geo.Mesh3([
      new Geo.Point3(0, 0, 0),
      new Geo.Point3(1, 0, 0),
      new Geo.Point3(0, 1, 0)
    ], [[0, 1, 2]]);
    const identity = createIdentity({
      source: SOURCES.RHINO,
      sourceId: 'guid-1',
      units: { system: 'millimeters', scaleToMeters: 0.001 },
      coordinateSystem: 'rhino-world'
    });

    const envelope = createGeometryEnvelope(mesh, identity);

    expect(envelope.kind).toBe('mesh');
    expect(envelope.units.scaleToMeters).toBe(0.001);
    expect(envelope.coordinateSystem).toBe('rhino-world');
    expect(envelope.identity.sourceId).toBe('guid-1');
    expect(envelope.data.vertices).toEqual([[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
  });
});
