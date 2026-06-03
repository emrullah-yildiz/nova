// Golden worked examples — a curated library of expert, runnable reference
// designs. Two jobs:
//  1. Quality pin: golden-examples.test.js runs every `code` through the Python
//     runner and asserts it executes and yields geometry, so a kernel/method
//     regression is caught immediately.
//  2. Prompt grounding: buildGoldenGallery() injects a compact palette (title +
//     intent + key methods) so the model knows the range of academically-
//     defensible forms it can produce and which Geo.* calls realize them.
//
// Each example is canonical Nova Python: parametric, real Geo.* methods only.

export const GOLDEN_EXAMPLES = [
  {
    id: 'twisted-tower',
    title: 'Twisted tapered tower',
    intent: 'rotating elliptical floor plates lofted into a smooth shell',
    methods: ['twistedEllipsePlates', 'loft', 'smooth'],
    code: [
      'floors = 28',
      'profiles = Geo.twistedEllipsePlates(floors, 4.0, 9, 6, 60, 0.18, 48)',
      'tower = Geo.smooth(Geo.loft(profiles))',
      'print(tower)'
    ].join('\n')
  },
  {
    id: 'organic-pavilion',
    title: 'Organic pavilion',
    intent: 'sin-modulated profile stack lofted into a vase/pavilion shell',
    methods: ['organicProfileStack', 'loft', 'smooth'],
    code: [
      'profiles = Geo.organicProfileStack(12, 10, 18, 48, 0.6)',
      'pavilion = Geo.smooth(Geo.loft(profiles))',
      'print(pavilion)'
    ].join('\n')
  },
  {
    id: 'catenary-shell',
    title: 'Catenary minimal-surface shell',
    intent: 'inverted catenary (pure compression, Gaudí/Otto), thickened to a roof',
    methods: ['createCatenaryShell', 'thicken'],
    code: [
      'shell = Geo.createCatenaryShell(24, 10, 60)',
      'roof = Geo.thicken(shell, 0.4)',
      'print(roof)'
    ].join('\n')
  },
  {
    id: 'hypar-roof',
    title: 'Hyperbolic-paraboloid roof',
    intent: 'doubly-ruled saddle — a buildable doubly-curved shell',
    methods: ['createHyperbolicParaboloid', 'thicken'],
    code: [
      'hypar = Geo.createHyperbolicParaboloid(24, 18, 0.5, 40)',
      'roof = Geo.thicken(hypar, 0.3)',
      'print(roof)'
    ].join('\n')
  },
  {
    id: 'gyroid-lattice',
    title: 'Gyroid lattice block',
    intent: 'triply-periodic minimal surface — structural / biomimetic infill',
    methods: ['createGyroid'],
    code: [
      'lattice = Geo.createGyroid(20, 6, 24)',
      'print(lattice)'
    ].join('\n')
  },
  {
    id: 'nurbs-shell',
    title: 'NURBS freeform shell',
    intent: 'degree-3 control grid → C² smooth freeform surface',
    methods: ['createNurbsSurface'],
    code: [
      'import math',
      'grid = []',
      'for i in range(5):',
      '    row = []',
      '    for j in range(5):',
      '        x = (i - 2) * 4',
      '        y = (j - 2) * 4',
      '        z = 3 * math.sin(i * 0.9) * math.cos(j * 0.9)',
      '        row.append(Geo.Point3(x, y, z))',
      '    grid.append(row)',
      'shell = Geo.createNurbsSurface(grid, 3, 3)',
      'print(shell)'
    ].join('\n')
  },
  {
    id: 'attractor-facade',
    title: 'Attractor-driven facade studs',
    intent: 'phyllotactic field; stud radius grows near a hot-spot attractor',
    methods: ['phyllotaxis', 'pointAttractor', 'createSphere', 'combineAll'],
    code: [
      'field = Geo.phyllotaxis(180, 14, 0.6)',
      'hot = Geo.Point3(6, 6, 0)',
      'studs = []',
      'for i in range(180):',
      '    p = field[i]',
      '    influence = Geo.pointAttractor(p, hot, 20, 2)',
      '    studs.append(Geo.createSphere(p, 0.15 + 0.5 * influence))',
      'facade = Geo.combineAll(studs)',
      'print(facade)'
    ].join('\n')
  },
  {
    id: 'voronoi-skin',
    title: 'Voronoi cellular skin [approx]',
    intent: 'phyllotactic sites → extruded Voronoi cells (organic cladding)',
    methods: ['phyllotaxis', 'voronoiMesh', 'combineAll'],
    code: [
      'sites = Geo.phyllotaxis(120, 12, 0.7)',
      'cells = Geo.voronoiMesh(sites)',
      'skin = Geo.combineAll(cells)',
      'print(skin)'
    ].join('\n')
  },
  {
    id: 'noise-blob',
    title: 'Noise-deformed organic mass',
    intent: 'a sphere displaced by Perlin noise into an organic blob',
    methods: ['createSphere', 'noiseDeform'],
    code: [
      'ball = Geo.createSphere(Geo.Point3(0, 0, 0), 8, 32)',
      'blob = Geo.noiseDeform(ball, 1.5, 0.3, 7)',
      'print(blob)'
    ].join('\n')
  },
  {
    id: 'seashell',
    title: 'Logarithmic seashell',
    intent: 'logarithmic-spiral growth tube — organic parametric form',
    methods: ['createSeashell'],
    code: [
      'shell = Geo.createSeashell(5, 1.4, 120)',
      'print(shell)'
    ].join('\n')
  },
  {
    id: 'helix-structure',
    title: 'Helical swept structure',
    intent: 'helix path piped into a spiral structural member',
    methods: ['helicalCurve', 'Polyline3', 'pipe'],
    code: [
      'pts = Geo.helicalCurve(5, 20, 6, 200)',
      'rail = Geo.Polyline3(pts)',
      'spiral = Geo.pipe(rail, 0.4)',
      'print(spiral)'
    ].join('\n')
  },
  {
    id: 'diagrid-facade',
    title: 'Structural diagrid',
    intent: 'diagonal structural grid for an expressive facade',
    methods: ['diagridPattern'],
    code: [
      'grid = Geo.diagridPattern(20, 40, 8, 16)',
      'print(grid)'
    ].join('\n')
  }
];

// Compact palette for the system prompt — one line per example.
export function buildGoldenGallery() {
  const lines = [
    '=== EXPERT GALLERY (forms you can produce — imitate these patterns) ===',
    'Each is a proven, runnable composition. Match the user\'s intent to one of these and adapt its parameters.',
    ''
  ];
  for (const ex of GOLDEN_EXAMPLES) {
    lines.push(`• ${ex.title} — ${ex.intent}  [${ex.methods.join(', ')}]`);
  }
  return lines.join('\n').trim();
}
