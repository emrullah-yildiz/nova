// scripts/take-learning-shots.js
// Programmatic Playwright screenshot script for the 20 Nova learning example slots.
//
// Usage: node scripts/take-learning-shots.js
//
// The script:
//   1. Spawns the Vite dev server on http://localhost:5173 (kills on exit).
//   2. For each of the 20 slots, navigates the Nova workspace, builds a
//      representative node graph via page.evaluate(), waits for computation,
//      and screenshots #canvas-area.
//   3. Saves each PNG to public/learning/<slot-id>.png.
//   4. Asserts each file is <= 400 KB and logs a warning if exceeded.
//
// Node API used (confirmed from src/app/app.js):
//   app.newProject()                              - clear canvas + switch to workspace
//   app.addNodeToCanvas(type, x, y, opts?)        - add a node, returns node object
//   app.addWire(fromId, fromPort, toId, toPort)   - connect two ports
//   app.setView('3d')                             - switch to 3D viewport
//   app.openTerminal()                            - open code terminal
//   app.invalidateCompute?.()                     - trigger recompute

'use strict';

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

// ── Configuration ──────────────────────────────────────────────────────────────

const SHOTS_DIR = path.join(__dirname, '..', 'public', 'learning');
const BASE_URL = 'http://localhost:5173';
const VIEWPORT = { width: 1280, height: 800 };
const MAX_BYTES = 409600; // 400 KB

// Ensure output directory exists before any screenshot is taken.
fs.mkdirSync(SHOTS_DIR, { recursive: true });

// ── Dev server management ──────────────────────────────────────────────────────

const viteBin = path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
let devServer = null;

function startDevServer() {
  return new Promise((resolve, reject) => {
    console.log('[shots] Starting Vite dev server…');
    devServer = spawn(
      process.execPath,
      [viteBin, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
      { stdio: ['ignore', 'pipe', 'pipe'], shell: false }
    );

    let resolved = false;

    function onData(chunk) {
      const line = chunk.toString();
      if (!resolved && (line.includes('Local:') || line.includes('localhost:5173'))) {
        resolved = true;
        console.log('[shots] Dev server ready.');
        resolve();
      }
    }

    devServer.stdout.on('data', onData);
    devServer.stderr.on('data', onData);

    devServer.on('error', (err) => {
      if (!resolved) reject(err);
    });

    // Fallback: poll HTTP if the log line never matches
    setTimeout(async () => {
      if (resolved) return;
      try {
        await waitForServer(BASE_URL, 45000);
        resolved = true;
        resolve();
      } catch (e) {
        reject(e);
      }
    }, 3000);
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(check, 500);
      });
      req.setTimeout(2000, () => { req.destroy(); });
    }
    check();
  });
}

function stopDevServer() {
  if (devServer && !devServer.killed) {
    devServer.kill();
    devServer = null;
  }
}

process.on('exit', stopDevServer);
process.on('SIGINT', () => { stopDevServer(); process.exit(130); });
process.on('SIGTERM', () => { stopDevServer(); process.exit(143); });

// ── Graph builder helpers (run inside page.evaluate) ──────────────────────────
//
// Each builder returns a function string that page.evaluate executes in the
// browser context where window.app is available.
//
// Helpers use these actual Nova JS API methods:
//   app.newProject()                 — clear canvas + go to workspace
//   app.addNodeToCanvas(type, x, y)  — add a node, returns node object (or null)
//   app.addWire(fnId, fp, tnId, tp)  — connect ports
//   app.setView('3d')                — switch to 3D viewport
//   app.openTerminal()               — open code terminal overlay
//   app.invalidateCompute?.()        — mark graph dirty → auto recompute

// ── Slot graph definitions ─────────────────────────────────────────────────────

/**
 * Each entry: { slotId: string, build: async function(page) }
 * The build function calls page.evaluate() to manipulate the Nova canvas.
 */

async function buildGraph(page, fn) {
  // Reset canvas to a clean workspace before each slot.
  await page.evaluate(() => {
    if (typeof app !== 'undefined') {
      app.newProject();
      if (app.setView) app.setView('nodes');
    }
  });
  await page.waitForTimeout(400);

  try {
    await fn(page);
  } catch (err) {
    console.warn('[shots] Graph builder error (non-fatal):', err.message);
  }

  // Allow auto-computation to settle.
  await page.evaluate(() => {
    if (typeof app !== 'undefined' && app.invalidateCompute) app.invalidateCompute();
  });
  await page.waitForTimeout(1200);
}

