// scripts/take-learning-shots.js
// Programmatic Playwright screenshot script for the 20 Nova learning example slots.
//
// Usage: node scripts/take-learning-shots.js
//
// The script:
//   1. Spawns the Vite dev server on http://localhost:5173 (kills on exit).
//   2. For each of the 20 slots, navigates the Nova workspace, builds a
//      representative node graph via page.evaluate(), waits for computation,
//      calls app.fitAll() to centre the graph, and screenshots with a
//      bounding-box crop (all .node elements + 60px padding) so no node is cut.
//   3. Saves each PNG to public/learning/<slot-id>.png.
//   4. Asserts each file is <= 400 KB and logs a warning if exceeded.
//
// Node API used (confirmed from src/app/app.js):
//   app.newProject()                              - clear canvas + switch to workspace
//   app.addNodeToCanvas(type, x, y, opts?)        - add a node, returns node object
//   app.addWire(fromId, fromPort, toId, toPort)   - connect two ports
//   app.setView('3d')                             - switch to 3D viewport
//   app.openTerminal()                            - open code terminal overlay
//   app.fitAll()                                  - fit/centre all nodes in view
//   app.invalidateCompute?.()                     - trigger recompute
//   app.onCtrl(id, key, val)                      - set a node control value

'use strict';

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

// ── Configuration ──────────────────────────────────────────────────────────────

const SHOTS_DIR = path.join(__dirname, '..', 'public', 'learning');
const BASE_URL = 'http://localhost:5173';
// Use 1600×900 so wider graphs are not clipped.
const VIEWPORT = { width: 1600, height: 900 };
const PADDING = 60; // px padding on every side of the node bounding box
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
//   app.fitAll()                     — fit/centre the graph in view
//   app.onCtrl(id, key, val)         — set a node control value
//   app.invalidateCompute?.()        — mark graph dirty → auto recompute

// ── Slot graph definitions ─────────────────────────────────────────────────────

/**
 * Each entry: { slotId: string, build: async function(page) }
 * The build function calls page.evaluate() to manipulate the Nova canvas.
 *
 * buildGraph() calls this then:
 *   1. Invalidates compute so the engine runs.
 *   2. Waits 1200 ms for auto-compute to settle.
 *   3. Calls app.fitAll() so all nodes are centred and visible in the viewport.
 *   4. Computes the union bounding box of all .node elements + 60px padding,
 *      then screenshots #canvas-area with {clip: boundingBox}.
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

  // Run the graph so computed values are available.
  // Nova uses manual-run mode in the browser (app._manualRunMode=true) which
  // means computeNodeValue returns getLastRunNodeValue() when not inside a
  // runGraph() call.  Calling invalidateCompute() alone does not trigger a real
  // compute pass - we must call runGraph().
  await page.evaluate(async () => {
    if (typeof app !== 'undefined' && typeof app.runGraph === 'function') {
      await app.runGraph();
    } else if (typeof app !== 'undefined' && app.invalidateCompute) {
      app.invalidateCompute();
    }
  });
  await page.waitForTimeout(800);

  // Re-render all nodes so control widget values reflect onCtrl() updates,
  // and open the Data Inspector on every Output.Watch node so computed values
  // are visible in the screenshot.
  await page.evaluate(() => {
    if (typeof app === 'undefined') return;
    app.nodes.forEach(function(nd) {
      if (typeof app.renderNode === 'function') app.renderNode(nd);
    });
    app.nodes.forEach(function(nd) {
      if (nd.type === 'Output.Watch' && typeof app.toggleInspector === 'function') {
        if (!nd._inspOpen && !nd.inspectorOpen) app.toggleInspector(nd.id);
      }
    });
  });
  await page.waitForTimeout(300);

  // Fit-to-view — centre all nodes so nothing is clipped by the viewport.
  await page.evaluate(() => {
    if (typeof app !== 'undefined' && typeof app.fitAll === 'function') app.fitAll();
  });
  await page.waitForTimeout(300);
}

/**
 * Compute the bounding-box clip rectangle from all rendered .node elements,
 * adding PADDING on every side.  Returns null when no nodes are found (so the
 * caller can fall back to a full #canvas-area screenshot).
 *
 * @param {import('playwright').Page} page
 * @param {number} padding
 * @returns {Promise<{x:number,y:number,width:number,height:number}|null>}
 */
