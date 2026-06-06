# T06b — Programmatic Playwright screenshot script for 20 learning example slots

**Parent ticket:** [TICK-006](../tickets/TICK-006.md)
**Lane:** ui (agent: switch)
**Branch:** `feat/learning-screenshots`
**Status:** queued — replaces/supersedes T06a (which was a human-manual approach; this task automates it)
**Dependency:** none

---

## Goal

Write a Node.js/Playwright script that:

1. Starts (or attaches to) the Vite dev server at `http://localhost:5173`.
2. For each of the 20 learning example slots, navigates the Nova app, builds a simple representative node graph programmatically (using `app.addNodeToCanvas` and `app.connectNodes` via `page.evaluate`), waits for the graph to compute, then screenshots the canvas area.
3. Saves each screenshot to `public/learning/<slot-id>.png` at ≤ 400 KB.
4. After all 20 screenshots are saved, prints a summary and exits cleanly.

This is the same headless-browser approach used for generating sample workflow files in Nova. Do NOT take screenshots manually — the script must be fully automated and repeatable.

---

## Owned paths

```
scripts/take-learning-shots.js     (CREATE — the screenshot script)
public/learning/*.png              (CREATE — 20 PNG files output by the script)
```

**Do NOT touch:**
- `src/ui/learning-page.js` — read it to confirm slot IDs, but do not edit it
- `src/ui/**`, `style.css`, `tests/**`, `worker/**`, `api/**`
- Any file outside the two path groups above

---

## The 20 slot IDs (confirmed from src/ui/learning-page.js)

| # | slotId | Chapter | Level |
|---|---|---|---|
| 1 | `intro-simple` | Introduction | Simple |
| 2 | `intro-advanced` | Introduction | Advanced |
| 3 | `interface-simple` | Interface | Simple |
| 4 | `interface-advanced` | Interface | Advanced |
| 5 | `node-layout-simple` | Node Anatomy | Simple |
| 6 | `node-layout-advanced` | Node Anatomy | Advanced |
| 7 | `data-types-simple` | Data Types | Simple |
| 8 | `data-types-advanced` | Data Types | Advanced |
| 9 | `math-simple` | Math Operations | Simple |
| 10 | `math-advanced` | Math Operations | Advanced |
| 11 | `geometry-simple` | Geometry Operations | Simple |
| 12 | `geometry-advanced` | Geometry Operations | Advanced |
| 13 | `lists-simple` | List Operations | Simple |
| 14 | `lists-advanced` | List Operations | Advanced |
| 15 | `python-simple` | Python Node | Simple |
| 16 | `python-advanced` | Python Node | Advanced |
| 17 | `code-terminal-simple` | Code Terminal | Simple |
| 18 | `code-terminal-advanced` | Code Terminal | Advanced |
| 19 | `codeblock-simple` | Code Block | Simple |
| 20 | `codeblock-advanced` | Code Block | Advanced |

---

## Graph definitions per slot

For each slot, the script builds a minimal representative graph that visually communicates the chapter concept. The graphs are intentionally simple — the goal is a clear, readable canvas screenshot, not a complete workflow.

### Script structure

```js
// scripts/take-learning-shots.js
// Usage: node scripts/take-learning-shots.js
// Prerequisite: npm run dev must be running on http://localhost:5173

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SHOTS_DIR = path.join(__dirname, '..', 'public', 'learning');
const BASE_URL = 'http://localhost:5173';
const VIEWPORT = { width: 1280, height: 800 };

// Ensure output directory exists
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const SHOTS = [
  { slotId: 'intro-simple',         buildGraph: buildIntroSimple },
  { slotId: 'intro-advanced',       buildGraph: buildIntroAdvanced },
  { slotId: 'interface-simple',     buildGraph: buildInterfaceSimple },
  { slotId: 'interface-advanced',   buildGraph: buildInterfaceAdvanced },
  { slotId: 'node-layout-simple',   buildGraph: buildNodeLayoutSimple },
  { slotId: 'node-layout-advanced', buildGraph: buildNodeLayoutAdvanced },
  { slotId: 'data-types-simple',    buildGraph: buildDataTypesSimple },
  { slotId: 'data-types-advanced',  buildGraph: buildDataTypesAdvanced },
  { slotId: 'math-simple',          buildGraph: buildMathSimple },
  { slotId: 'math-advanced',        buildGraph: buildMathAdvanced },
  { slotId: 'geometry-simple',      buildGraph: buildGeometrySimple },
  { slotId: 'geometry-advanced',    buildGraph: buildGeometryAdvanced },
  { slotId: 'lists-simple',         buildGraph: buildListsSimple },
  { slotId: 'lists-advanced',       buildGraph: buildListsAdvanced },
  { slotId: 'python-simple',        buildGraph: buildPythonSimple },
  { slotId: 'python-advanced',      buildGraph: buildPythonAdvanced },
  { slotId: 'code-terminal-simple', buildGraph: buildCodeTerminalSimple },
  { slotId: 'code-terminal-advanced', buildGraph: buildCodeTerminalAdvanced },
  { slotId: 'codeblock-simple',     buildGraph: buildCodeblockSimple },
  { slotId: 'codeblock-advanced',   buildGraph: buildCodeblockAdvanced },
];
```