// ── 1. intro-simple: Input.Number(5) → Math.Multiply(b=2) → Output.Watch ──────

async function buildIntroSimple(page) {
  await page.evaluate(() => {
    const n1 = app.addNodeToCanvas('Input.Number', 80, 200);
    const n2 = app.addNodeToCanvas('Math.Multiply', 320, 200);
    const n3 = app.addNodeToCanvas('Output.Watch', 560, 200);
    if (!n1 || !n2 || !n3) return;
    if (app.onCtrl) app.onCtrl(n1.id, 'val', 5);
    if (app.onCtrl) app.onCtrl(n2.id, 'b', 2);
    app.addWire(n1.id, 'value', n2.id, 'a');
    app.addWire(n2.id, 'result', n3.id, 'value');
  });
}

// ── 2. intro-advanced: 2× Input.Number → Math.Multiply → Output.Watch ─────────

async function buildIntroAdvanced(page) {
  await page.evaluate(() => {
    const floors = app.addNodeToCanvas('Input.Number', 80, 120);
    const fh = app.addNodeToCanvas('Input.Number', 80, 260);
    const mul = app.addNodeToCanvas('Math.Multiply', 320, 180);
    const watch = app.addNodeToCanvas('Output.Watch', 560, 180);
    if (!floors || !fh || !mul || !watch) return;
    if (app.onCtrl) { app.onCtrl(floors.id, 'val', 10); app.onCtrl(fh.id, 'val', 3); }
    app.addWire(floors.id, 'value', mul.id, 'a');
    app.addWire(fh.id, 'value', mul.id, 'b');
    app.addWire(mul.id, 'result', watch.id, 'value');
  });
}

// ── 3. interface-simple: Math.Add(a=4, b=6) → Output.Watch ───────────────────

async function buildInterfaceSimple(page) {
  await page.evaluate(() => {
    const add = app.addNodeToCanvas('Math.Add', 200, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 460, 200);
    if (!add || !watch) return;
    if (app.onCtrl) { app.onCtrl(add.id, 'a', 4); app.onCtrl(add.id, 'b', 6); }
    app.addWire(add.id, 'result', watch.id, 'value');
  });
}

// ── 4. interface-advanced: Input.Number(100) → List.Range → Output.Watch ─────

async function buildInterfaceAdvanced(page) {
  await page.evaluate(() => {
    const num = app.addNodeToCanvas('Input.Number', 80, 200);
    const range = app.addNodeToCanvas('List.Range', 320, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 560, 200);
    if (!num || !range || !watch) return;
    if (app.onCtrl) { app.onCtrl(num.id, 'val', 100); app.onCtrl(range.id, 'start', 0); }
    app.addWire(num.id, 'value', range.id, 'end');
    app.addWire(range.id, 'list', watch.id, 'value');
  });
}

// ── 5. node-layout-simple: Math.Add(a=7, b=3) → Output.Watch ─────────────────

async function buildNodeLayoutSimple(page) {
  await page.evaluate(() => {
    const add = app.addNodeToCanvas('Math.Add', 200, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 460, 200);
    if (!add || !watch) return;
    if (app.onCtrl) { app.onCtrl(add.id, 'a', 7); app.onCtrl(add.id, 'b', 3); }
    app.addWire(add.id, 'result', watch.id, 'value');
  });
}

// ── 6. node-layout-advanced: Input.Slider → Math.Multiply(b=3) → Output.Watch ─

async function buildNodeLayoutAdvanced(page) {
  await page.evaluate(() => {
    const slider = app.addNodeToCanvas('Input.Slider', 80, 200);
    const mul = app.addNodeToCanvas('Math.Multiply', 320, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 560, 200);
    if (!slider || !mul || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(slider.id, 'min', 0);
      app.onCtrl(slider.id, 'max', 10);
      app.onCtrl(slider.id, 'val', 5);
      app.onCtrl(mul.id, 'b', 3);
    }
    app.addWire(slider.id, 'value', mul.id, 'a');
    app.addWire(mul.id, 'result', watch.id, 'value');
  });
}

