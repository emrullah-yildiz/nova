import { describe, it, expect } from 'vitest';
import {
  NovaFormaBridge,
  createNovaFormaBridge,
  FormaNotPairedError,
  FormaNotImplementedError,
  FormaValidationError,
  FORMA_MESSAGE_TYPES,
  FORMA_MESSAGE_PAYLOAD_VALIDATORS,
  FORMA_WRITE_MESSAGE_TYPES,
  isFormaWriteMessage,
  createFormaEnvelope,
  validateFormaEnvelope,
  validateFormaMessage
} from '../src/integrations/forma/forma-bridge.js';

// The 14 bridge methods FM-M1 pins to. getGeometry is the SINGLE consolidated
// geometry getter (replaces the old triangle-mesh + building-elements split).
const EXPECTED_METHODS = [
  'getProposal',
  'getSelection',
  'getGeometry',
  'getTerrain',
  'getSiteLimits',
  'pickElement',
  'sendGeometry',
  'buildingByFootprint',
  'updateBuilding',
  'areaMetrics',
  'sunAnalysis',
  'daylightResult',
  'georeference',
  'units'
];

describe('NovaFormaBridge — interface surface', () => {
  it('exposes every expected method as a function', () => {
    const bridge = new NovaFormaBridge();
    for (const name of EXPECTED_METHODS) {
      expect(typeof bridge[name], `method ${name}`).toBe('function');
    }
  });

  it('does NOT expose a split triangle-mesh / building-elements getter (consolidated into getGeometry)', () => {
    const bridge = new NovaFormaBridge();
    expect(bridge.getTriangleMesh).toBeUndefined();
    expect(bridge.getBuildingElements).toBeUndefined();
    expect(typeof bridge.getGeometry).toBe('function');
  });

  it('createNovaFormaBridge() returns a NovaFormaBridge', () => {
    expect(createNovaFormaBridge()).toBeInstanceOf(NovaFormaBridge);
  });

  it('is unpaired with no relay and paired when a relay is injected', () => {
    expect(new NovaFormaBridge().isPaired()).toBe(false);
    expect(new NovaFormaBridge({ relay: {} }).isPaired()).toBe(true);
  });
});

describe('NovaFormaBridge — unpaired rejects with FORMA_NOT_PAIRED', () => {
  const callArgs = {
    getGeometry: [['urn:p1']],
    sendGeometry: [{ geometry: { kind: 'mesh' }, name: 'x' }],
    buildingByFootprint: [{ footprint: {}, height: 10 }],
    updateBuilding: [{ path: 'urn:b1', height: 12 }],
    areaMetrics: [['urn:p1']],
    sunAnalysis: [['urn:p1']],
    daylightResult: [['urn:p1']]
  };

  for (const name of EXPECTED_METHODS) {
    it(`${name}() rejects with FORMA_NOT_PAIRED when unpaired`, async () => {
      const bridge = new NovaFormaBridge();
      const args = callArgs[name] || [];
      await expect(bridge[name](...args)).rejects.toBeInstanceOf(FormaNotPairedError);
      await expect(bridge[name](...args)).rejects.toMatchObject({ code: 'FORMA_NOT_PAIRED' });
    });
  }
});

describe('NovaFormaBridge — paired but FM-M0 rejects valid calls with NOT_IMPLEMENTED_FM1', () => {
  const paired = () => new NovaFormaBridge({ relay: {}, pairingCode: 'pair-123' });

  it('getProposal (no payload) reaches NOT_IMPLEMENTED_FM1 (passes validation)', async () => {
    await expect(paired().getProposal()).rejects.toBeInstanceOf(FormaNotImplementedError);
    await expect(paired().getProposal()).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED_FM1' });
  });

  it('getGeometry with valid paths reaches NOT_IMPLEMENTED_FM1', async () => {
    await expect(paired().getGeometry(['urn:p1', 'urn:p2'])).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED_FM1',
      messageType: FORMA_MESSAGE_TYPES.GEOMETRY_GET
    });
  });

  it('a valid write (buildingByFootprint) reaches NOT_IMPLEMENTED_FM1 (no approval gate)', async () => {
    await expect(paired().buildingByFootprint({ footprint: {}, height: 9 })).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED_FM1',
      messageType: FORMA_MESSAGE_TYPES.BUILDING_CREATE
    });
  });
});

describe('NovaFormaBridge — paired calls validate the envelope before dispatch', () => {
  const paired = () => new NovaFormaBridge({ relay: {}, pairingCode: 'pair-123' });

  it('getGeometry with non-string paths rejects with FormaValidationError', async () => {
    await expect(paired().getGeometry([42, {}])).rejects.toBeInstanceOf(FormaValidationError);
    await expect(paired().getGeometry([42, {}])).rejects.toMatchObject({ code: 'FORMA_VALIDATION_FAILED' });
  });

  it('buildingByFootprint without a height rejects with FormaValidationError', async () => {
    await expect(paired().buildingByFootprint({ footprint: {} })).rejects.toBeInstanceOf(FormaValidationError);
  });

  it('sendGeometry without geometry rejects with FormaValidationError', async () => {
    await expect(paired().sendGeometry({ name: 'x' })).rejects.toBeInstanceOf(FormaValidationError);
  });

  it('updateBuilding with neither mesh nor height rejects with FormaValidationError', async () => {
    await expect(paired().updateBuilding({ path: 'urn:b1' })).rejects.toBeInstanceOf(FormaValidationError);
  });
});

describe('Forma protocol — message types + validators', () => {
  it('every message type has a registered validator', () => {
    for (const type of Object.values(FORMA_MESSAGE_TYPES)) {
      expect(typeof FORMA_MESSAGE_PAYLOAD_VALIDATORS[type], `validator for ${type}`).toBe('function');
    }
  });

  it('write message types are exactly the three create/update ops', () => {
    expect(FORMA_WRITE_MESSAGE_TYPES.sort()).toEqual([
      FORMA_MESSAGE_TYPES.BUILDING_CREATE,
      FORMA_MESSAGE_TYPES.BUILDING_UPDATE,
      FORMA_MESSAGE_TYPES.GEOMETRY_SEND
    ].sort());
    expect(isFormaWriteMessage(FORMA_MESSAGE_TYPES.GEOMETRY_GET)).toBe(false);
    expect(isFormaWriteMessage(FORMA_MESSAGE_TYPES.GEOMETRY_SEND)).toBe(true);
  });

  it('createFormaEnvelope produces a pairing-code-scoped envelope', () => {
    const env = createFormaEnvelope({
      type: FORMA_MESSAGE_TYPES.PROPOSAL_GET,
      pairingCode: 'pair-9'
    });
    expect(env.version).toBe(1);
    expect(env.id).toBeTruthy();
    expect(env.type).toBe(FORMA_MESSAGE_TYPES.PROPOSAL_GET);
    expect(env.pairingCode).toBe('pair-9');
    expect(env.source).toBe('nova-app');
  });

  it('validateFormaEnvelope flags a missing type', () => {
    const result = validateFormaEnvelope({ id: 'x', source: 'nova-app' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('type');
  });

  it('validateFormaMessage validates the payload for a known type', () => {
    const bad = createFormaEnvelope({
      type: FORMA_MESSAGE_TYPES.BUILDING_CREATE,
      payload: { footprint: {} } // missing height
    });
    expect(validateFormaMessage(bad).ok).toBe(false);

    const good = createFormaEnvelope({
      type: FORMA_MESSAGE_TYPES.BUILDING_CREATE,
      payload: { footprint: {}, height: 10 }
    });
    expect(validateFormaMessage(good).ok).toBe(true);
  });
});
