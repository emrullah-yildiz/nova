// ============================================================================
// Nova Forma — browser-side Forma bridge SKELETON (FM-M0)
// ----------------------------------------------------------------------------
// Option B (revit-forma-node-plan.md §7 DECISION, 2026-06-04): a thin Nova
// extension lives INSIDE Forma (Embedded View SDK iframe) and bridges data to
// the STANDALONE Nova web app. Because both ends are browser contexts, the
// transport is a CLOUD RELAY — a Cloudflare Durable Object "pairing room" both
// the Forma extension and the Nova tab join by a pairing code — NOT a localhost
// hub (the Revit case). See docs/architecture/forma-connect.md.
//
// This file is the FM-M0 SKELETON only. It defines:
//   1. The `NovaFormaBridge` client interface (async-handle shape mirroring
//      src/integrations/revit/revit-bridge.js) with INERT method STUBS.
//   2. The Forma protocol message types + a validator registry (mirroring
//      src/integrations/connect/protocol.js's MESSAGE_TYPES /
//      MESSAGE_PAYLOAD_VALIDATORS / validateMessage shape).
//
// NO live Forma SDK calls, NO live relay, NO `forma`-category nodes — those are
// FM-M1. Every getter/writer STUB rejects: with FORMA_NOT_PAIRED when no relay
// transport is paired, otherwise with NOT_IMPLEMENTED_FM1. Stubs are inert and
// safe to import; they perform no I/O.
//
// IMPORTANT — consolidated geometry getter (owner decision): `getGeometry(paths)`
// is the SINGLE consolidated geometry getter. It REPLACES the plan's earlier
// split `Forma.GetTriangleMesh` + `Forma.GetBuildingElements` getters; FM-M1
// node defs map onto this one method.
//
// SECURITY (forma-connect.md): Forma writes need NO user-approval gate (owner
// decision) — they act inside the user's own authenticated Forma session — but
// they remain PAIRING-SCOPED (a valid relay pairing is required) and AUDITABLE.
// No provider API keys or enterprise secrets pass through the relay.
// ============================================================================

// ── Protocol: Forma message types + validators ─────────────────────────────
// Mirrors connect/protocol.js. These are the wire `type` values for the Forma
// extension ⇄ relay ⇄ Nova round-trip. FM-M1 handlers and node defs pin to the
// payload shapes documented on each validator. Keep MESSAGE_TYPES and
// FORMA_MESSAGE_PAYLOAD_VALIDATORS in lockstep.

export const NOVA_FORMA_PROTOCOL_VERSION = 1;

export const FORMA_MESSAGE_TYPES = {
  // Nova → Forma ext: read current proposal/project metadata.
  PROPOSAL_GET: 'forma.proposal.get',
  // Nova → Forma ext: read the user's current Forma selection (element paths).
  SELECTION_GET: 'forma.selection.get',
  // Nova → Forma ext: the SINGLE consolidated geometry getter (replaces the
  // old triangle-mesh + building-elements split). Returns meshes for paths.
  GEOMETRY_GET: 'forma.geometry.get',
  // Nova → Forma ext: terrain mesh for the site.
  TERRAIN_GET: 'forma.terrain.get',
  // Nova → Forma ext: site boundary polygon.
  SITE_LIMITS_GET: 'forma.siteLimits.get',
  // Nova → Forma ext: interactive pick of an element in the Forma canvas.
  PICK_ELEMENT: 'forma.pick.element',
  // Nova → Forma ext (WRITE): send a Nova mesh/solid/surface into the proposal.
  GEOMETRY_SEND: 'forma.geometry.send',
  // Nova → Forma ext (WRITE): create a building volume from a footprint+height.
  BUILDING_CREATE: 'forma.building.create',
  // Nova → Forma ext (WRITE): update an existing building volume.
  BUILDING_UPDATE: 'forma.building.update',
  // Nova → Forma ext: GFA / footprint / count metrics for paths.
  AREA_METRICS: 'forma.metrics.area',
  // Nova → Forma ext: run/read a sun-hours analysis result.
  SUN_ANALYSIS: 'forma.analysis.sun',
  // Nova → Forma ext: read a daylight analysis result.
  DAYLIGHT_RESULT: 'forma.analysis.daylight',
  // Nova → Forma ext: project lat/lon + reference frame.
  GEOREFERENCE_GET: 'forma.georeference.get',
  // Nova → Forma ext: project unit system.
  UNITS_GET: 'forma.units.get'
};