// ── 7. data-types-simple: Input.Text("Hello") + Input.Number(42) → 2× Watch ──

async function buildDataTypesSimple(page) {
  await page.evaluate(() => {
    // Input.String does not exist; use Input.Text (output port: value, type: string)
    const str = app.addNodeToCanvas('Input.Text', 80, 120);
    const num = app.addNodeToCanvas('Input.Number', 80, 280);
    const w1 = app.addNodeToCanvas('Output.Watch', 360, 120);
    const w2 = app.addNodeToCanvas('Output.Watch', 360, 280);
    if (!str || !num || !w1 || !w2) return;
    if (app.onCtrl) { app.onCtrl(str.id, 'val', 'Hello'); app.onCtrl(num.id, 'val', 42); }
    app.addWire(str.id, 'value', w1.id, 'value');
    app.addWire(num.id, 'value', w2.id, 'value');
  });
}

// ── 8. data-types-advanced: List.Create → Logic.Compare(>) → List.FilterByBoolean → Watch ─

async function buildDataTypesAdvanced(page) {
  await page.evaluate(() => {
    const create = app.addNodeToCanvas('List.Create', 80, 200);
    const cmp = app.addNodeToCanvas('Logic.Compare', 300, 200);
    const filter = app.addNodeToCanvas('List.FilterByBoolean', 520, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 740, 200);
    if (!create || !cmp || !filter || !watch) return;
    // Set List.Create items 1–5
    if (app.onCtrl) {
      app.onCtrl(create.id, 'item0', 1);
      app.onCtrl(create.id, 'item1', 2);
      // Dynamic inputs: item2, item3, item4 added via the app's dynamic input mechanism
      // For the screenshot, 2 items (1 and 2) are enough to show the filter concept.
      // Set Logic.Compare operator to '>' with b=2
      app.onCtrl(cmp.id, 'b', 2);
      app.onCtrl(cmp.id, 'op', '>');
    }
    // list → compare.a (lacing applies comparison to each item)
    app.addWire(create.id, 'list', cmp.id, 'a');
    // compare.result → filter.mask; create.list → filter.list
    app.addWire(cmp.id, 'result', filter.id, 'mask');
    app.addWire(create.id, 'list', filter.id, 'list');
    // filter.inList → watch
    app.addWire(filter.id, 'inList', watch.id, 'value');
  });
}

// ── 9. math-simple: Sum of squares — 3² + 4² = 25 (Pythagorean a²+b² step) ───
// No CodeBlock needed — avoids all port-materialization timing issues.
// Graph: Input.Number(3) → Multiply(a=self,b=self) = 9
//        Input.Number(4) → Multiply(a=self,b=self) = 16
//        Both results → Math.Add = 25 → Output.Watch

async function buildMathSimple(page) {
  await page.evaluate(() => {
    const numA = app.addNodeToCanvas('Input.Number', 80, 120);
    const numB = app.addNodeToCanvas('Input.Number', 80, 300);
    const mul1 = app.addNodeToCanvas('Math.Multiply', 300, 120);
    const mul2 = app.addNodeToCanvas('Math.Multiply', 300, 300);
    const add  = app.addNodeToCanvas('Math.Add', 500, 210);
    const watch = app.addNodeToCanvas('Output.Watch', 700, 210);
    if (!numA || !numB || !mul1 || !mul2 || !add || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(numA.id, 'val', 3);
      app.onCtrl(numB.id, 'val', 4);
    }
    // 3² = 9
    app.addWire(numA.id, 'value', mul1.id, 'a');
    app.addWire(numA.id, 'value', mul1.id, 'b');
    // 4² = 16
    app.addWire(numB.id, 'value', mul2.id, 'a');
    app.addWire(numB.id, 'value', mul2.id, 'b');
    // 9 + 16 = 25
    app.addWire(mul1.id, 'result', add.id, 'a');
    app.addWire(mul2.id, 'result', add.id, 'b');
    app.addWire(add.id, 'result', watch.id, 'value');
  });
}