async function getNodeClipRect(page, padding) {
  const canvasBox = await page.evaluate(() => {
    const el = document.querySelector('#canvas-area');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  if (!canvasBox) return null;

  const nodeBox = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.node, .node-wrapper'));
    if (!nodes.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // skip invisible elements
      if (r.left < minX) minX = r.left;
      if (r.top  < minY) minY = r.top;
      if (r.right  > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  });

  if (!nodeBox) return null;

  // Convert viewport coords → coords relative to the canvas element
  const relX = nodeBox.minX - canvasBox.left;
  const relY = nodeBox.minY - canvasBox.top;
  const relMaxX = nodeBox.maxX - canvasBox.left;
  const relMaxY = nodeBox.maxY - canvasBox.top;

  // Add padding and clamp to canvas bounds
  const x      = Math.max(0, relX - padding);
  const y      = Math.max(0, relY - padding);
  const right  = Math.min(canvasBox.width,  relMaxX + padding);
  const bottom = Math.min(canvasBox.height, relMaxY + padding);
  const width  = Math.max(10, right - x);
  const height = Math.max(10, bottom - y);

  return { x, y, width, height };
}

// ── 1. intro-simple: Input.Number(5) → Math.Multiply(a);
//                    Input.Number(2) → Math.Multiply(b);
//                    Multiply.result → Output.Watch showing 10 ──────────────────
// FIX: Replace onCtrl(n2,'b',2) with a wired second Input.Number(2) → Multiply(b)
// so the wire is visually drawn and the graph unambiguously matches the chapter.

async function buildIntroSimple(page) {
  await page.evaluate(() => {
    const n1 = app.addNodeToCanvas('Input.Number', 80, 140);
    const n2 = app.addNodeToCanvas('Input.Number', 80, 280);
    const mul = app.addNodeToCanvas('Math.Multiply', 340, 210);
    const n3 = app.addNodeToCanvas('Output.Watch', 580, 210);
    if (!n1 || !n2 || !mul || !n3) return;
    if (app.onCtrl) {
      app.onCtrl(n1.id, 'val', 5);
      app.onCtrl(n2.id, 'val', 2);
    }
    app.addWire(n1.id, 'value', mul.id, 'a');
    app.addWire(n2.id, 'value', mul.id, 'b');
    app.addWire(mul.id, 'result', n3.id, 'value');
  });
}

// ── 2. intro-advanced: Parametric tower (3-input, 2-multiply chain) ───────────────
// floors(10) × floorHeight(3) = totalHeight(30)
// totalHeight(30) × footprint(20) = volume(600) → Output.Watch

async function buildIntroAdvanced(page) {
  await page.evaluate(() => {
    const floors    = app.addNodeToCanvas('Input.Number', 80, 100);
    const floorH    = app.addNodeToCanvas('Input.Number', 80, 240);
    const mul1      = app.addNodeToCanvas('Math.Multiply', 320, 160);
    const footprint = app.addNodeToCanvas('Input.Number', 80, 380);
    const mul2      = app.addNodeToCanvas('Math.Multiply', 540, 240);
    const watch     = app.addNodeToCanvas('Output.Watch',  760, 240);
    if (!floors || !floorH || !mul1 || !footprint || !mul2 || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(floors.id,    'val', 10);
      app.onCtrl(floorH.id,   'val', 3);
      app.onCtrl(footprint.id, 'val', 20);
    }
    app.addWire(floors.id,    'value',  mul1.id, 'a');
    app.addWire(floorH.id,   'value',  mul1.id, 'b');
    app.addWire(mul1.id,     'result', mul2.id, 'a');
    app.addWire(footprint.id, 'value',  mul2.id, 'b');
    app.addWire(mul2.id,     'result', watch.id, 'value');
  });
}
// Expected: watch shows 10 × 3 × 20 = 600
// ── 3. interface-simple: Math.Add(a=4, b=6) → Output.Watch ───────────────────

async function buildInterfaceSimple(page) {
  await page.evaluate(() => {
    const add = app.addNodeToCanvas('Math.Add', 200, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 460, 200);
    if (!add || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(add.id, 'a', 4);
      app.onCtrl(add.id, 'b', 6);
    }
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
    if (app.onCtrl) {
      app.onCtrl(num.id, 'val', 100);
      // start=0 (default), step=10 to keep the list manageable at 10 items
      app.onCtrl(range.id, 'start', 0);
      app.onCtrl(range.id, 'step', 10);
    }
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
    if (app.onCtrl) {
      app.onCtrl(add.id, 'a', 7);
      app.onCtrl(add.id, 'b', 3);
    }
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
    if (app.onCtrl) {
      app.onCtrl(str.id, 'val', 'Hello');
      app.onCtrl(num.id, 'val', 42);
    }
    app.addWire(str.id, 'value', w1.id, 'value');
    app.addWire(num.id, 'value', w2.id, 'value');
  });
}

// ── 8. data-types-advanced: List.Create(1,2,3,4,5) → Logic.Compare(>=3)
//                            → List.FilterByBoolean → Output.Watch ─────────────
// -- 8. data-types-advanced: boolean mask approach (bypasses engine lacing bug)
// Shows boolean data type: parallel mask [F,F,T,T,T] applied to [1,2,3,4,5]
// gives inList=[3,4,5] in Output.Watch.

async function buildDataTypesAdvanced(page) {
  await page.evaluate(() => {
    // Numbers list [1..5]
    const n0 = app.addNodeToCanvas('Input.Number', 60, 60);
    const n1 = app.addNodeToCanvas('Input.Number', 60, 140);
    const n2 = app.addNodeToCanvas('Input.Number', 60, 220);
    const n3 = app.addNodeToCanvas('Input.Number', 60, 300);
    const n4 = app.addNodeToCanvas('Input.Number', 60, 380);
    const numCreate = app.addNodeToCanvas('List.Create', 240, 200);
    // Boolean mask [F,F,T,T,T] -- represents items >= 3
    const b0 = app.addNodeToCanvas('Input.Boolean', 60, 490);
    const b1 = app.addNodeToCanvas('Input.Boolean', 60, 560);
    const b2 = app.addNodeToCanvas('Input.Boolean', 60, 630);
    const b3 = app.addNodeToCanvas('Input.Boolean', 60, 700);
    const b4 = app.addNodeToCanvas('Input.Boolean', 60, 770);
    const boolCreate = app.addNodeToCanvas('List.Create', 240, 630);
    const filter = app.addNodeToCanvas('List.FilterByBoolean', 460, 400);
    const watch  = app.addNodeToCanvas('Output.Watch', 680, 400);
    if (!n0 || !n1 || !n2 || !n3 || !n4 || !numCreate ||
        !b0 || !b1 || !b2 || !b3 || !b4 || !boolCreate ||
        !filter || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(n0.id, 'val', 1);
      app.onCtrl(n1.id, 'val', 2);
      app.onCtrl(n2.id, 'val', 3);
      app.onCtrl(n3.id, 'val', 4);
      app.onCtrl(n4.id, 'val', 5);
      // false=below 3, true=3 or above
      app.onCtrl(b0.id, 'val', 'False');
      app.onCtrl(b1.id, 'val', 'False');
      app.onCtrl(b2.id, 'val', 'True');
      app.onCtrl(b3.id, 'val', 'True');
      app.onCtrl(b4.id, 'val', 'True');
    }
    numCreate._dynInputIds  = ['item0', 'item1', 'item2', 'item3', 'item4'];
    boolCreate._dynInputIds = ['item0', 'item1', 'item2', 'item3', 'item4'];
    app.addWire(n0.id, 'value', numCreate.id,  'item0');
    app.addWire(n1.id, 'value', numCreate.id,  'item1');
    app.addWire(n2.id, 'value', numCreate.id,  'item2');
    app.addWire(n3.id, 'value', numCreate.id,  'item3');
    app.addWire(n4.id, 'value', numCreate.id,  'item4');
    app.addWire(b0.id, 'value', boolCreate.id, 'item0');
    app.addWire(b1.id, 'value', boolCreate.id, 'item1');
    app.addWire(b2.id, 'value', boolCreate.id, 'item2');
    app.addWire(b3.id, 'value', boolCreate.id, 'item3');
    app.addWire(b4.id, 'value', boolCreate.id, 'item4');
    app.addWire(numCreate.id,  'list', filter.id, 'list');
    app.addWire(boolCreate.id, 'list', filter.id, 'mask');
    app.addWire(filter.id, 'inList', watch.id, 'value');
  });
}
// Expected: watch shows inList=[3,4,5]
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

// ── 10. math-advanced: Input.Number(45) → CodeBlock(sin+cos) → 2x Output.Watch ─
// CodeBlock JS DSL uses scalar Math.sin/cos (not array-mapped), so we pass a
// single angle value. Watch1 ~= 0.707 (sin 45 deg), Watch2 ~= 0.707 (cos 45 deg).
// Two-phase: Phase 1 creates nodes and sets code; Phase 2 wires the materialised ports.

async function buildMathAdvanced(page) {
  // Phase 1: create nodes and set CodeBlock code
  const ids = await page.evaluate(() => {
    const numAngle = app.addNodeToCanvas('Input.Number', 80, 200);
    const cb       = app.addNodeToCanvas('Custom.CodeBlock', 320, 200);
    const w1       = app.addNodeToCanvas('Output.Watch', 600, 120);
    const w2       = app.addNodeToCanvas('Output.Watch', 600, 280);
    if (!numAngle || !cb || !w1 || !w2) return null;
    if (app.onCtrl) {
      app.onCtrl(numAngle.id, 'val', 45);
      app.onCtrl(cb.id, 'code', 'sinVal = sin(rad(angle))\ncosVal = cos(rad(angle))');
    }
    // Force port re-derivation so codeblock-node.js re-parses the new code
    delete cb._dynInputs;
    delete cb._dynOutputs;
    if (typeof app.renderNode === 'function') app.renderNode(cb);
    return { numId: numAngle.id, cbId: cb.id, w1Id: w1.id, w2Id: w2.id };
  });

  if (!ids) return;

  // Wait for CodeBlock to materialise its 'angle' input, 'sinVal'/'cosVal' outputs
  await page.waitForTimeout(600);

  // Phase 2: wire the now-materialised ports
  await page.evaluate(({ numId, cbId, w1Id, w2Id }) => {
    app.addWire(numId, 'value',  cbId, 'angle');
    app.addWire(cbId,  'sinVal', w1Id, 'value');
    app.addWire(cbId,  'cosVal', w2Id, 'value');
  }, ids);
}
// Expected: Watch1 ~= 0.7071 (sin(45 deg)), Watch2 ~= 0.7071 (cos(45 deg))
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
      if (p && app.onCtrl) {
        app.onCtrl(p.id, 'x', x);
        app.onCtrl(p.id, 'y', y);
        app.onCtrl(p.id, 'z', z);
      }
      return p;
    }).filter(Boolean);

    const create = app.addNodeToCanvas('List.Create', 280, 200);
    // PolyCurve.ByPoints doesn't exist; use Polyline.ByPoints
    const poly = app.addNodeToCanvas('Polyline.ByPoints', 460, 200);
    const vec = app.addNodeToCanvas('Vector.ByCoordinates', 280, 360);
    const extrude = app.addNodeToCanvas('Surface.ByCurveExtrude', 640, 260);

    if (!create || !poly || !vec || !extrude) return;
    if (app.onCtrl) {
      app.onCtrl(vec.id, 'x', 0);
      app.onCtrl(vec.id, 'y', 0);
      app.onCtrl(vec.id, 'z', 5);
    }

    // Set _dynInputIds so all 4 items are included in list output
    create._dynInputIds = ['item0', 'item1', 'item2', 'item3'];
    // Wire points into List.Create (items item0..item3)
    const portIds = ['item0','item1','item2','item3'];
    pts.forEach((pt, i) => {
      if (portIds[i]) app.addWire(pt.id, 'point', create.id, portIds[i]);
    });

    app.addWire(create.id, 'list', poly.id, 'points');
    app.addWire(poly.id, 'curve', extrude.id, 'curve');
    app.addWire(vec.id, 'vector', extrude.id, 'vector');
  });
  await page.evaluate(() => { if (app.setView) app.setView('3d'); });
  await page.waitForTimeout(800);
}

