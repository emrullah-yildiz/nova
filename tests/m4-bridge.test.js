import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  requestSelection,
  placeInstance,
  getParameters,
  setParameters,
  BridgeValidationError
} from '../src/integrations/revit/revit-bridge.js';
import {
  MESSAGE_TYPES,
  createEnvelope,
  validateMessage
} from '../src/integrations/connect/protocol.js';

// A mock NovaConnectClient transport. It records every M4 send and returns a
// canned response. Each send method also re-validates the envelope it would put
// on the wire (built the same way the bridge does) so the tests prove the
// bridge produces CONTRACT-VALID envelopes end to end, not just well-shaped
// payloads.
function makeMockClient(responses = {}) {
  const sent = [];
  function record(type, payload, options) {
    sent.push({ type, payload, options });
    const envelope = createEnvelope({
      type,
      source: client.source,
      target: 'host',
      sessionId: client.sessionId,
      projectId: client.projectId,
      payload
    });
    const validation = validateMessage(envelope);
    sent[sent.length - 1].envelope = envelope;
    sent[sent.length - 1].validation = validation;
    return Promise.resolve(responses[type] || {});
  }
  const client = {
    source: 'nova-browser',
    sessionId: 'sess-1',
    projectId: 'prj-1',
    sent,
    sendSelectionQuery: (payload, options) => record(MESSAGE_TYPES.SELECTION_QUERY, payload, options),
    sendGeometryPlace: (payload, options) => record(MESSAGE_TYPES.GEOMETRY_PLACE, payload, options),
    sendParameterGet: (payload, options) => record(MESSAGE_TYPES.PARAMETER_GET, payload, options),
    sendParameterSet: (payload, options) => record(MESSAGE_TYPES.PARAMETER_SET, payload, options)
  };
  return client;
}

describe('M4 RevitBridge — requestSelection', () => {
  it('sends a contract-valid selection.query for an empty request', async () => {
    const client = makeMockClient({
      [MESSAGE_TYPES.SELECTION_QUERY]: { elements: [] }
    });
    const out = await requestSelection({}, { client });
    expect(client.sent).toHaveLength(1);
    const call = client.sent[0];
    expect(call.type).toBe('selection.query');
    expect(call.payload).toEqual({});
    expect(call.validation.ok).toBe(true);
    expect(out).toEqual({ elements: [] });
  });

  it('forwards categories + includeFaces and stays contract-valid', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.SELECTION_QUERY]: { elements: [] } });
    await requestSelection({ categories: ['Walls', 'Floors'], includeFaces: true }, { client });
    const call = client.sent[0];
    expect(call.payload).toEqual({ categories: ['Walls', 'Floors'], includeFaces: true });
    expect(call.validation.ok).toBe(true);
  });

  it('parses selection.result into the contract element shape (with faces)', async () => {
    const client = makeMockClient({
      [MESSAGE_TYPES.SELECTION_QUERY]: {
        elements: [
          {
            id: 12345,
            name: 'Basic Wall',
            category: 'Walls',
            typeName: 'Generic - 200mm',
            levelName: 'Level 1',
            params: { Width: 200, LoadBearing: true },
            faces: [{ faceId: 'f-1', bbox: { min: [0, 0, 0], max: [1, 2, 3] } }]
          }
        ]
      }
    });
    const out = await requestSelection({ includeFaces: true }, { client });
    expect(out.elements).toHaveLength(1);
    const el = out.elements[0];
    expect(el.id).toBe('12345'); // coerced to string
    expect(el.category).toBe('Walls');
    expect(el.params).toEqual({ Width: 200, LoadBearing: true });
    expect(el.faces[0].faceId).toBe('f-1');
  });

  it('tolerates a missing elements array in the response', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.SELECTION_QUERY]: {} });
    const out = await requestSelection({}, { client });
    expect(out).toEqual({ elements: [] });
  });

  it('rejects a malformed selection.query client-side (bad categories)', async () => {
    const client = makeMockClient();
    await expect(requestSelection({ categories: ['Walls', 42] }, { client }))
      .rejects.toBeInstanceOf(BridgeValidationError);
    expect(client.sent).toHaveLength(0); // nothing left the browser
  });
});

describe('M4 RevitBridge — placeInstance', () => {
  it('sends a contract-valid geometry.place for a FamilyInstance', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.GEOMETRY_PLACE]: { ok: true, elementId: 'new-1' } });
    const out = await placeInstance({
      kind: 'FamilyInstance',
      familyType: 'Furniture: Chair',
      points: [[1, 2, 3]]
    }, { client });
    const call = client.sent[0];
    expect(call.type).toBe('geometry.place');
    expect(call.validation.ok).toBe(true);
    expect(call.payload.points).toEqual([[1, 2, 3]]);
    expect(out).toEqual({ ok: true, elementId: 'new-1' });
  });

  it('normalizes {x,y,z} points and a single point into [x,y,z] tuples', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.GEOMETRY_PLACE]: {} });
    await placeInstance({
      kind: 'FamilyInstance',
      familyType: 'X',
      points: { x: 1, y: 2, z: 3 }
    }, { client });
    expect(client.sent[0].payload.points).toEqual([[1, 2, 3]]);
    expect(client.sent[0].validation.ok).toBe(true);
  });

  it('forwards hostFaceId + params + approval metadata', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.GEOMETRY_PLACE]: {} });
    await placeInstance({
      kind: 'AdaptiveComponent',
      familyType: 'Panel: 4-Point',
      points: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
      hostFaceId: 'f-1',
      params: { Thickness: 12 },
      approval: { approved: true }
    }, { client });
    const call = client.sent[0];
    expect(call.payload.hostFaceId).toBe('f-1');
    expect(call.payload.params).toEqual({ Thickness: 12 });
    expect(call.payload.approval).toEqual({ approved: true });
    expect(call.validation.ok).toBe(true);
  });

  it('rejects an unknown placement kind client-side', async () => {
    const client = makeMockClient();
    await expect(placeInstance({ kind: 'DirectShape', familyType: 'X', points: [[0, 0, 0]] }, { client }))
      .rejects.toMatchObject({ name: 'BridgeValidationError' });
    expect(client.sent).toHaveLength(0);
  });

  it('rejects empty points client-side', async () => {
    const client = makeMockClient();
    await expect(placeInstance({ kind: 'FamilyInstance', familyType: 'X', points: [] }, { client }))
      .rejects.toBeInstanceOf(BridgeValidationError);
  });
});