// ── 10. math-advanced: List.Range(0,360,45) → CodeBlock(sin of degrees) → Watch ─
// Two-phase evaluate: Phase 1 creates nodes + sets controls (including code).
// Phase 2 (after a 500 ms wait) adds wires so CodeBlock ports have materialised.
// The Input.Number override of List.Range.end is removed — range is set directly
// via onCtrl so the range is always 0..360 (8 values: 0,45,90,135,180,225,270,315).

async function buildMathAdvanced(page) {
  // Phase 1: create nodes and set all controls
  const ids = await page.evaluate(() => {
    const range = app.addNodeToCanvas('List.Range', 180, 200);
    const cb    = app.addNodeToCanvas('Custom.CodeBlock', 440, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 680, 200);
    if (!range || !cb || !watch) return null;
    if (app.onCtrl) {
      app.onCtrl(range.id, 'start', 0);
      app.onCtrl(range.id, 'end', 360);
      app.onCtrl(range.id, 'step', 45);   // 8 values: 0,45,90,…,315
      app.onCtrl(cb.id, 'code', 'sineVals = sin(rad(angles))');
    }
    return { rangeId: range.id, cbId: cb.id, watchId: watch.id };
  });

  if (!ids) return; // nodes failed to create

  // Wait for CodeBlock to materialise its 'angles' input and 'sineVals' output port
  await page.waitForTimeout(500);

  // Phase 2: add wires now that ports exist
  await page.evaluate(({ rangeId, cbId, watchId }) => {
    app.addWire(rangeId, 'list',     cbId,    'angles');
    app.addWire(cbId,    'sineVals', watchId, 'value');
  }, ids);
}

// ── 11. geometry-simple: 2× Point.ByCoordinates → Line.ByStartPointEndPoint ──

async function buildGeometrySimple(page) {
  await page.evaluate(() => {
    const pt1 = app.addNodeToCanvas('Point.ByCoordinates', 80, 120);
    const pt2 = app.addNodeToCanvas('Point.ByCoordinates', 80, 280);
    const line = app.addNodeToCanvas('Line.ByStartPointEndPoint', 320, 200);
    if (!pt1 || !pt2 || !line) return;
    if (app.onCtrl) {
      app.onCtrl(pt1.id, 'x', 0); app.onCtrl(pt1.id, 'y', 0); app.onCtrl(pt1.id, 'z', 0);
      app.onCtrl(pt2.id, 'x', 5); app.onCtrl(pt2.id, 'y', 3); app.onCtrl(pt2.id, 'z', 0);
    }
    app.addWire(pt1.id, 'point', line.id, 'startPoint');
    app.addWire(pt2.id, 'point', line.id, 'endPoint');
  });
  // Switch to 3D to show the line in the viewport
  await page.evaluate(() => { if (app.setView) app.setView('3d'); });
  await page.waitForTimeout(800);
}

// ── 12. geometry-advanced: 4× Point → Polyline.ByPoints + Surface.ByCurveExtrude ─

async function buildGeometryAdvanced(page) {
  await page.evaluate(() => {
    const coords = [[0,0,0],[4,0,0],[4,3,0],[0,3,0]];
    const pts = coords.map(([x,y,z], i) => {
      const p = app.addNodeToCanvas('Point.ByCoordinates', 80, 80 + i * 100);
      if (p && app.onCtrl) { app.onCtrl(p.id, 'x', x); app.onCtrl(p.id, 'y', y); app.onCtrl(p.id, 'z', z); }
      return p;
    }).filter(Boolean);

    const create = app.addNodeToCanvas('List.Create', 280, 200);
    // PolyCurve.ByPoints doesn't exist; use Polyline.ByPoints
    const poly = app.addNodeToCanvas('Polyline.ByPoints', 460, 200);
    const vec = app.addNodeToCanvas('Vector.ByCoordinates', 280, 360);
    const extrude = app.addNodeToCanvas('Surface.ByCurveExtrude', 640, 260);

    if (!create || !poly || !vec || !extrude) return;
    if (app.onCtrl) {
      app.onCtrl(vec.id, 'x', 0); app.onCtrl(vec.id, 'y', 0); app.onCtrl(vec.id, 'z', 5);
    }

    // Wire points into List.Create (items item0..item3)
    const portIds = ['item0','item1','item2','item3'];
    pts.forEach((pt, i) => { if (portIds[i]) app.addWire(pt.id, 'point', create.id, portIds[i]); });

    app.addWire(create.id, 'list', poly.id, 'points');
    app.addWire(poly.id, 'curve', extrude.id, 'curve');
    app.addWire(vec.id, 'vector', extrude.id, 'vector');
  });
  await page.evaluate(() => { if (app.setView) app.setView('3d'); });
  await page.waitForTimeout(800);
}