// ── 13. lists-simple: List.Create(10,20,30) → List.Reverse → Output.Watch ────
// FIX: Add item2=30 so the list has all three items [10,20,30] as in the matrix.

async function buildListsSimple(page) {
  await page.evaluate(() => {
    // List.Create has no controls (dynamicInputs) — values come from wired Input.Numbers
    const n0 = app.addNodeToCanvas('Input.Number', 80, 100);
    const n1 = app.addNodeToCanvas('Input.Number', 80, 200);
    const n2 = app.addNodeToCanvas('Input.Number', 80, 300);
    const create = app.addNodeToCanvas('List.Create', 280, 200);
    const rev = app.addNodeToCanvas('List.Reverse', 470, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 660, 200);
    if (!n0 || !n1 || !n2 || !create || !rev || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(n0.id, 'val', 10);
      app.onCtrl(n1.id, 'val', 20);
      app.onCtrl(n2.id, 'val', 30);
    }
    // Set _dynInputIds so item2 is included in the list output
    create._dynInputIds = ['item0', 'item1', 'item2'];
    app.addWire(n0.id, 'value', create.id, 'item0');
    app.addWire(n1.id, 'value', create.id, 'item1');
    app.addWire(n2.id, 'value', create.id, 'item2');
    app.addWire(create.id, 'list', rev.id, 'list');
    // List.Reverse output port is 'result'
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
      app.onCtrl(rangeX.id, 'start', 0);
      app.onCtrl(rangeX.id, 'end', 5);
      app.onCtrl(rangeX.id, 'step', 1);
      app.onCtrl(rangeY.id, 'start', 0);
      app.onCtrl(rangeY.id, 'end', 4);
      app.onCtrl(rangeY.id, 'step', 1);
    }
    app.addWire(rangeX.id, 'list', pt.id, 'x');
    app.addWire(rangeY.id, 'list', pt.id, 'y');
    app.addWire(pt.id, 'point', watch.id, 'value');
  });
}