/** Forma write operations. Unlike Revit, these require NO user-approval gate
 *  (owner decision) — but they are pairing-scoped and audited by the relay. */
export const FORMA_WRITE_MESSAGE_TYPES = [
  FORMA_MESSAGE_TYPES.GEOMETRY_SEND,
  FORMA_MESSAGE_TYPES.BUILDING_CREATE,
  FORMA_MESSAGE_TYPES.BUILDING_UPDATE
];

/** True if a Forma message `type` is a write operation. */
export function isFormaWriteMessage(type) {
  return FORMA_WRITE_MESSAGE_TYPES.includes(type);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A Forma element path is a non-empty string (Forma's urn-style element ref). */
function isPath(value) {
  return isNonEmptyString(value);
}

/** Validate that `paths` (when present) is an array of element-path strings. */
function validateOptionalPaths(payload, errors, label) {
  if (payload.paths === undefined) return;
  if (!Array.isArray(payload.paths) || !payload.paths.every(isPath)) {
    errors.push(`${label} paths must be an array of non-empty element-path strings`);
  }
}

/** Empty-payload reader (no required fields): proposal/terrain/siteLimits/georef/units. */
function validateEmptyReaderPayload(payload, errors, label) {
  if (payload !== undefined && payload !== null && !isPlainObject(payload)) {
    errors.push(`${label} payload must be an object when present`);
  }
}

/** Paths-scoped reader: geometry.get / metrics / analysis. `paths` optional;
 *  when present must be element-path strings. */
function validatePathsReaderPayload(payload, errors, label) {
  if (!isPlainObject(payload)) {
    errors.push(`${label} payload must be an object`);
    return;
  }
  validateOptionalPaths(payload, errors, label);
}

/** `forma.geometry.send` (WRITE): { geometry, name? }. `geometry` is a Nova
 *  GeometryEnvelope or raw mesh/solid/surface; `name` optional label. */
function validateGeometrySendPayload(payload, errors) {
  if (!isPlainObject(payload)) {
    errors.push('forma.geometry.send payload must be an object');
    return;
  }
  if (payload.geometry === undefined || payload.geometry === null) {
    errors.push('forma.geometry.send geometry is required');
  }
  if (payload.name !== undefined && typeof payload.name !== 'string') {
    errors.push('forma.geometry.send name must be a string when present');
  }
}

/** `forma.building.create` (WRITE): { footprint, height }. `footprint` is a
 *  closed curve/polygon; `height` a finite number. */
function validateBuildingCreatePayload(payload, errors) {
  if (!isPlainObject(payload)) {
    errors.push('forma.building.create payload must be an object');
    return;
  }
  if (payload.footprint === undefined || payload.footprint === null) {
    errors.push('forma.building.create footprint is required');
  }
  if (!isFiniteNumber(payload.height)) {
    errors.push('forma.building.create height is required (finite number)');
  }
}

/** `forma.building.update` (WRITE): { path, mesh?, height? }. `path` identifies
 *  the existing volume; at least one of `mesh`/`height` must be present. */
function validateBuildingUpdatePayload(payload, errors) {
  if (!isPlainObject(payload)) {
    errors.push('forma.building.update payload must be an object');
    return;
  }
  if (!isPath(payload.path)) {
    errors.push('forma.building.update path is required (non-empty string)');
  }
  const hasMesh = payload.mesh !== undefined && payload.mesh !== null;
  const hasHeight = payload.height !== undefined;
  if (!hasMesh && !hasHeight) {
    errors.push('forma.building.update requires at least one of mesh or height');
  }
  if (hasHeight && !isFiniteNumber(payload.height)) {
    errors.push('forma.building.update height must be a finite number when present');
  }
}

/** `forma.pick.element`: no payload fields required (interactive). */
function validatePickElementPayload(payload, errors) {
  if (payload !== undefined && payload !== null && !isPlainObject(payload)) {
    errors.push('forma.pick.element payload must be an object when present');
  }
}

/**
 * Registry mapping Forma message `type` → payload validator. Used by
 * `validateFormaMessage`. Adding a new round-trip message means adding its type
 * to `FORMA_MESSAGE_TYPES` and a validator here.
 */
export const FORMA_MESSAGE_PAYLOAD_VALIDATORS = {
  [FORMA_MESSAGE_TYPES.PROPOSAL_GET]: (p, e) => validateEmptyReaderPayload(p, e, 'forma.proposal.get'),
  [FORMA_MESSAGE_TYPES.SELECTION_GET]: (p, e) => validateEmptyReaderPayload(p, e, 'forma.selection.get'),
  [FORMA_MESSAGE_TYPES.GEOMETRY_GET]: (p, e) => validatePathsReaderPayload(p, e, 'forma.geometry.get'),
  [FORMA_MESSAGE_TYPES.TERRAIN_GET]: (p, e) => validateEmptyReaderPayload(p, e, 'forma.terrain.get'),
  [FORMA_MESSAGE_TYPES.SITE_LIMITS_GET]: (p, e) => validateEmptyReaderPayload(p, e, 'forma.siteLimits.get'),
  [FORMA_MESSAGE_TYPES.PICK_ELEMENT]: validatePickElementPayload,
  [FORMA_MESSAGE_TYPES.GEOMETRY_SEND]: validateGeometrySendPayload,
  [FORMA_MESSAGE_TYPES.BUILDING_CREATE]: validateBuildingCreatePayload,
  [FORMA_MESSAGE_TYPES.BUILDING_UPDATE]: validateBuildingUpdatePayload,
  [FORMA_MESSAGE_TYPES.AREA_METRICS]: (p, e) => validatePathsReaderPayload(p, e, 'forma.metrics.area'),
  [FORMA_MESSAGE_TYPES.SUN_ANALYSIS]: (p, e) => validatePathsReaderPayload(p, e, 'forma.analysis.sun'),
  [FORMA_MESSAGE_TYPES.DAYLIGHT_RESULT]: (p, e) => validatePathsReaderPayload(p, e, 'forma.analysis.daylight'),
  [FORMA_MESSAGE_TYPES.GEOREFERENCE_GET]: (p, e) => validateEmptyReaderPayload(p, e, 'forma.georeference.get'),
  [FORMA_MESSAGE_TYPES.UNITS_GET]: (p, e) => validateEmptyReaderPayload(p, e, 'forma.units.get')
};

/**
 * Build a Forma relay envelope. Mirrors connect/protocol.js's `createEnvelope`
 * shape but is pairing-code-scoped (`pairingCode`) rather than localhost
 * session-scoped, because the transport is a cloud relay (Durable Object room).
 */
export function createFormaEnvelope({
  type,
  source = 'nova-app',
  target = 'forma-extension',
  pairingCode = '',
  payload,
  id,
  timestamp,
  error
} = {}) {
  return {
    version: NOVA_FORMA_PROTOCOL_VERSION,
    id: id || createId('fmsg'),
    type,
    source,
    target,
    pairingCode: String(pairingCode || ''),
    timestamp: timestamp || Date.now(),
    payload: payload || {},
    error: error || null
  };
}

/** Validate the envelope shape (version/id/type/source) before routing. */
export function validateFormaEnvelope(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object') errors.push('Envelope must be an object');
  if (!envelope || !envelope.type) errors.push('Envelope type is required');
  if (!envelope || !envelope.source) errors.push('Envelope source is required');
  if (!envelope || !envelope.id) errors.push('Envelope id is required');
  return { ok: errors.length === 0, errors };
}

/**
 * Validate a full Forma message: envelope shape AND, when the `type` has a
 * registered validator, its `payload` shape. Same `{ ok, errors }` contract as
 * connect/protocol.js's `validateMessage`. Unknown types pass payload check
 * (envelope-only), matching the relay's permissive routing for control frames.
 */
export function validateFormaMessage(envelope) {
  const { errors } = validateFormaEnvelope(envelope);
  if (envelope && typeof envelope === 'object') {
    const validator = FORMA_MESSAGE_PAYLOAD_VALIDATORS[envelope.type];
    if (validator) validator(envelope.payload, errors);
  }
  return { ok: errors.length === 0, errors };
}

function createId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
}

// ── Errors ──────────────────────────────────────────────────────────────────

/**
 * Thrown by every bridge method when no relay transport is paired. Carries the
 * stable code `FORMA_NOT_PAIRED` so callers/tests can branch without string
 * matching. The Forma bridge is inert until the user activates the connection
 * (pairing code → Durable Object room).
 */
export class FormaNotPairedError extends Error {
  constructor(method) {
    super(`Nova Forma bridge is not paired (${method}). Activate the connection with a pairing code first.`);
    this.name = 'FormaNotPairedError';
    this.code = 'FORMA_NOT_PAIRED';
    this.method = method;
  }
}

/**
 * Thrown by a bridge method whose live behavior is deferred to FM-M1. Carries
 * the stable code `NOT_IMPLEMENTED_FM1`. FM-M0 ships the interface + protocol
 * only; the relay/SDK plumbing lands in FM-M1.
 */
export class FormaNotImplementedError extends Error {
  constructor(method, messageType) {
    super(`Nova Forma bridge method "${method}" is not implemented yet (FM-M1, ${messageType}).`);
    this.name = 'FormaNotImplementedError';
    this.code = 'NOT_IMPLEMENTED_FM1';
    this.method = method;
    this.messageType = messageType;
  }
}

/**
 * Thrown when a request envelope fails Forma protocol validation. Mirrors the
 * Revit bridge's `BridgeValidationError` shape (structured `.errors`).
 */
export class FormaValidationError extends Error {
  constructor(type, errors) {
    super(`Invalid ${type} Forma request: ${errors.join('; ')}`);
    this.name = 'FormaValidationError';
    this.code = 'FORMA_VALIDATION_FAILED';
    this.type = type;
    this.errors = errors;
  }
}

// ── NovaFormaBridge ───────────────────────────────────────────────────────────

/**
 * `NovaFormaBridge` — the browser-side async handle to a paired Forma session,
 * mirroring the Revit bridge's async-handle shape. In FM-M1 a relay client
 * (the Durable-Object pairing-room transport — Link's deliverable) is injected
 * via `options.relay`; FM-M0 ships the surface with inert stubs.
 *
 * Pairing model (Option B): the user activates the connection from Nova; a
 * pairing code joins the Nova tab and the Forma extension iframe to the same
 * Durable Object relay room. `isPaired()` reflects whether such a transport is
 * present. Until then every method rejects with `FORMA_NOT_PAIRED`. Once a
 * transport is present, FM-M0 stubs still reject with `NOT_IMPLEMENTED_FM1`
 * (no live relay/SDK wiring is built here).
 *
 * @param {{ relay?: object, pairingCode?: string, source?: string }} [options]
 */
export class NovaFormaBridge {
  constructor(options = {}) {
    // The relay transport (Durable Object pairing-room client) — injected in
    // FM-M1. Null in FM-M0 → the bridge is unpaired and inert.
    this.relay = options.relay || null;
    this.pairingCode = options.pairingCode || '';
    this.source = options.source || 'nova-app';
  }

  /** True only when a relay transport is present (a pairing has been activated). */
  isPaired() {
    return !!this.relay;
  }

  /**
   * FM-M0 guard for every method. Rejects unpaired calls with
   * `FORMA_NOT_PAIRED`; for paired calls it (a) validates the request envelope
   * against the Forma protocol, then (b) rejects with `NOT_IMPLEMENTED_FM1`
   * because no live relay/SDK is wired yet. FM-M1 replaces the
   * `NotImplemented` throw with a real `relay.request(envelope)` send.
   *
   * @param {string} method - calling method name (for error context).
   * @param {string} messageType - FORMA_MESSAGE_TYPES value for this call.
   * @param {object} [payload] - request payload to validate.
   */
  async _dispatch(method, messageType, payload = {}) {
    if (!this.isPaired()) {
      throw new FormaNotPairedError(method);
    }
    const envelope = createFormaEnvelope({
      type: messageType,
      source: this.source,
      target: 'forma-extension',
      pairingCode: this.pairingCode,
      payload
    });
    const validation = validateFormaMessage(envelope);
    if (!validation.ok) {
      throw new FormaValidationError(messageType, validation.errors);
    }
    // FM-M1: return this.relay.request(envelope, opts) here.
    throw new FormaNotImplementedError(method, messageType);
  }

  // ── §4.1 Proposal / Project read [R] ───────────────────────────────────────

  /** Read current proposal/project metadata → { proposal, name, id }. */
  async getProposal() {
    return this._dispatch('getProposal', FORMA_MESSAGE_TYPES.PROPOSAL_GET, {});
  }

  /** Read the user's current Forma selection → { paths, count }. */
  async getSelection() {
    return this._dispatch('getSelection', FORMA_MESSAGE_TYPES.SELECTION_GET, {});
  }

  // ── §4.2 Geometry read [R] — SINGLE consolidated getter ────────────────────

  /**
   * The SINGLE consolidated geometry getter (owner decision) — replaces the
   * plan's split `GetTriangleMesh` + `GetBuildingElements`. Returns meshes for
   * the given element paths (or the whole proposal when omitted).
   *
   * @param {string[]} [paths] - element paths; omit/empty for the whole proposal.
   * @returns {Promise<{ meshes: object[], count: number }>}
   */
  async getGeometry(paths) {
    const payload = paths === undefined ? {} : { paths };
    return this._dispatch('getGeometry', FORMA_MESSAGE_TYPES.GEOMETRY_GET, payload);
  }

  // ── §4.3 Terrain / Site read [R] ───────────────────────────────────────────

  /** Terrain mesh for the site → { mesh, bbox }. */
  async getTerrain() {
    return this._dispatch('getTerrain', FORMA_MESSAGE_TYPES.TERRAIN_GET, {});
  }

  /** Site boundary polygon → { curve }. */
  async getSiteLimits() {
    return this._dispatch('getSiteLimits', FORMA_MESSAGE_TYPES.SITE_LIMITS_GET, {});
  }

  // ── §4.4 Selection [R] ─────────────────────────────────────────────────────

  /** Interactive pick of an element in the Forma canvas → { path }. */
  async pickElement() {
    return this._dispatch('pickElement', FORMA_MESSAGE_TYPES.PICK_ELEMENT, {});
  }

  // ── §4.5 Element create / update [W] (no approval gate; pairing-scoped) ─────

  /**
   * Send a Nova mesh/solid/surface into the Forma proposal (Nova→Forma half of
   * the geometry round-trip). WRITE: no user-approval gate, but pairing-scoped
   * and audited by the relay.
   *
   * @param {{ geometry: object, name?: string }} spec
   * @returns {Promise<{ path: string, success: boolean }>}
   */
  async sendGeometry(spec = {}) {
    const payload = { geometry: spec.geometry };
    if (spec.name !== undefined) payload.name = spec.name;
    return this._dispatch('sendGeometry', FORMA_MESSAGE_TYPES.GEOMETRY_SEND, payload);
  }

  /**
   * Create a building volume from a footprint + height. WRITE (pairing-scoped).
   *
   * @param {{ footprint: object, height: number }} spec
   * @returns {Promise<{ path: string, success: boolean }>}
   */
  async buildingByFootprint(spec = {}) {
    return this._dispatch('buildingByFootprint', FORMA_MESSAGE_TYPES.BUILDING_CREATE, {
      footprint: spec.footprint,
      height: spec.height
    });
  }

  /**
   * Update an existing building volume's geometry. WRITE (pairing-scoped).
   *
   * @param {{ path: string, mesh?: object, height?: number }} spec
   * @returns {Promise<{ success: boolean }>}
   */
  async updateBuilding(spec = {}) {
    const payload = { path: spec.path };
    if (spec.mesh !== undefined) payload.mesh = spec.mesh;
    if (spec.height !== undefined) payload.height = spec.height;
    return this._dispatch('updateBuilding', FORMA_MESSAGE_TYPES.BUILDING_UPDATE, payload);
  }

  // ── §4.6 Metrics / Analysis [R] ────────────────────────────────────────────

  /** GFA / footprint / count metrics for paths → { gfa, footprintArea, count }. */
  async areaMetrics(paths) {
    const payload = paths === undefined ? {} : { paths };
    return this._dispatch('areaMetrics', FORMA_MESSAGE_TYPES.AREA_METRICS, payload);
  }

  /** Run/read a sun-hours analysis result → { values, summary }. */
  async sunAnalysis(paths) {
    const payload = paths === undefined ? {} : { paths };
    return this._dispatch('sunAnalysis', FORMA_MESSAGE_TYPES.SUN_ANALYSIS, payload);
  }

  /** Read a daylight analysis result → { values }. */
  async daylightResult(paths) {
    const payload = paths === undefined ? {} : { paths };
    return this._dispatch('daylightResult', FORMA_MESSAGE_TYPES.DAYLIGHT_RESULT, payload);
  }

  // ── §4.7 Render / Units / Georeference [R] ─────────────────────────────────

  /** Project lat/lon + reference frame → { lat, lon, frame }. */
  async georeference() {
    return this._dispatch('georeference', FORMA_MESSAGE_TYPES.GEOREFERENCE_GET, {});
  }

  /** Project unit system → { units }. */
  async units() {
    return this._dispatch('units', FORMA_MESSAGE_TYPES.UNITS_GET, {});
  }
}

export function createNovaFormaBridge(options = {}) {
  return new NovaFormaBridge(options);
}

export default NovaFormaBridge;