// ── 13. lists-simple: List.Create(10,20,30) → List.Reverse → Output.Watch ────

async function buildListsSimple(page) {
  await page.evaluate(() => {
    const create = app.addNodeToCanvas('List.Create', 80, 200);
    const rev = app.addNodeToCanvas('List.Reverse', 320, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 520, 200);
    if (!create || !rev || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(create.id, 'item0', 10);
      app.onCtrl(create.id, 'item1', 20);
    }
    app.addWire(create.id, 'list', rev.id, 'list');
    app.addWire(rev.id, 'result', watch.id, 'value');
  });
}

// ── 14. lists-advanced: 2× List.Range → Point.ByCoordinates (cross-product) ──

async function buildListsAdvanced(page) {
  await page.evaluate(() => {
    const rangeX = app.addNodeToCanvas('List.Range', 80, 120);
    const rangeY = app.addNodeToCanvas('List.Range', 80, 280);
    const pt = app.addNodeToCanvas('Point.ByCoordinates', 320, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 540, 200);
    if (!rangeX || !rangeY || !pt || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(rangeX.id, 'start', 0); app.onCtrl(rangeX.id, 'end', 5); app.onCtrl(rangeX.id, 'step', 1);
      app.onCtrl(rangeY.id, 'start', 0); app.onCtrl(rangeY.id, 'end', 4); app.onCtrl(rangeY.id, 'step', 1);
    }
    app.addWire(rangeX.id, 'list', pt.id, 'x');
    app.addWire(rangeY.id, 'list', pt.id, 'y');
    app.addWire(pt.id, 'point', watch.id, 'value');
  });
}

// ── 15. python-simple: List.Create(1,2) → Custom.Python(squares) → Watch ─────
// Two-phase: Phase 1 sets the Python code so the runtime can infer ports.
// Phase 2 (after 500 ms) wires the now-materialised 'elements' input + 'result' output.

async function buildPythonSimple(page) {
  // Phase 1: create nodes and set controls / code
  const ids = await page.evaluate(() => {
    const create = app.addNodeToCanvas('List.Create', 80, 200);
    const py     = app.addNodeToCanvas('Custom.Python', 320, 200);
    const watch  = app.addNodeToCanvas('Output.Watch', 560, 200);
    if (!create || !py || !watch) return null;
    if (app.onCtrl) {
      app.onCtrl(create.id, 'item0', 1);
      app.onCtrl(create.id, 'item1', 2);
      app.onCtrl(py.id, 'code', 'result = [x**2 for x in elements]');
    }
    return { createId: create.id, pyId: py.id, watchId: watch.id };
  });

  if (!ids) return;

  // Wait for Custom.Python to materialise its inferred ports (elements, result)
  await page.waitForTimeout(500);

  // Phase 2: wire now that ports exist
  await page.evaluate(({ createId, pyId, watchId }) => {
    app.addWire(createId, 'list',   pyId,    'elements');
    app.addWire(pyId,     'result', watchId, 'value');
  }, ids);
}

// ── 16. python-advanced: Custom.Python(RevitBridge) → Watch (won't compute) ──

async function buildPythonAdvanced(page) {
  // This graph intentionally won't compute (no Revit host).
  // The screenshot shows the node layout with code visible — that is the
  // educational point. We skip wiring watch so the graph stays non-crashing.
  await page.evaluate(() => {
    const py = app.addNodeToCanvas('Custom.Python', 200, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 480, 200);
    if (!py || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(py.id, 'code',
        'walls = RevitBridge.getElements("Walls")\nresult = [RevitBridge.getParameter(w, "Width") for w in walls if w]'
      );
    }
    // Wire so the layout shows a connected graph; output will be undefined.
    app.addWire(py.id, 'result', watch.id, 'value');
  });
}

// ── 17. code-terminal-simple: Math.Add + Watch, then open terminal ────────────