### Graph builder functions

Each `buildGraph(page)` function uses `page.evaluate()` to call Nova's JS API:

```js
// app.addNodeToCanvas(type, x, y, controlOverrides?)
// app.connectNodes(fromId, fromPort, toId, toPort)
// app.nodes  — array of current nodes, each with .id, .type
```

The script calls `app.clearCanvas()` (or equivalent) between slots to start fresh.

Below is the graph definition for each slot — implement these exactly:

#### intro-simple: Input.Number(5) → Math.Multiply(b=2) → Output.Watch
```
Input.Number at (80, 200), value=5
Math.Multiply at (320, 200), b=2
Output.Watch at (560, 200)
Wires: number.value → multiply.a; multiply.result → watch.value
```

#### intro-advanced: Input.Number(floors=10) + Input.Number(floorHeight=3) → Math.Multiply → Output.Watch
```
Input.Number at (80, 120), label="floors", value=10
Input.Number at (80, 260), label="floorHeight", value=3
Math.Multiply at (320, 180)
Output.Watch at (560, 180)
Wires: floors.value → multiply.a; floorHeight.value → multiply.b; multiply.result → watch.value
```

#### interface-simple: Math.Add(a=4, b=6) → Output.Watch
```
Math.Add at (200, 200), a=4, b=6
Output.Watch at (460, 200)
Wires: add.result → watch.value
```

#### interface-advanced: Input.Number(n=100) → List.Range → Output.Watch
```
Input.Number at (80, 200), value=100
List.Range at (320, 200), start=0
Output.Watch at (560, 200)
Wires: number.value → range.end; range.list → watch.value
```

#### node-layout-simple: Math.Add(a=7, b=3) → Output.Watch
```
Math.Add at (200, 200), a=7, b=3
Output.Watch at (460, 200)
Wires: add.result → watch.value
```

#### node-layout-advanced: Input.Slider(0-10, value=5) → Math.Multiply(b=3) → Output.Watch
```
Input.Slider at (80, 200), min=0, max=10, value=5
Math.Multiply at (320, 200), b=3
Output.Watch at (560, 200)
Wires: slider.value → multiply.a; multiply.result → watch.value
```

#### data-types-simple: Input.String("Hello") → Output.Watch; Input.Number(42) → Output.Watch
```
Input.String at (80, 120), value="Hello"
Input.Number at (80, 280), value=42
Output.Watch at (360, 120)
Output.Watch at (360, 280)
Wires: string.value → watch1.value; number.value → watch2.value
```

#### data-types-advanced: List.Create(1..5) → Math.GreaterThan(b=2) → List.Filter → Output.Watch
```
List.Create at (80, 200), items=[1,2,3,4,5]
Math.GreaterThan at (300, 200), b=2
List.Filter at (520, 200)
Output.Watch at (740, 200)
Wires: create.list → greaterThan.a; greaterThan.result → filter.mask; create.list → filter.list; filter.result → watch.value
```

#### math-simple: Input.Number(3) + Input.Number(4) → Math.Multiply×2 → Math.Add → Math.Sqrt → Output.Watch
```
Input.Number at (80, 120), value=3  (a)
Input.Number at (80, 280), value=4  (b)
Math.Multiply at (280, 120)   (a squared — connect a→a and a→b)
Math.Multiply at (280, 280)   (b squared — connect b→a and b→b)
Math.Add at (460, 200)
Math.Sqrt at (620, 200)
Output.Watch at (780, 200)
Wires: a→mul1.a, a→mul1.b; b→mul2.a, b→mul2.b; mul1.result→add.a; mul2.result→add.b; add.result→sqrt.value; sqrt.result→watch.value
```

#### math-advanced: Input.Number(24) → List.Range(0-360) → Math.Radians → Math.Sin → Output.Watch
```
Input.Number at (80, 200), value=24
List.Range at (280, 200), start=0, end=360
Math.Radians at (460, 200)
Math.Sin at (620, 200)
Output.Watch at (800, 200)
Wires: number.value → range.count; range.list → radians.value; radians.result → sin.value; sin.result → watch.value
```

