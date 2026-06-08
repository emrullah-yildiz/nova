# T06f — Content-aligned screenshots: read source, build exact graphs

**Parent ticket:** [TICK-006](../tickets/TICK-006.md)
**Lane:** ui (switch)
**Branch:** `fix/tick-006-content-aligned-screenshots`
**Status:** queued
**Covers ACs:** AC-4, AC-6, AC-7
**Supersedes:** T06e (which was written without reading the learning page source and produced an incorrect audit matrix for several slots)

---

## Goal

Read every learning page chapter slot's title and description text from
`src/ui/learning-page.js` (the `LEARNING_CHAPTERS` export), then extract the
exact graph each slot *describes*, and make `scripts/take-learning-shots.js`
produce exactly that graph for every one of the 20 slots.

The previous T06e agent wrote the audit matrix from scratch without reading the
source. This produced an incorrect `intro-advanced` builder: it shows only
`Input.Number(10=floors) × Input.Number(3=floorHeight) → Watch` (result 30),
but the `intro` chapter in `learning-page.js` describes a 3-input, 2-multiply
parametric tower:
- floors(10) × floorHeight(3) = totalHeight(30)
- totalHeight(30) × footprint(20) = volume(600)

That is the graph the `intro-advanced` screenshot must show.

---

## Owned paths

- `scripts/take-learning-shots.js`
- `public/learning/*.png` (all 20 PNG files regenerated and committed)

## Do NOT touch

- `src/ui/learning-page.js`
- `src/ui/learning-exercises.js`
- `src/ui/mini-canvas.js`
- `src/core/**`
- `tests/e2e/**`
- Any file not in "Owned paths"

---

## Step 0 — Read the source before writing any builder

Before changing a single builder, read `src/ui/learning-page.js` in full.
For every chapter object in `LEARNING_CHAPTERS`, note:
- `id` (maps to slot ids: `<id>-simple` and `<id>-advanced`)
- `title`
- Every `sections[].title` and `sections[].body` — this is what the slot must depict

Only after reading every chapter should you decide what graph each slot shows.
Do NOT copy the audit matrix from T06e. Derive it fresh from the source text.

---

## Corrected audit matrix

The table below was derived from reading `src/ui/learning-page.js`. Use it as
the authoritative reference, but **verify each row against the source text
before implementing**.

| slotId | Chapter title | What the slot must show |
|---|---|---|
| intro-simple | Introduction | Input.Number(5) → Math.Multiply port a; Input.Number(2) → Math.Multiply port b; Multiply.result → Output.Watch showing 10. Both input nodes visually wired (no onCtrl shortcut for the b input). |
| intro-advanced | Introduction | **Parametric tower (3-input, 2-multiply chain):** Input.Number(10,label=floors) → Multiply1 port a; Input.Number(3,label=floorHeight) → Multiply1 port b; Multiply1.result(=30) → Multiply2 port a; Input.Number(20,label=footprint) → Multiply2 port b; Multiply2.result → Output.Watch showing 600. |
| interface-simple | Interface | Shows the canvas / library panel context: Input.Slider(val=5, min=0, max=20) → Math.Multiply port a; Input.Number(3) → Multiply port b; Multiply.result → Output.Watch showing 15. (Demonstrates live control value updating.) |
| interface-advanced | Interface | Shows pan/zoom or inspector usage: 3-node graph illustrating the inspector — Input.Number(7) → Math.Add port a; Input.Number(3) → Math.Add port b; Math.Add.result → Output.Watch showing 10. |
| node-layout-simple | Node Anatomy | Demonstrates input/output ports clearly: Math.Add(a=7, b=3) → Output.Watch showing 10. (Clean minimal graph so ports are the focus.) |
| node-layout-advanced | Node Anatomy | Demonstrates controls overridden by wires: Input.Slider(val=5, min=0, max=10) → Math.Multiply port a; onCtrl Multiply b=3; Multiply.result → Output.Watch showing 15. |
| data-types-simple | Data Types | Two data types side by side: Input.Text("Hello") → Output.Watch; Input.Number(42) → Output.Watch. Two separate Watch nodes, one string one number. |
| data-types-advanced | Data Types | List filtering to show boolean type: List.Create(item0=1,item1=2,item2=3,item3=4,item4=5) → Logic.Compare(op=">=",b=3).result → List.FilterByBoolean.mask; List.Create.list → List.FilterByBoolean.list; List.FilterByBoolean.inList → Output.Watch showing [3,4,5]. |
| math-simple | Math Operations | Sum-of-squares: Input.Number(3) → Multiply1(a=self,b=self)=9; Input.Number(4) → Multiply2(a=self,b=self)=16; Multiply1.result + Multiply2.result → Math.Add → Output.Watch showing 25. |
| math-advanced | Math Operations | Trig over a range: List.Range(start=0,end=360,step=45) → Custom.CodeBlock(code="sineVals = sin(rad(angles))") → Output.Watch. (Two-phase: create+set code, wait 500ms, then wire.) |
| geometry-simple | Geometry Operations | Two points → a line in 3D viewport: Point.ByCoordinates(0,0,0) + Point.ByCoordinates(5,3,0) → Line.ByStartPointEndPoint; setView('3d'). |
| geometry-advanced | Geometry Operations | 4-point extruded surface: 4× Point.ByCoordinates → List.Create → Polyline.ByPoints → Surface.ByCurveExtrude + Vector.ByCoordinates(0,0,5); setView('3d'). |
| lists-simple | List Operations | List.Create(item0=10,item1=20,item2=30) → List.Reverse → Output.Watch showing [30,20,10]. |
| lists-advanced | List Operations | Cross-product point grid: List.Range(x: 0..5 step1) + List.Range(y: 0..4 step1) → Point.ByCoordinates (laced cross-product) → Output.Watch. |
| python-simple | Python Node | List.Create(item0=1,item1=2) → Custom.Python(code="result=[x**2 for x in elements]") → Output.Watch showing [1,4]. (Two-phase.) |
| python-advanced | Python Node | Custom.Python showing Revit bridge code (won't compute, that's intentional — shows code layout): code="walls=RevitBridge.getElements('Walls')\nresult=[RevitBridge.getParameter(w,'Width') for w in walls if w]" → Output.Watch. |
| code-terminal-simple | Code Terminal | Math.Add(a=4, b=6) → Output.Watch showing 10; then openTerminal() to show the terminal overlay. |
| code-terminal-advanced | Code Terminal | Input.Number(10) → Math.Multiply(b=5) → Math.Add(b=3) → Output.Watch showing 53; then openTerminal(). |
| codeblock-simple | Code Block | Custom.CodeBlock(code="area=width*height\ndiagonal=sqrt(width^2+height^2)"); set controls width=3, height=4 after 500ms wait; wire CodeBlock.area → Watch1 (showing 12); wire CodeBlock.diagonal → Watch2 (showing 5). |
| codeblock-advanced | Code Block | Custom.CodeBlock(code="angles=0..360..#24\nxs=r*cos(rad(angles))\nys=r*sin(rad(angles))"); set r=5 after 500ms; wire xs → Point.ByCoordinates.x; wire ys → Point.ByCoordinates.y; setView('3d') showing circle. |