async function buildCodeTerminalSimple(page) {
  await page.evaluate(() => {
    const add = app.addNodeToCanvas('Math.Add', 200, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 460, 200);
    if (!add || !watch) return;
    if (app.onCtrl) { app.onCtrl(add.id, 'a', 4); app.onCtrl(add.id, 'b', 6); }
    app.addWire(add.id, 'result', watch.id, 'value');
  });
  // Try to open the code terminal; graceful if unavailable.
  await page.evaluate(() => {
    try { if (app.openTerminal) app.openTerminal(); } catch (_) { /* non-fatal */ }
  });
  await page.waitForTimeout(600);
}

// ── 18. code-terminal-advanced: 5× Math.Add in a column ──────────────────────

async function buildCodeTerminalAdvanced(page) {
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      app.addNodeToCanvas('Math.Add', 200, i * 90);
    }
  });
}

// ── 19. codeblock-simple: Custom.CodeBlock(area+diagonal) → 2× Watch ─────────
// Two-phase: Phase 1 sets code so ports (area, diagonal, width, height) materialise.
// Phase 2 (after 500 ms) sets free-variable controls and wires outputs to watches.

async function buildCodeblockSimple(page) {
  // Phase 1: create nodes and set CodeBlock code
  const ids = await page.evaluate(() => {
    const cb = app.addNodeToCanvas('Custom.CodeBlock', 200, 200);
    const w1 = app.addNodeToCanvas('Output.Watch', 500, 120);
    const w2 = app.addNodeToCanvas('Output.Watch', 500, 280);
    if (!cb || !w1 || !w2) return null;
    if (app.onCtrl) {
      app.onCtrl(cb.id, 'code', 'area = width * height\ndiagonal = sqrt(width^2 + height^2)');
    }
    return { cbId: cb.id, w1Id: w1.id, w2Id: w2.id };
  });

  if (!ids) return;

  // Wait for CodeBlock to materialise inferred ports (width, height → area, diagonal)
  await page.waitForTimeout(500);

  // Phase 2: set free-variable controls (ports have now materialised) and wire
  await page.evaluate(({ cbId, w1Id, w2Id }) => {
    if (app.onCtrl) {
      app.onCtrl(cbId, 'width', 3);
      app.onCtrl(cbId, 'height', 4);
    }
    app.addWire(cbId, 'area',     w1Id, 'value');
    app.addWire(cbId, 'diagonal', w2Id, 'value');
  }, ids);
}

// ── 20. codeblock-advanced: CodeBlock(circle points) → Point.ByCoordinates ───
// Two-phase: Phase 1 sets code so ports (r, xs, ys, angles) materialise.
// Phase 2 (after 500 ms) sets the free-variable 'r' control and wires outputs.

async function buildCodeblockAdvanced(page) {
  // Phase 1: create nodes and set CodeBlock code
  const ids = await page.evaluate(() => {
    const cb = app.addNodeToCanvas('Custom.CodeBlock', 80, 200);
    const pt = app.addNodeToCanvas('Point.ByCoordinates', 380, 200);
    if (!cb || !pt) return null;
    if (app.onCtrl) {
      app.onCtrl(cb.id, 'code', 'angles = 0..360..#24\nxs = r * cos(rad(angles))\nys = r * sin(rad(angles))');
    }
    return { cbId: cb.id, ptId: pt.id };
  });

  if (!ids) return;

  // Wait for CodeBlock to materialise inferred ports (r → xs, ys, angles)
  await page.waitForTimeout(500);

  // Phase 2: set 'r' control (port now exists) and wire
  await page.evaluate(({ cbId, ptId }) => {
    if (app.onCtrl) app.onCtrl(cbId, 'r', 5);
    app.addWire(cbId, 'xs', ptId, 'x');
    app.addWire(cbId, 'ys', ptId, 'y');
  }, ids);

  await page.evaluate(() => { if (app.setView) app.setView('3d'); });
  await page.waitForTimeout(800);
}

// ── Slot list ──────────────────────────────────────────────────────────────────