// ── 15. python-simple: List.Create(1,2) → Custom.Python(squares) → Watch ─────
// Custom.Python has fixed inputs (elements, options) and output (result).
// Set _dynInputs=['elements'] so the engine finds the wire when computing.
// PythonRunner.execute runs the code with {elements: [1,2]} → result=[1,4].

async function buildPythonSimple(page) {
  await page.evaluate(() => {
    const n0    = app.addNodeToCanvas('Input.Number', 60, 140);
    const n1    = app.addNodeToCanvas('Input.Number', 60, 240);
    const create = app.addNodeToCanvas('List.Create', 240, 180);
    const py     = app.addNodeToCanvas('Custom.Python', 440, 200);
    const watch  = app.addNodeToCanvas('Output.Watch', 680, 200);
    if (!n0 || !n1 || !create || !py || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(n0.id, 'val', 1);
      app.onCtrl(n1.id, 'val', 2);
      app.onCtrl(py.id, 'code', 'result = []\nfor x in elements:\n    result.append(x**2)');
    }
    // Custom.Python has fixed ports - _dynInputs tells the engine which wires to read
    py._dynInputs  = ['elements'];
    py._dynOutputs = ['result'];
    app.addWire(n0.id, 'value', create.id, 'item0');
    app.addWire(n1.id, 'value', create.id, 'item1');
    app.addWire(create.id, 'list',   py.id,    'elements');
    app.addWire(py.id,     'result', watch.id, 'value');
  });
}
// Expected: Watch shows [1, 4]