---

## Key fix: intro-advanced builder (most critical)

The `buildIntroAdvanced` function in `scripts/take-learning-shots.js` currently
produces only a 2-node multiply. Replace it entirely:

```js
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
```

---

## Key fix: intro-simple builder

Replace `onCtrl(n2.id, 'b', 2)` with a real wired second Input.Number so the
`b` port is visually connected:

```js
async function buildIntroSimple(page) {
  await page.evaluate(() => {
    const n1  = app.addNodeToCanvas('Input.Number',  80, 140);
    const n2  = app.addNodeToCanvas('Input.Number',  80, 280);
    const mul = app.addNodeToCanvas('Math.Multiply', 340, 210);
    const n3  = app.addNodeToCanvas('Output.Watch',  580, 210);
    if (!n1 || !n2 || !mul || !n3) return;
    if (app.onCtrl) {
      app.onCtrl(n1.id, 'val', 5);
      app.onCtrl(n2.id, 'val', 2);
    }
    app.addWire(n1.id, 'value',  mul.id, 'a');
    app.addWire(n2.id, 'value',  mul.id, 'b');
    app.addWire(mul.id, 'result', n3.id, 'value');
  });
}
// Expected: watch shows 5 × 2 = 10
```

---

## Crop fix (already in T06e — keep it)

The bounding-box crop and 60px padding logic from T06e is correct. Keep it as-is.
The viewport must be 1600×900 before navigation. After `app.fitAll()`, compute
the union bounding rect of all `.node` elements, add 60px padding, and pass a
`{clip: {x,y,width,height}}` to the Playwright screenshot call.

Confirmed that `getNodeClipRect(page, PADDING)` in the current script already
does this. Verify it is called for every slot.

---

## Implementation steps

1. Read `src/ui/learning-page.js` fully — do not rely on the T06e matrix.
2. For each of the 20 slot builder functions, compare the current builder against
   the audit matrix above (after verifying against the source text).
3. Rewrite every builder that does not match its slot's description.
4. The `buildIntroAdvanced` fix above is the highest-priority change.
5. For `buildIntroSimple`: confirm both Input.Number nodes are wired (not using
   onCtrl shortcut for the b port). Use the code snippet above.
6. Run: `node scripts/take-learning-shots.js`
7. Visually inspect all 20 PNGs. For each one, confirm:
   - No node is cropped at any edge (60px+ margin on all sides)
   - The graph matches the audit matrix
   - Output.Watch (or 3D viewport for geometry slots) shows the correct result
8. Run: `npm run lint:all && npm run test && npm run build && npm run test:e2e`
   All must pass.
9. Commit the updated script and all 20 regenerated PNGs.

---

## Testing gate

- **AC-4:** Every Watch node shows a computed value matching the expected output
  in the audit matrix. Geometry slots show geometry in the 3D viewport.
- **AC-6:** All 20 PNGs show zero cropped nodes; 60px+ clear margin on all edges.
  Verify by opening each PNG and checking no node is cut off.
- **AC-7:** Every slot's graph matches what that chapter's text describes. The
  `intro-advanced` slot must show the full 3-input, 2-multiply parametric tower
  (Output.Watch showing 600). The `intro-simple` slot must show both Input.Number
  nodes wired into Math.Multiply (not using an onCtrl shortcut for b).

---

## Merge checklist

- [ ] AC-4 verified: all Watch nodes show correct computed values in screenshots
- [ ] AC-6 verified: all 20 PNGs show zero cropped nodes; 60px+ padding on every edge
- [ ] AC-7 verified: every builder matches the corrected audit matrix; intro-advanced shows the 3-input tower (result 600); intro-simple shows both b inputs wired
- [ ] `npm run lint:all` → 0 errors
- [ ] `npm run test` → all pass
- [ ] `npm run build` → green
- [ ] `npm run test:e2e` → all learning specs pass (no regressions)
- [ ] All 20 PNGs committed to `public/learning/`
- [ ] Workboard row released; INDEX.md updated; TICK-006.md AC-4, AC-6, AC-7 checked [x]
