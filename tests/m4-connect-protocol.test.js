import {
  createEnvelope,
  validateEnvelope,
  validateMessage,
  isWriteMessage,
  MESSAGE_TYPES,
  MESSAGE_PAYLOAD_VALIDATORS,
  WRITE_MESSAGE_TYPES,
  PLACEMENT_KINDS
} from '../src/integrations/connect/protocol.js';

// Build a well-formed envelope around a payload for a given message type.
function envelopeFor(type, payload) {
  return createEnvelope({
    type,
    source: 'nova-browser',
    target: 'host',
    sessionId: 'sess-1',
    projectId: 'prj-1',
    payload
  });
}

describe('M4 Connect protocol — round-trip message classes', () => {
  it('exposes a validator for every M4 message type and keeps the registry in lockstep', () => {
    for (const type of Object.values(MESSAGE_TYPES)) {
      expect(typeof MESSAGE_PAYLOAD_VALIDATORS[type]).toBe('function');
    }
    // No stray validators beyond the declared message types.
    expect(Object.keys(MESSAGE_PAYLOAD_VALIDATORS).sort())
      .toEqual(Object.values(MESSAGE_TYPES).sort());
  });

  it('marks only geometry.place and parameter.set as write operations', () => {
    expect(WRITE_MESSAGE_TYPES.sort()).toEqual(
      [MESSAGE_TYPES.GEOMETRY_PLACE, MESSAGE_TYPES.PARAMETER_SET].sort()
    );
    expect(isWriteMessage(MESSAGE_TYPES.GEOMETRY_PLACE)).toBe(true);
    expect(isWriteMessage(MESSAGE_TYPES.PARAMETER_SET)).toBe(true);
    expect(isWriteMessage(MESSAGE_TYPES.SELECTION_QUERY)).toBe(false);
    expect(isWriteMessage(MESSAGE_TYPES.PARAMETER_GET)).toBe(false);
  });

  it('validateMessage still enforces envelope-level fields', () => {
    const bad = { type: MESSAGE_TYPES.SELECTION_QUERY, payload: {} }; // no id/source
    const res = validateMessage(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some(e => /id is required/.test(e))).toBe(true);
    expect(res.errors.some(e => /source is required/.test(e))).toBe(true);
  });

  it('passes payload validation for message types without a registered validator', () => {
    const res = validateMessage(envelopeFor('ping', { anything: true }));
    expect(res.ok).toBe(true);
  });

  describe('selection.query', () => {
    it('ACCEPTS an empty payload', () => {
      expect(validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_QUERY, {})).ok).toBe(true);
    });
    it('ACCEPTS categories + includeFaces', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_QUERY, {
        categories: ['Walls', 'Floors'],
        includeFaces: true
      }));
      expect(res.ok).toBe(true);
    });
    it('REJECTS non-string categories', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_QUERY, {
        categories: ['Walls', 42]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /categories/.test(e))).toBe(true);
    });
    it('REJECTS non-boolean includeFaces', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_QUERY, {
        includeFaces: 'yes'
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /includeFaces/.test(e))).toBe(true);
    });
    it('REJECTS a non-object payload', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_QUERY, []));
      expect(res.ok).toBe(false);
    });
  });

  describe('selection.result', () => {
    const goodElement = {
      id: 'el-1',
      name: 'Basic Wall',
      category: 'Walls',
      typeName: 'Generic - 200mm',
      levelName: 'Level 1',
      params: { Width: 200, Comment: 'note', LoadBearing: true }
    };

    it('ACCEPTS elements without faces', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, {
        elements: [goodElement]
      }));
      expect(res.ok).toBe(true);
    });
    it('ACCEPTS an empty elements array', () => {
      expect(validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, { elements: [] })).ok).toBe(true);
    });
    it('ACCEPTS elements with faces + bbox', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, {
        elements: [{
          ...goodElement,
          faces: [{ faceId: 'f-1', bbox: { min: [0, 0, 0], max: [1, 2, 3] } }]
        }]
      }));
      expect(res.ok).toBe(true);
    });
    it('REJECTS a missing elements array', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, {}));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /elements must be an array/.test(e))).toBe(true);
    });
    it('REJECTS an element missing id', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, {
        elements: [{ category: 'Walls' }]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /\.id is required/.test(e))).toBe(true);
    });
    it('REJECTS an element missing category', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, {
        elements: [{ id: 'el-1' }]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /\.category is required/.test(e))).toBe(true);
    });
    it('REJECTS object-valued params', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, {
        elements: [{ ...goodElement, params: { Nested: { x: 1 } } }]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /params/.test(e))).toBe(true);
    });
    it('REJECTS a malformed face bbox', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, {
        elements: [{ ...goodElement, faces: [{ faceId: 'f-1', bbox: { min: [0, 0], max: [1, 2, 3] } }] }]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /bbox/.test(e))).toBe(true);
    });
    it('REJECTS a face missing faceId', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.SELECTION_RESULT, {
        elements: [{ ...goodElement, faces: [{ bbox: { min: [0, 0, 0], max: [1, 2, 3] } }] }]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /faceId is required/.test(e))).toBe(true);
    });
  });

  describe('geometry.place', () => {
    it('ACCEPTS a FamilyInstance with one point', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.GEOMETRY_PLACE, {
        kind: 'FamilyInstance',
        familyType: 'Furniture: Chair',
        points: [[1, 2, 3]]
      }));
      expect(res.ok).toBe(true);
    });
    it('ACCEPTS an AdaptiveComponent with multiple points + hostFaceId + params', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.GEOMETRY_PLACE, {
        kind: 'AdaptiveComponent',
        familyType: 'Panel: 4-Point',
        points: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
        hostFaceId: 'f-1',
        params: { Thickness: 12 }
      }));
      expect(res.ok).toBe(true);
    });
    it('REJECTS an unknown kind', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.GEOMETRY_PLACE, {
        kind: 'DirectShape',
        familyType: 'X',
        points: [[0, 0, 0]]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /kind must be one of/.test(e))).toBe(true);
    });
    it('REJECTS a missing familyType', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.GEOMETRY_PLACE, {
        kind: 'FamilyInstance',
        points: [[0, 0, 0]]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /familyType is required/.test(e))).toBe(true);
    });
    it('REJECTS empty points', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.GEOMETRY_PLACE, {
        kind: 'FamilyInstance',
        familyType: 'X',
        points: []
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /points/.test(e))).toBe(true);
    });
    it('REJECTS a malformed point tuple', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.GEOMETRY_PLACE, {
        kind: 'FamilyInstance',
        familyType: 'X',
        points: [[0, 0, 'z']]
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /points/.test(e))).toBe(true);
    });
    it('REJECTS a non-string hostFaceId', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.GEOMETRY_PLACE, {
        kind: 'FamilyInstance',
        familyType: 'X',
        points: [[0, 0, 0]],
        hostFaceId: 5
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /hostFaceId/.test(e))).toBe(true);
    });
    it('declares exactly the two placement kinds', () => {
      expect(PLACEMENT_KINDS).toEqual(['FamilyInstance', 'AdaptiveComponent']);
    });
  });

  describe('parameter.set / parameter.get', () => {
    it('ACCEPTS a valid parameter.set', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.PARAMETER_SET, {
        elementId: 'el-1',
        params: { Width: 1200, Comment: 'updated', LoadBearing: false }
      }));
      expect(res.ok).toBe(true);
    });
    it('ACCEPTS a valid parameter.get (mirror shape, null placeholder values)', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.PARAMETER_GET, {
        elementId: 'el-1',
        params: { Width: null, Height: null }
      }));
      expect(res.ok).toBe(true);
    });
    it('REJECTS a missing elementId', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.PARAMETER_SET, {
        params: { Width: 1 }
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /elementId is required/.test(e))).toBe(true);
    });
    it('REJECTS an empty params map', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.PARAMETER_SET, {
        elementId: 'el-1',
        params: {}
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /at least one parameter/.test(e))).toBe(true);
    });
    it('REJECTS a non-scalar param value', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.PARAMETER_SET, {
        elementId: 'el-1',
        params: { Width: [1, 2, 3] }
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /params/.test(e))).toBe(true);
    });
    it('REJECTS a missing params map (parameter.get)', () => {
      const res = validateMessage(envelopeFor(MESSAGE_TYPES.PARAMETER_GET, {
        elementId: 'el-1'
      }));
      expect(res.ok).toBe(false);
      expect(res.errors.some(e => /params/.test(e))).toBe(true);
    });
  });

  it('keeps validateEnvelope behavior unchanged for the base contract', () => {
    const env = envelopeFor(MESSAGE_TYPES.SELECTION_QUERY, {});
    expect(validateEnvelope(env).ok).toBe(true);
  });
});