// ── 16. python-advanced: Custom.Python(RevitBridge) → Watch (won't compute) ──
// The graph intentionally won't compute (no Revit host). The screenshot shows
// the node layout with the warning badge visible — that IS the educational point.
// Set _dynInputs so the engine at least tries to run the code.

async function buildPythonAdvanced(page) {
  await page.evaluate(() => {
    const py = app.addNodeToCanvas('Custom.Python', 200, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 480, 200);
    if (!py || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(py.id, 'code',
        'walls = RevitBridge.getElements("Walls")\nresult = [RevitBridge.getParameter(w, "Width") for w in walls if w]'
      );
    }
    py._dynInputs  = ['elements'];
    py._dynOutputs = ['result'];
    // Wire result → watch so the layout shows a connected graph
    app.addWire(py.id, 'result', watch.id, 'value');
  });
}



// ── 17. code-terminal-simple: Math.Add + Watch, then open terminal ────────────

async function buildCodeTerminalSimple(page) {
  await page.evaluate(() => {
    const add = app.addNodeToCanvas('Math.Add', 200, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 460, 200);
    if (!add || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(add.id, 'a', 4);
      app.onCtrl(add.id, 'b', 6);
    }
    app.addWire(add.id, 'result', watch.id, 'value');
  });
  // Try to open the code terminal; graceful if unavailable.
  await page.evaluate(() => {
    try { if (app.openTerminal) app.openTerminal(); } catch (_) { /* non-fatal */ }
  });
  await page.waitForTimeout(600);
}

