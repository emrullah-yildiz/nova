// Generates two .nodeflow stress-test graphs for Nova:
//   1. stress-1000-nodes-no-geometry.nodeflow  — 1000 pure value/math nodes,
//      zero geometry. Exercises node-count, wire-count, and deep dependency
//      resolution without touching the geometry/render path.
//   2. stress-1000-nodes-10k-geometry.nodeflow — 1000 geometry nodes that
//      together emit ~10,000 mesh primitives. Exercises evaluation + the 3D
//      viewer under heavy geometry load.
//
// The graph builders are shared with the landing-page template cards
// (src/ui/node-library.js → src/app/stress-graphs.js), so these files and the
// in-app templates stay identical. Output matches app.serializeGraph()
// (src/app/save-load.js, schema version 2). Run:
//
//   node stress-tests/generate-stress-tests.mjs
//
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildNoGeometryGraph, buildGeometryGraph } from '../src/app/stress-graphs.js';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const ROWS = 2, COLS = 5;
const f1 = buildNoGeometryGraph(1000);
const f2 = buildGeometryGraph(1000, ROWS, COLS);

const f1Path = join(OUT_DIR, 'stress-1000-nodes-no-geometry.nodeflow');
const f2Path = join(OUT_DIR, 'stress-1000-nodes-10k-geometry.nodeflow');
writeFileSync(f1Path, JSON.stringify(f1));
writeFileSync(f2Path, JSON.stringify(f2));

console.log('Wrote ' + f1Path);
console.log('  nodes: ' + f1.nodes.length + ', wires: ' + f1.wires.length + ', geometry: 0');
console.log('Wrote ' + f2Path);
console.log('  nodes: ' + f2.nodes.length + ', wires: ' + f2.wires.length + ', geometry: ' + (f2.nodes.length * ROWS * COLS));
