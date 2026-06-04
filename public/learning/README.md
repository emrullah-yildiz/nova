# Nova Learning — optional screenshot slots

The **Nova Learning** page (Help → "Nova Learning", or the "Take a quick tour"
link on the landing page) ships with hand-authored **inline SVG illustrations**
for every step. Those SVGs are the default and are always present — the page
looks finished with **no external image** and there is **no broken-image icon**
if a screenshot is missing.

Each step also has an **optional screenshot slot**. If you drop a real PNG here,
it will be shown *on top of* the SVG poster for that step. If the file is absent
the page silently keeps the SVG.

## How it works

`src/ui/learning-page.js` renders, per step, a `<figure>` containing:

1. the inline SVG illustration (always visible), and
2. a hidden `<img class="learn-shot" data-shot-src="learning/<id>.png">`.

On open, `attachLearningShots()` sets each image's `src`:

- **loads successfully** → the `<img>` is un-hidden and covers the SVG poster;
- **fails to load** (file absent) → the `<img>` removes itself, leaving the SVG.

So you never get a broken image, and screenshots are purely additive.

## Where to drop screenshots

Put PNGs in **this folder** (`public/learning/`). They are served at
`learning/<id>.png` (Vite copies `public/` to the site root). Recommended size:
~1040×640, dark-theme captures.

| Step | File to add        |
|------|--------------------|
| What is Nova                | `learning/what.png`     |
| The canvas & node library   | `learning/canvas.png`   |
| Wiring nodes                | `learning/wiring.png`   |
| Live geometry & 3D viewer   | `learning/viewer.png`   |
| The AI assistant            | `learning/ai.png`       |
| Save & projects             | `learning/projects.png` |
| Connect to Revit & Forma    | `learning/connect.png`  |

The step ids match `LEARNING_STEPS[].id` in `src/ui/learning-page.js`.

> Do **not** commit large binary screenshots without need — they are optional
> polish, not a build dependency.