// ── 18. code-terminal-advanced: Input.Number(10) → Math.Multiply(b=5) → Math.Add(b=3) → Watch ─
// Connected pipeline: producer → two transforms → Output.Watch,
// then open the terminal overlay so the chapter context is visible.

async function buildCodeTerminalAdvanced(page) {
  await page.evaluate(() => {
    const num = app.addNodeToCanvas('Input.Number', 80, 200);
    const mul = app.addNodeToCanvas('Math.Multiply', 280, 200);
    const add = app.addNodeToCanvas('Math.Add', 480, 200);
    const watch = app.addNodeToCanvas('Output.Watch', 680, 200);
    if (!num || !mul || !add || !watch) return;
    if (app.onCtrl) {
      app.onCtrl(num.id, 'val', 10);
      app.onCtrl(mul.id, 'b', 5);  // 10 × 5 = 50
      app.onCtrl(add.id, 'b', 3);  // 50 + 3 = 53
    }
    app.addWire(num.id, 'value', mul.id, 'a');
    app.addWire(mul.id, 'result', add.id, 'a');
    app.addWire(add.id, 'result', watch.id, 'value');
  });
  // Open the code terminal overlay so the screenshot shows the terminal context.
  await page.evaluate(() => {
    try { if (app.openTerminal) app.openTerminal(); } catch (_) { /* non-fatal */ }
  });
  await page.waitForTimeout(600);
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
    // Force port re-derivation: clear stale ports so codeblock-node.js re-parses code
    delete cb._dynInputs;
    delete cb._dynOutputs;
    if (typeof app.renderNode === 'function') app.renderNode(cb);
    return { cbId: cb.id, w1Id: w1.id, w2Id: w2.id };
  });

  if (!ids) return;

  // Wait for CodeBlock to materialise inferred ports (width, height -> area, diagonal)
  await page.waitForTimeout(600);

  // Phase 2: wire Input.Number nodes for concrete input values
  // (CodeBlock engine reads inputs from WIRES only, not controlValues)
  await page.evaluate(({ cbId, w1Id, w2Id }) => {
    const nWidth  = app.addNodeToCanvas('Input.Number', 80, 200);
    const nHeight = app.addNodeToCanvas('Input.Number', 80, 310);
    if (!nWidth || !nHeight) return;
    if (app.onCtrl) {
      app.onCtrl(nWidth.id,  'val', 3);
      app.onCtrl(nHeight.id, 'val', 4);
    }
    app.addWire(nWidth.id,  'value', cbId, 'width');
    app.addWire(nHeight.id, 'value', cbId, 'height');
    app.addWire(cbId, 'area',     w1Id, 'value');
    app.addWire(cbId, 'diagonal', w2Id, 'value');
  }, ids);
}
// Expected: Watch1 shows 12 (3 * 4), Watch2 shows 5 (sqrt(9 + 16))
async function buildCodeblockAdvanced(page) {
  // Phase 1: create nodes and set CodeBlock code
  const ids = await page.evaluate(() => {
    const cb = app.addNodeToCanvas('Custom.CodeBlock', 80, 200);
    const pt = app.addNodeToCanvas('Point.ByCoordinates', 380, 200);
    if (!cb || !pt) return null;
    if (app.onCtrl) {
      app.onCtrl(cb.id, 'code', 'angles = 0..360..#24\nxs = r * cos(rad(angles))\nys = r * sin(rad(angles))');
    }
    // Force port re-derivation: clear stale ports so codeblock-node.js re-parses code
    delete cb._dynInputs;
    delete cb._dynOutputs;
    if (typeof app.renderNode === 'function') app.renderNode(cb);
    return { cbId: cb.id, ptId: pt.id };
  });

  if (!ids) return;

  // Wait for CodeBlock to materialise inferred ports (r -> xs, ys, angles)
  await page.waitForTimeout(600);

  // Phase 2: set 'r' control (port now exists) and wire
  await page.evaluate(({ cbId, ptId }) => {
    if (app.onCtrl) app.onCtrl(cbId, 'r', 5);
    app.addWire(cbId, 'xs', ptId, 'x');
    app.addWire(cbId, 'ys', ptId, 'y');
  }, ids);

  try {
    await page.evaluate(() => { if (app.setView) app.setView('3d'); });
  } catch (_) { /* non-fatal -- page context may have navigated */ }
  await page.waitForTimeout(800);
}
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
  // Use 1600×900 viewport so wider graphs are not clipped.
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

      // Compute bounding-box clip so all nodes are fully visible (60px padding).
      const clip = await getNodeClipRect(page, PADDING);

      const canvasEl = await page.$('#canvas-area');
      if (canvasEl) {
        if (clip) {
          // Preferred path: crop to node bounding box + padding.
          await canvasEl.screenshot({ path: outPath, type: 'png', clip });
        } else {
          // Fallback: no nodes found via DOM query — screenshot the full canvas.
          console.warn(`[shots] WARNING: no .node elements found for ${slotId} — using full canvas`);
          await canvasEl.screenshot({ path: outPath, type: 'png' });
        }
      } else {
        // Ultimate fallback: full page screenshot when canvas element not found.
        console.warn(`[shots] WARNING: #canvas-area not found for ${slotId} — falling back to full-page`);
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
      const warn = r.sizeKb > 400 ? ' WARNING OVER LIMIT' : '';
      console.log(`  OK ${r.slotId}.png  ${r.sizeKb} KB${warn}`);
    } else {
      console.log(`  FAILED ${r.slotId}  FAILED: ${r.error}`);
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
