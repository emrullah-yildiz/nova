# T06a — Learning page: real Nova canvas screenshots

**Parent ticket:** [TICK-006](../tickets/TICK-006.md)
**Lane:** ui (human task — requires a real Nova browser session)
**Branch:** `feat/learning-screenshots`
**Status:** queued
**Dependency:** none

---

## Important — human-required task

This task cannot be fully automated. Taking valid screenshots requires:
- A running Nova dev session (`npm run dev`).
- Manual navigation of each chapter's example to build the graph.
- A screenshot tool that captures the canvas area only (no browser chrome).

An agent can automate the file-size check and the slot ID audit, but the actual screenshots must come from a real Nova session.

---

## Goal

Provide 20 real Nova canvas PNG screenshots — one per example slot across 10 chapters — and commit them to `public/learning/`. The learning page's `attachLearningShots()` function will then swap them in for the current placeholder SVGs automatically.

---

## Owned paths

```
public/learning/<slot-id>.png  (CREATE — 20 files)
```

**Do NOT touch:**
- `src/ui/learning-page.js` — do not modify the JS; screenshots only
- `src/ui/**`, `style.css`, `tests/**`
- Any file outside `public/learning/`

---

## Step 1 — Identify the 20 slot IDs

Before taking any screenshot, extract the exact slot ID strings from the learning page source so the filenames match exactly.

```bash
grep -n "slot-id\|data-slot\|attachLearningShots\|screenshot\|\.png" src/ui/learning-page.js
```

Also search for the `attachLearningShots` function definition:

```bash
grep -n "attachLearningShots\|learningShots\|public/learning" src/ui/learning-page.js src/ui/*.js
```

Record all 20 slot ID strings. The PNG filenames must be `<slot-id>.png` with no modification to casing or punctuation.

---

## Step 2 — Build each chapter's example graph

For each of the 10 chapters (× 2 examples = 20 total), reproduce the graph described in the chapter's example section of the learning page.

Requirements per screenshot:
- Dark theme (default Nova theme — do not switch to light).
- Nodes must be visible with labels readable.
- Wires must be visible connecting nodes.
- Output must be shown: either the `Output.Watch` panel displaying the computed value, or the 3D viewport showing geometry.
- No browser chrome (address bar, tab bar, DevTools). Canvas area only.
- Viewport size: 1280×800 (set the browser window to exactly this size before screenshotting).

Suggested tool: browser's built-in screenshot (F12 → Screenshot of selected area) or OS screenshot tool cropped to the canvas.

---

## Step 3 — Save files

Save each screenshot as `public/learning/<slot-id>.png`.

Compress to ≤ 400 KB each. Use one of:
- macOS: Preview → Export → JPEG (lower quality) or PNG with reduced colors.
- Windows: Paint → Save As → PNG; or use Squoosh (https://squoosh.app).
- CLI: `pngquant --quality=60-80 <file>.png` (lossless PNG optimizer).

Confirm file sizes:
```bash
ls -lh public/learning/*.png
```

All must be ≤ 400 KB (409,600 bytes).

---

## Step 4 — Verify in the browser

```bash
npm run dev
```

Open `http://localhost:5173`, navigate to the Learning page, and click through all 10 chapters. Confirm:
- Every example slot shows a real Nova screenshot (not the placeholder SVG).
- No broken-image icon appears in any slot.
- Each screenshot matches its chapter's example (correct node types visible).

Fallback regression check: temporarily rename one PNG file, reload — confirm the SVG fallback renders gracefully (no broken-image icon). Restore the file.

---

## Step 5 — Track files in git

```bash
git add public/learning/*.png
git ls-files public/learning/*.png
```

Confirm all 20 files appear in the output. Commit on branch `feat/learning-screenshots`.

---

## AC coverage (this task)

| AC | What this task does |
|---|---|
| AC-1 | All 20 PNG files exist at `public/learning/` with filenames matching exact slot IDs |
| AC-2 | Visual check: every chapter shows a real dark-theme Nova screenshot |
| AC-3 | Fallback regression check confirms no broken-image icon |
| AC-4 | Each screenshot shows correct node types for its chapter's example |
| AC-5 | All PNGs are ≤ 400 KB; `git ls-files public/learning/*.png` lists all 20 |

---

## Testing gate

- Manual browser: AC-2, AC-3, AC-4.
- File check (can be a shell one-liner or Playwright spec): AC-1, AC-5.
  Optional automated check:
  ```bash
  # confirm count is exactly 20 and all ≤ 400 KB
  node -e "
    const fs = require('fs');
    const files = fs.readdirSync('public/learning').filter(f => f.endsWith('.png'));
    console.log('Count:', files.length);
    files.forEach(f => {
      const size = fs.statSync('public/learning/' + f).size;
      if (size > 409600) console.error('OVERSIZED:', f, size);
    });
  "
  ```

---

## Merge checklist

- [ ] AC-1 verified: `git ls-files public/learning/*.png | wc -l` outputs 20
- [ ] AC-2 verified: manual browser 2026-06-05 — all 10 chapters show real screenshots
- [ ] AC-3 verified: fallback test passed — SVG renders gracefully when a PNG is absent
- [ ] AC-4 verified: each screenshot visually matches its chapter example (node types correct)
- [ ] AC-5 verified: all PNGs ≤ 400 KB (run file-size check above)
- [ ] `npm run lint:all` — 0 errors (screenshots do not affect lint, but confirm)
- [ ] `npm run test` — all pass
- [ ] Workboard row released on merge

---

## Notes

- The slot ID list must be confirmed from `src/ui/learning-page.js` before taking screenshots. Do not guess slot IDs.
- Screenshots are binary assets — they will be committed directly to the repository. Keep them small (≤ 400 KB) to avoid bloating the repo.
- If `attachLearningShots()` uses a different path convention (e.g., `./learning/<id>.png` vs `/learning/<id>.png`), match what the code expects — do not change the JS.
- This ticket has no dependency on TICK-007 (interactive exercises). Screenshots and exercises are independent features on separate branches.
