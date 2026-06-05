// Capability ledger — the design-facing view of Nova's geometry kernel for the
// AI system prompt. Where node-catalog.js is a flat, exhaustive node list, this
// is a CURATED, intent-grouped map of the architecturally-meaningful Geo.* calls
// with a one-line "when to use" note and an honesty flag on the weak ops.
//
// Drift policy: signatures for node-backed methods are pulled from the registry
// via getGeoSignatureMap() (never hand-copied). The overlay below adds only the
// design SEMANTICS the kernel can't express (intent group, note, approx/stub
// flag) plus an authored signature for the handful of utility methods that have
// no node. capability-ledger.test.js asserts every method named here actually
// exists in getKnownGeoMethods(), so the ledger can never advertise a method the
// validator would reject.

import { getGeoSignatureMap } from './node-catalog.js';

// group: design intent · methods: [{ name, note?, flag?('approx'|'stub'), sig? }]
// sig is only needed for utility methods with no node-derived signature.
const GROUPS = [
  {
    title: 'Mathematical surfaces — name the math, justify the form',
    methods: [
      { name: 'createGyroid', note: 'triply-periodic minimal surface — lattice / biomimetic infill' },
      { name: 'createCatenaryShell', note: 'pure-compression shell (Gaudí, Frei Otto)' },
      { name: 'createHyperbolicParaboloid', note: 'doubly-ruled saddle — buildable curved roof' },
      { name: 'createHyperboloid', note: 'ruled one-sheet — cooling-tower / lattice tower' },
      { name: 'createEnneperSurface', note: 'minimal surface, 4-fold symmetry' },
      { name: 'createDiniSurface', note: 'constant negative curvature spiral' },
      { name: 'createSeashell', note: 'logarithmic-spiral growth' },
      { name: 'createMobiusStrip', note: 'one-sided ruled surface' },
      { name: 'createKleinBottle', note: 'non-orientable topology study' }
    ]
  },
  {
    title: 'Form-finding fields — drive variation by position',
    methods: [
      { name: 'multiAttractor', sig: 'Geo.multiAttractor(pt, attractors[], radius, falloff) → 0..1', note: 'panel size / inset / height from proximity; falloff 1 = hard, 2 = soft bloom' },
      { name: 'pointAttractor', sig: 'Geo.pointAttractor(pt, pos, radius, falloff) → 0..1', note: 'single-attractor influence' },
      { name: 'fbm', sig: 'Geo.fbm(x, y, z, octaves, lacunarity, gain) → -1..1', note: 'layered organic variation (octaves = detail layers)' },
      { name: 'perlin3', sig: 'Geo.perlin3(x, y, z) → -1..1', note: 'single-octave noise' },
      { name: 'phyllotaxis', note: 'golden-angle seed distribution (sunflower)' },
      { name: 'fibonacciSphere', note: 'even point spread on a sphere' },
      { name: 'attractorDeform', note: 'pull mesh vertices toward attractors' },
      { name: 'noiseDeform', note: 'Perlin displacement of mesh vertices' }
    ]
  },
  {
    title: 'Surfacing — the large gestures',
    methods: [
      { name: 'loft', sig: 'Geo.loft(profiles[]) → mesh', note: 'CLOSE each ring, equal point counts; follow with Geo.smooth()' },
      { name: 'revolve', note: 'spin a profile around an axis' },
      { name: 'sweep', note: 'profile along a rail (Frenet frames)' },
      { name: 'coonsPatch', note: '4-boundary blended patch' },
      { name: 'createNurbsSurface', note: 'freeform control-grid surface (degree 3 = C² smooth)' },
      { name: 'wavyGrid', note: 'sin/cos doubly-curved canopy in one call' },
      { name: 'surfaceByPatch', note: 'fill a closed boundary' }
    ]
  },
  {
    title: 'Panelization — host ON a surface, then vary by a field',
    methods: [
      { name: 'facadePanelsOnSurface', sig: 'Geo.facadePanelsOnSurface(surface, uPanels, vPanels) → {points, frame}[]', note: 'rectangular panels projected onto a curved surface — returns panel objects {points, frame} for Panel.ByPoints' },
      { name: 'voronoiCellObjects', sig: 'Geo.voronoiCellObjects(sites, bounds, resolution) → {points, frame}[]', flag: 'approx', note: 'Voronoi boundary polygon objects — grid-sampled, not true Voronoi; each cell is {points, frame}' },
      { name: 'hexPanelGrid', note: 'hex / diamond panels wrapping a profile stack' },
      { name: 'diagridPattern', note: 'structural diagonal grid' },
      { name: 'hexGrid', note: 'planar honeycomb tiling' },
      { name: 'diamondGrid', note: 'planar diamond tiling' }
    ]
  },
  {
    title: 'Solids & boolean',
    methods: [
      { name: 'createBox' },
      { name: 'createSphere' },
      { name: 'createCylinder' },
      { name: 'createCone' },
      { name: 'createTorus' },
      { name: 'extrude', note: 'curve + Vector3 direction' },
      { name: 'booleanUnion', sig: 'Geo.booleanUnion(a, b) → mesh', flag: 'approx', note: 'concatenates meshes — NOT true CSG; fine to visually merge' },
      { name: 'booleanSubtract', sig: 'Geo.booleanSubtract(a, b) → mesh', flag: 'stub', note: 'does NOT really cut — don\'t rely on clean voids; model the void as geometry' },
      { name: 'combineAll', sig: 'Geo.combineAll(meshes[]) → mesh', note: 'flatten a list of meshes' },
      { name: 'smooth', note: 'Laplacian — soften angular lofts' },
      { name: 'subdivide', note: 'refine facets (≤ 50k faces)' },
      { name: 'thicken', note: 'shell a surface into a slab' }
    ]
  },
  {
    title: 'Transforms & arrays',
    methods: [
      { name: 'move' },
      { name: 'rotate' },
      { name: 'scaleGeo' },
      { name: 'mirror' },
      { name: 'arrayLinear' },
      { name: 'arrayPolar' },
      { name: 'arrayAlongCurve', sig: 'Geo.arrayAlongCurve(geo, curve, count) → geo[]' }
    ]
  }
];

// Builds the intent-grouped capability block for the system prompt. Node-backed
// signatures come from the registry; the overlay supplies intent + notes + flags.
export function buildCapabilityLedger() {
  const sigMap = getGeoSignatureMap();
  const lines = [
    '=== NOVA DESIGN CAPABILITIES (grouped by intent) ===',
    'Choose tools by design intent. Items tagged [approx] or [stub] are weak — compose AROUND them (model the result with geometry rather than relying on the op).',
    ''
  ];
  for (const g of GROUPS) {
    lines.push('## ' + g.title);
    for (const m of g.methods) {
      const sig = sigMap[m.name] || m.sig || ('Geo.' + m.name + '(…)');
      const flag = m.flag ? ` [${m.flag}]` : '';
      const note = m.note ? ` — ${m.note}` : '';
      lines.push(`• ${sig}${flag}${note}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

// Every method name the ledger references — used by the drift test to assert
// they all exist in the validator's known-methods set.
export function _ledgerMethodNames() {
  const names = [];
  for (const g of GROUPS) for (const m of g.methods) names.push(m.name);
  return names;
}