describe('M4 RevitBridge — getParameters / setParameters (new { elementId, params } contract)', () => {
  it('sends a contract-valid parameter.get with null placeholder values', async () => {
    const client = makeMockClient({
      [MESSAGE_TYPES.PARAMETER_GET]: { elementId: 'el-1', params: { Width: 200, Height: 3000 } }
    });
    const out = await getParameters('el-1', ['Width', 'Height'], { client });
    const call = client.sent[0];
    expect(call.type).toBe('parameter.get');
    expect(call.payload).toEqual({ elementId: 'el-1', params: { Width: null, Height: null } });
    expect(call.validation.ok).toBe(true);
    expect(out).toEqual({ elementId: 'el-1', params: { Width: 200, Height: 3000 } });
  });

  it('accepts a single parameter name (not an array)', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.PARAMETER_GET]: { params: {} } });
    await getParameters('el-1', 'Width', { client });
    expect(client.sent[0].payload.params).toEqual({ Width: null });
    expect(client.sent[0].validation.ok).toBe(true);
  });

  it('rejects a parameter.get with no names client-side (empty params)', async () => {
    const client = makeMockClient();
    await expect(getParameters('el-1', [], { client }))
      .rejects.toBeInstanceOf(BridgeValidationError);
    expect(client.sent).toHaveLength(0);
  });

  it('sends a contract-valid parameter.set with the { elementId, params } shape', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.PARAMETER_SET]: { ok: true } });
    const out = await setParameters('el-1', { Width: 1200, Comment: 'updated', LoadBearing: false }, { client });
    const call = client.sent[0];
    expect(call.type).toBe('parameter.set');
    expect(call.payload).toEqual({
      elementId: 'el-1',
      params: { Width: 1200, Comment: 'updated', LoadBearing: false }
    });
    expect(call.validation.ok).toBe(true);
    expect(out).toEqual({ ok: true });
  });

  it('forwards approval metadata on parameter.set (WRITE)', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.PARAMETER_SET]: {} });
    await setParameters('el-1', { Width: 1 }, { client, approval: { approved: true, approvalId: 'a-9' } });
    expect(client.sent[0].payload.approval).toEqual({ approved: true, approvalId: 'a-9' });
    expect(client.sent[0].validation.ok).toBe(true);
  });

  it('rejects a parameter.set with a non-scalar value client-side', async () => {
    const client = makeMockClient();
    await expect(setParameters('el-1', { Width: [1, 2, 3] }, { client }))
      .rejects.toBeInstanceOf(BridgeValidationError);
    expect(client.sent).toHaveLength(0);
  });

  it('rejects a parameter.set with a missing elementId client-side', async () => {
    const client = makeMockClient();
    await expect(setParameters('', { Width: 1 }, { client }))
      .rejects.toBeInstanceOf(BridgeValidationError);
  });

  it('surfaces structured validator errors on the BridgeValidationError', async () => {
    const client = makeMockClient();
    try {
      await setParameters('el-1', {}, { client });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BridgeValidationError);
      expect(err.type).toBe('parameter.set');
      expect(Array.isArray(err.errors)).toBe(true);
      expect(err.errors.some(e => /at least one parameter/.test(e))).toBe(true);
    }
  });
});

describe('M4 RevitBridge — client resolution + legacy coexistence', () => {
  let prevWindow;
  beforeEach(() => {
    prevWindow = globalThis.window;
  });
  afterEach(() => {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
  });

  it('falls back to window.NovaConnect when no client is injected', async () => {
    const client = makeMockClient({ [MESSAGE_TYPES.SELECTION_QUERY]: { elements: [] } });
    globalThis.window = { NovaConnect: client };
    const out = await requestSelection({});
    expect(out).toEqual({ elements: [] });
    expect(client.sent).toHaveLength(1);
  });

  it('throws a clear error when no client is available', async () => {
    delete globalThis.window;
    await expect(requestSelection({}, {})).rejects.toThrow(/Nova Connect client is not available/);
  });

  it('does NOT call the legacy parameter methods (keeps revit-nodes.js path intact)', async () => {
    let legacyGetCalled = false;
    let legacySetCalled = false;
    const client = makeMockClient({
      [MESSAGE_TYPES.PARAMETER_GET]: { params: {} },
      [MESSAGE_TYPES.PARAMETER_SET]: {}
    });
    client.getParameterValues = () => { legacyGetCalled = true; return Promise.resolve([]); };
    client.setParameterValues = () => { legacySetCalled = true; return Promise.resolve([]); };
    await getParameters('el-1', ['Width'], { client });
    await setParameters('el-1', { Width: 1 }, { client });
    expect(legacyGetCalled).toBe(false);
    expect(legacySetCalled).toBe(false);
  });
});