#### geometry-simple: Point.ByCoordinates(0,0,0) + Point.ByCoordinates(5,3,0) → Line.ByStartPointEndPoint → (3D viewport)
```
Point.ByCoordinates at (80, 120), x=0, y=0, z=0
Point.ByCoordinates at (80, 280), x=5, y=3, z=0
Line.ByStartPointEndPoint at (320, 200)
Wires: pt1→startPoint; pt2→endPoint
Switch to 3D viewport before screenshot
```

#### geometry-advanced: 4x Point.ByCoordinates → List.Create → PolyCurve.ByPoints → Vector.ByCoordinates(0,0,5) → Solid.Extrude → (3D viewport)
```
Point.ByCoordinates at (80,80) x=0,y=0,z=0
Point.ByCoordinates at (80,180) x=4,y=0,z=0
Point.ByCoordinates at (80,280) x=4,y=3,z=0
Point.ByCoordinates at (80,380) x=0,y=3,z=0
List.Create at (280,200), 4 items wired from the points
PolyCurve.ByPoints at (460,200), closed=true
Vector.ByCoordinates at (280,360), x=0,y=0,z=5
Solid.Extrude at (640,260)
Wires: list→polycurve.points; vector→extrude.direction; polycurve→extrude.profile
Switch to 3D viewport before screenshot
```

#### lists-simple: List.Create(10,20,30) → List.Reverse → Output.Watch
```
List.Create at (80, 200), items=[10,20,30]
List.Reverse at (320, 200)
Output.Watch at (520, 200)
Wires: create.list → reverse.list; reverse.result → watch.value
```

#### lists-advanced: List.Range(X 0-4) + List.Range(Y 0-3) → Point.ByCoordinates (cross-product) → Output.Watch
```
List.Range at (80, 120), start=0, end=4, step=1  (X)
List.Range at (80, 280), start=0, end=3, step=1  (Y)
Point.ByCoordinates at (320, 200), lacing=crossProduct
Output.Watch at (540, 200)
Wires: rangeX→point.x; rangeY→point.y; point.result→watch.value
```

#### python-simple: List.Create(1..5) → Custom.Python(result=[x**2 for x in elements]) → Output.Watch
```
List.Create at (80, 200), items=[1,2,3,4,5]
Custom.Python at (320, 200), code="result = [x**2 for x in elements]"
Output.Watch at (560, 200)
Wires: create.list → python.elements; python.result → watch.value
```

#### python-advanced: Custom.Python(RevitBridge example) → Output.Watch
```
Custom.Python at (200, 200), code="walls = RevitBridge.getElements('Walls')\nresult = [RevitBridge.getParameter(w, 'Width') for w in walls if w]"
Output.Watch at (480, 200)
Wires: python.result → watch.value
Note: This graph won't compute (no Revit host) — screenshot shows the node layout with the code visible, which is the educational point.
```

#### code-terminal-simple: Show canvas with Code Terminal open + Math.Add node present
```
Math.Add at (200, 200), a=4, b=6
Output.Watch at (460, 200)
Wire: add.result → watch.value
Open Code Terminal via app API (page.evaluate(() => app.openCodeTerminal?.()))
Screenshot captures canvas with terminal overlay visible
```

#### code-terminal-advanced: 5x Math.Add nodes in a column (programmatic add)
```
page.evaluate(() => { for(let i=0;i<5;i++) app.addNodeToCanvas('Math.Add',200,i*90); })
Screenshot shows 5 Math.Add nodes in a vertical column — illustrating programmatic graph building
No wires needed — the visual point is the column of nodes
```

#### codeblock-simple: Custom.CodeBlock(area+diagonal) → 2x Output.Watch
```
Custom.CodeBlock at (200, 200), code="area = width * height\ndiagonal = sqrt(width^2 + height^2)"
Set width=3, height=4 via controls
Output.Watch at (500, 120)
Output.Watch at (500, 280)
Wires: codeblock.area → watch1.value; codeblock.diagonal → watch2.value
```

#### codeblock-advanced: Custom.CodeBlock(series → circle points) → Point.ByCoordinates → (3D viewport)
```
Custom.CodeBlock at (80, 200), code="angles = 0..360..#24\nxs = r * cos(rad(angles))\nys = r * sin(rad(angles))"
Set r=5
Point.ByCoordinates at (380, 200)
Wires: codeblock.xs → point.x; codeblock.ys → point.y
Switch to 3D viewport before screenshot — shows 24 circle points
```

---

## Screenshot requirements