const SHOTS = [
  { slotId: 'intro-simple',            buildFn: buildIntroSimple },
  { slotId: 'intro-advanced',          buildFn: buildIntroAdvanced },
  { slotId: 'interface-simple',        buildFn: buildInterfaceSimple },
  { slotId: 'interface-advanced',      buildFn: buildInterfaceAdvanced },
  { slotId: 'node-layout-simple',      buildFn: buildNodeLayoutSimple },
  { slotId: 'node-layout-advanced',    buildFn: buildNodeLayoutAdvanced },
  { slotId: 'data-types-simple',       buildFn: buildDataTypesSimple },
  { slotId: 'data-types-advanced',     buildFn: buildDataTypesAdvanced },
  { slotId: 'math-simple',             buildFn: buildMathSimple },
  { slotId: 'math-advanced',           buildFn: buildMathAdvanced },
  { slotId: 'geometry-simple',         buildFn: buildGeometrySimple },
  { slotId: 'geometry-advanced',       buildFn: buildGeometryAdvanced },
  { slotId: 'lists-simple',            buildFn: buildListsSimple },
  { slotId: 'lists-advanced',          buildFn: buildListsAdvanced },
  { slotId: 'python-simple',           buildFn: buildPythonSimple },
  { slotId: 'python-advanced',         buildFn: buildPythonAdvanced },
  { slotId: 'code-terminal-simple',    buildFn: buildCodeTerminalSimple },
  { slotId: 'code-terminal-advanced',  buildFn: buildCodeTerminalAdvanced },
  { slotId: 'codeblock-simple',        buildFn: buildCodeblockSimple },
  { slotId: 'codeblock-advanced',      buildFn: buildCodeblockAdvanced },
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  // Playwright is loaded dynamically so this script can also run in envs where
  // it may not be installed at the top level (it is a devDependency).
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (_) {
    try {
      ({ chromium } = require('@playwright/test'));
    } catch (e) {
      console.error('[shots] Cannot load playwright. Run: npm install (devDependencies).');
      console.error(e.message);
      process.exit(1);
    }
  }

  await startDevServer();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);

  // Load the app and wait for it to initialise.
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Navigate to the workspace (away from the landing page) once.
  await page.evaluate(() => {
    if (typeof app !== 'undefined') app.newProject();
  });
  await page.waitForTimeout(600);

  const results = [];
  let successCount = 0;
  let warnCount = 0;

  for (const { slotId, buildFn } of SHOTS) {
    const outPath = path.join(SHOTS_DIR, `${slotId}.png`);
    console.log(`[shots] Building ${slotId}…`);

    try {
      await buildGraph(page, buildFn);

      // Take screenshot of the canvas area element.
      const canvasEl = await page.$('#canvas-area');
      if (canvasEl) {
        await canvasEl.screenshot({ path: outPath, type: 'png' });
      } else {
        // Fallback: full page screenshot cropped.
        await page.screenshot({ path: outPath, type: 'png' });
      }

      // Assert file size.
      const stat = fs.statSync(outPath);
      const sizeKb = Math.round(stat.size / 1024);
      if (stat.size > MAX_BYTES) {
        console.warn(`[shots] WARNING: ${slotId}.png is ${sizeKb} KB (> 400 KB limit)`);
        warnCount++;
      } else {
        console.log(`[shots] OK: ${slotId}.png — ${sizeKb} KB`);
      }

      results.push({ slotId, ok: true, sizeKb, path: outPath });
      successCount++;
    } catch (err) {
      console.error(`[shots] FAILED: ${slotId} — ${err.message}`);
      results.push({ slotId, ok: false, error: err.message });
    }
  }

  await browser.close();
  stopDevServer();

  // Summary
  console.log('\n[shots] ── Summary ──────────────────────────────────');
  results.forEach((r) => {
    if (r.ok) {
      const warn = r.sizeKb > 400 ? ' ⚠ OVER LIMIT' : '';
      console.log(`  ✓ ${r.slotId}.png  ${r.sizeKb} KB${warn}`);
    } else {
      console.log(`  ✗ ${r.slotId}  FAILED: ${r.error}`);
    }
  });
  console.log(`[shots] ${successCount}/${SHOTS.length} screenshots taken, ${warnCount} over 400 KB.`);

  if (successCount < SHOTS.length) {
    console.error('[shots] Some screenshots failed. See errors above.');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[shots] Fatal error:', err);
  stopDevServer();
  process.exit(1);
});