- Viewport: 1280×800 (`page.setViewportSize({ width: 1280, height: 800 })`).
- Dark theme: Nova default — do not switch theme.
- Canvas area only: screenshot the `#canvas-area` element (or `#app`, whichever contains the node canvas without browser chrome).
- Use `element.screenshot({ path: ... })` rather than `page.screenshot()` to exclude browser chrome.
- Wait for graph computation before screenshotting: after building the graph, call `page.evaluate(() => app.runGraph?.())` and then `page.waitForTimeout(1200)` to allow the watch panels to populate.
- For geometry slots (geometry-simple, geometry-advanced, codeblock-advanced, lists-advanced with 3D viewport): switch to 3D view via `page.evaluate(() => app.setView('3d'))` and wait `page.waitForTimeout(800)` for the renderer to settle before screenshotting.
- Compress: use Playwright's built-in PNG output with `{ quality: undefined }` (lossless). If any file exceeds 400 KB, add a `pngquant` or `sharp` post-processing step to compress it. Alternatively, use JPEG at quality=85 for slots that don't require transparency. The script must assert `fs.statSync(outPath).size <= 409600` for each file and log a warning if exceeded.

---

## Script invocation

Add to `package.json` scripts section:

```json
"screenshots:learning": "node scripts/take-learning-shots.js"
```

The script assumes `npm run dev` is already running. It does not start the dev server — it connects to the existing one. If the server is not running, the script exits with a clear error message.

Alternatively, the script can spawn the dev server itself:

```js
const { spawn } = require('child_process');
const server = spawn('npm', ['run', 'dev'], { stdio: 'pipe', shell: true });
// wait for "Local:" log line, then proceed
```

Choose whichever approach is simpler. If spawning, ensure the server is killed on script exit (use `process.on('exit', () => server.kill())`).

---

## AC coverage

| AC | What this task provides |
|---|---|
| AC-1 | Script produces all 20 PNG files at `public/learning/<slot-id>.png` |
| AC-2 | Each PNG shows a real Nova canvas screenshot (dark theme, nodes, wires) |
| AC-3 | No broken images — script confirms files exist and are valid PNG before exiting |
| AC-4 | Each screenshot matches the learning chapter's example graph (script builds it explicitly) |
| AC-5 | Script asserts each PNG is ≤ 400 KB and logs/fails if any exceed the limit |

---

## Testing gate

- Run `node scripts/take-learning-shots.js` — script must exit 0 with 20 files created.
- Run `npm run lint:all` — 0 errors (the script itself must lint clean).
- Run `git ls-files public/learning/*.png | wc -l` — must output 20.
- Run `npm run test` and `npm run test:e2e` — existing tests must not be broken.
- Manual browser check: open learning page, navigate all 10 chapters — all 20 slots must show the PNG screenshots (not the SVG placeholder).

---

## Merge checklist

- [ ] `scripts/take-learning-shots.js` created and exits 0
- [ ] 20 PNG files exist at `public/learning/` with exact slot-ID filenames (see table above)
- [ ] All 20 PNGs are ≤ 400 KB (script verified)
- [ ] `git ls-files public/learning/*.png | wc -l` outputs 20
- [ ] Manual browser: all 10 chapters × 2 examples show real Nova screenshots
- [ ] `npm run lint:all` — 0 errors
- [ ] `npm run test` — all unit tests pass
- [ ] `npm run test:e2e` — all E2E tests pass (screenshots are binary assets, should not affect specs)
- [ ] TICK-006 AC-1 through AC-5 checkboxes updated
- [ ] Workboard row status updated (T06a row released; T06b row released on merge)

---

## Notes

- T06a (the human-manual approach) is superseded by this task. Its workboard row should be marked released when T06b merges.
- The `public/learning/` directory may not exist yet — the script must create it with `fs.mkdirSync(SHOTS_DIR, { recursive: true })`.
- Screenshots are committed as binary assets to the repository. Keep them small. If PNG compression is insufficient, use JPEG (`{ type: 'jpeg', quality: 85 }` in Playwright's screenshot options) — rename the extension to `.jpg` but also update `src/ui/learning-page.js` `data-shot-src` attribute path to match. Simpler to keep PNG and use `pngquant` if needed.
- The Python-advanced slot (RevitBridge example) will not compute (no Revit host). The screenshot should show the node with code text visible in the node body — that is the educational value. Do not error on non-computing nodes.
- The Code Terminal slots: open the terminal via `app.openCodeTerminal?.()` if the API exists, otherwise screenshot the canvas-only view with the terminal button visible. Do not fail if the terminal API is absent.
- Do NOT hardcode internal node IDs — always look up newly-created nodes via `app.nodes[app.nodes.length - 1].id` or similar after each `addNodeToCanvas` call.
