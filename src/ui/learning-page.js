// Nova Learning page — a designed, scrollable "how to use Nova" guide.
//
// This module is the pure content + HTML builder for the Learning overlay; the
// app wires it in with a thin showLearning()/closeLearning() pair (mirroring the
// legal viewer). Keeping the markup here means it's unit-testable in jsdom and
// app.js stays small.
//
// Visuals are SELF-CONTAINED inline SVG — there is NO external image dependency
// and NO chance of a broken-image icon. Each step also exposes an OPTIONAL
// screenshot slot: a <figure> whose inline SVG is the default illustration, with
// a hidden <img> that only becomes visible if a real screenshot loads from
// `learning/<id>.png` (served from public/learning/). If the file is absent the
// <img> errors and removes itself, leaving the SVG in place — see attachLearningShots().

// All section copy lives here so the content is reviewable in one place and the
// tests can assert on known headings. `svg` is a self-contained illustration.
export const LEARNING_STEPS = [
  {
    id: 'what',
    n: 1,
    title: 'What is Nova',
    lead: 'Visual parametric design, right in your browser.',
    body: 'Nova is a node-based workspace for parametric design. You build a graph of small nodes instead of writing code — and the geometry it describes is computed live by Nova\'s own kernel. No installs, no desktop lock-in.',
    svg: svgNova()
  },
  {
    id: 'canvas',
    n: 2,
    title: 'The canvas & node library',
    lead: 'Drag nodes from the library onto the canvas.',
    body: 'The library on the left groups every node by category. Search for what you need, then drag it onto the canvas. Each node is a tiny function with typed input and output ports.',
    svg: svgLibrary()
  },
  {
    id: 'wiring',
    n: 3,
    title: 'Wiring nodes together',
    lead: 'Connect an output port to an input port.',
    body: 'Drag from a node\'s output port to another node\'s input port to draw a wire. Data flows along the wire and the graph recomputes live — change a value upstream and everything downstream updates instantly.',
    svg: svgWiring()
  },
  {
    id: 'viewer',
    n: 4,
    title: 'Live geometry & the 3D viewer',
    lead: 'Results render in the viewport as you edit.',
    body: 'Geometry nodes feed the 3D viewport. Orbit, pan and zoom to inspect your model. Because the graph recomputes live, every edit you make is reflected in the viewport immediately.',
    svg: svgViewer()
  },
  {
    id: 'ai',
    n: 5,
    title: 'The AI assistant',
    lead: 'Describe what you want — Nova helps build it.',
    body: 'Tell the assistant what you\'re trying to make and it can read your graph, explain it, and generate geometry. Nova is bring-your-own-key: open Settings and add your provider key to enable it.',
    svg: svgAI()
  },
  {
    id: 'projects',
    n: 6,
    title: 'Save & projects',
    lead: 'Sign in to save and sync your work.',
    body: 'Sign in to save projects to the cloud and pick up where you left off on any device. Your recent projects are one click away from the landing page.',
    svg: svgProjects()
  },
  {
    id: 'connect',
    n: 7,
    title: 'Connect to Revit & Forma',
    lead: 'Bridge the browser to your design tools.',
    body: 'The Connect ribbon pairs Nova with desktop and cloud tools like Revit and Autodesk Forma, so you can pull real project geometry in and push parametric results back out.',
    svg: svgConnect()
  }
];

function fig(step) {
  // Inline SVG is the always-present default; the <img> is hidden until/unless a
  // real screenshot loads (attachLearningShots wires the onload/onerror).
  return (
    '<figure class="learn-figure" data-learn-shot="' + step.id + '">' +
      '<div class="learn-illus" aria-hidden="true">' + step.svg + '</div>' +
      '<img class="learn-shot" alt="" data-shot-src="learning/' + step.id + '.png" hidden>' +
    '</figure>'
  );
}

function stepSection(step) {
  const flip = step.n % 2 === 0 ? ' learn-step--flip' : '';
  return (
    '<section class="learn-step' + flip + '" id="learn-step-' + step.id + '">' +
      '<div class="learn-step-text">' +
        '<span class="learn-step-num">Step ' + step.n + '</span>' +
        '<h2 class="learn-step-title">' + step.title + '</h2>' +
        '<p class="learn-step-lead">' + step.lead + '</p>' +
        '<p class="learn-step-body">' + step.body + '</p>' +
      '</div>' +
      fig(step) +
    '</section>'
  );
}

/**
 * Build the full Learning page markup (hero + steps + footer).
 * Pure string builder — no DOM access — so it's testable and the app just
 * assigns it to the overlay's innerHTML.
 * @returns {string} HTML for the inner panel
 */
export function buildLearningHtml() {
  const hero =
    '<header class="learn-hero">' +
      '<div class="learn-hero-art" aria-hidden="true">' + svgHero() + '</div>' +
      '<div class="learn-hero-copy">' +
        '<span class="learn-kicker">Nova Learning</span>' +
        '<h1 class="learn-hero-title">Build parametric design, visually.</h1>' +
        '<p class="learn-hero-sub">A quick tour of the Nova workflow — from your first node to live 3D geometry, AI assistance, and a bridge to Revit &amp; Forma.</p>' +
        '<a class="learn-hero-cta" href="#learn-step-what">Start the tour</a>' +
      '</div>' +
    '</header>';

  const steps = LEARNING_STEPS.map(stepSection).join('');

  const footer =
    '<footer class="learn-footer">' +
      '<div class="learn-footer-art" aria-hidden="true">' + svgSpark() + '</div>' +
      '<h2 class="learn-footer-title">Ready to design?</h2>' +
      '<p class="learn-footer-sub">Start with a blank canvas and wire your first node.</p>' +
      '<div class="learn-footer-actions">' +
        '<button class="learn-btn learn-btn--primary" onclick="app.closeLearning();app.newProject()">Start a new project</button>' +
        '<button class="learn-btn learn-btn--ghost" onclick="app.closeLearning()">Close</button>' +
      '</div>' +
      '<p class="learn-footer-fine">Curious how we handle your data? Read the ' +
        '<a href="#" class="learn-privacy-link" onclick="app.showLegal(\'privacy\');return false;">Data Privacy</a> notice.</p>' +
    '</footer>';

  return (
    '<div class="learn-panel" role="dialog" aria-modal="true" aria-label="Nova Learning">' +
      '<button class="learn-close" aria-label="Close" onclick="app.closeLearning()">&times;</button>' +
      '<div class="learn-scroll" id="learn-scroll">' +
        hero + steps + footer +
      '</div>' +
    '</div>'
  );
}

/**
 * Wire the optional screenshot slots: for each <figure>, try to load the real
 * screenshot. On success, reveal the <img> (the SVG stays underneath as a
 * fallback poster); on failure, remove the <img> so no broken-image icon shows.
 * Safe to call when the overlay isn't present (it no-ops).
 * @param {Document} doc
 */
export function attachLearningShots(doc) {
  const root = (doc || document).getElementById && (doc || document).getElementById('learning-overlay');
  if (!root) return;
  const shots = root.querySelectorAll('img.learn-shot[data-shot-src]');
  shots.forEach((img) => {
    const src = img.getAttribute('data-shot-src');
    if (!src) return;
    img.onload = () => {
      // Only show once we know the bytes are real (avoid 0-size placeholders).
      if (img.naturalWidth > 1) img.hidden = false;
    };
    img.onerror = () => { if (img.parentNode) img.parentNode.removeChild(img); };
    img.src = src;
  });
}

// ── Inline SVG illustrations ──────────────────────────────────────────────
// All flat/line art drawn with the app's CSS color tokens via currentColor and
// explicit token vars, so they read correctly on the dark theme. No external refs.

function nodeBox(x, y, label, accent) {
  return (
    '<g>' +
      '<rect x="' + x + '" y="' + y + '" width="78" height="46" rx="8" fill="var(--bg-surface,#252538)" stroke="' + accent + '" stroke-width="1.5"/>' +
      '<rect x="' + x + '" y="' + y + '" width="78" height="14" rx="8" fill="' + accent + '" opacity="0.18"/>' +
      '<text x="' + (x + 39) + '" y="' + (y + 32) + '" text-anchor="middle" font-size="11" fill="var(--text-primary,#cdd6f4)">' + label + '</text>' +
    '</g>'
  );
}

function port(cx, cy, accent) {
  return '<circle cx="' + cx + '" cy="' + cy + '" r="4.5" fill="var(--bg-primary,#1e1e2e)" stroke="' + accent + '" stroke-width="2"/>';
}

function svgFrame(inner) {
  return (
    '<svg viewBox="0 0 340 200" width="100%" role="img" preserveAspectRatio="xMidYMid meet">' +
      '<rect x="1" y="1" width="338" height="198" rx="14" fill="var(--bg-tertiary,#11111b)" stroke="var(--border-color,#313244)"/>' +
      inner +
    '</svg>'
  );
}

function svgNova() {
  return svgFrame(
    nodeBox(40, 50, 'Number', 'var(--accent-blue,#89b4fa)') +
    nodeBox(150, 110, 'Box', 'var(--accent-purple,#cba6f7)') +
    nodeBox(248, 40, 'Sphere', 'var(--accent-green,#a6e3a1)') +
    '<path d="M118 73 C 140 73 138 133 150 133" fill="none" stroke="var(--accent-blue,#89b4fa)" stroke-width="2"/>' +
    '<path d="M228 133 C 250 133 250 63 248 63" fill="none" stroke="var(--accent-purple,#cba6f7)" stroke-width="2"/>' +
    port(118, 73, 'var(--accent-blue,#89b4fa)') + port(150, 133, 'var(--accent-purple,#cba6f7)') +
    port(228, 133, 'var(--accent-purple,#cba6f7)') + port(248, 63, 'var(--accent-green,#a6e3a1)')
  );
}

function svgLibrary() {
  let rows = '';
  const labels = ['Math', 'Curve', 'Surface', 'List'];
  labels.forEach((l, i) => {
    const y = 36 + i * 34;
    rows +=
      '<rect x="20" y="' + y + '" width="120" height="24" rx="6" fill="var(--bg-surface,#252538)" stroke="var(--border-color,#313244)"/>' +
      '<circle cx="34" cy="' + (y + 12) + '" r="4" fill="var(--accent-teal,#94e2d5)"/>' +
      '<text x="48" y="' + (y + 16) + '" font-size="11" fill="var(--text-secondary,#a6adc8)">' + l + '</text>';
  });
  return svgFrame(
    rows +
    // dragged node mid-flight toward the canvas
    '<path d="M148 80 L 210 96" stroke="var(--text-muted,#6c7086)" stroke-width="1.5" stroke-dasharray="4 4" fill="none"/>' +
    nodeBox(210, 78, 'Point', 'var(--accent-yellow,#f9e2af)') +
    '<text x="232" y="150" font-size="10" fill="var(--text-muted,#6c7086)">drag onto canvas</text>'
  );
}

function svgWiring() {
  return svgFrame(
    nodeBox(36, 78, 'Slider', 'var(--accent-blue,#89b4fa)') +
    nodeBox(226, 78, 'Extrude', 'var(--accent-purple,#cba6f7)') +
    '<path d="M114 101 C 170 101 170 101 226 101" fill="none" stroke="var(--accent-blue,#89b4fa)" stroke-width="2.5"/>' +
    port(114, 101, 'var(--accent-blue,#89b4fa)') + port(226, 101, 'var(--accent-purple,#cba6f7)') +
    // a little "live" pulse on the wire
    '<circle cx="170" cy="101" r="4" fill="var(--accent-green,#a6e3a1)"><animate attributeName="cx" values="118;222;118" dur="2.4s" repeatCount="indefinite"/></circle>' +
    '<text x="170" y="150" text-anchor="middle" font-size="10" fill="var(--text-muted,#6c7086)">data flows &amp; recomputes live</text>'
  );
}

function svgViewer() {
  return svgFrame(
    // isometric cube
    '<g transform="translate(170 96)">' +
      '<path d="M0 -46 L40 -23 L40 23 L0 46 L-40 23 L-40 -23 Z" fill="none" stroke="var(--border-color,#313244)"/>' +
      '<path d="M0 -46 L40 -23 L0 0 L-40 -23 Z" fill="var(--accent-blue,#89b4fa)" opacity="0.55"/>' +
      '<path d="M40 -23 L40 23 L0 46 L0 0 Z" fill="var(--accent-purple,#cba6f7)" opacity="0.45"/>' +
      '<path d="M-40 -23 L0 0 L0 46 L-40 23 Z" fill="var(--accent-teal,#94e2d5)" opacity="0.35"/>' +
    '</g>' +
    // viewport gizmo
    '<g transform="translate(296 40)">' +
      '<line x1="0" y1="0" x2="14" y2="0" stroke="var(--accent-red,#f38ba8)" stroke-width="2"/>' +
      '<line x1="0" y1="0" x2="0" y2="14" stroke="var(--accent-green,#a6e3a1)" stroke-width="2"/>' +
      '<line x1="0" y1="0" x2="-10" y2="8" stroke="var(--accent-blue,#89b4fa)" stroke-width="2"/>' +
    '</g>'
  );
}

function svgAI() {
  return svgFrame(
    '<g>' +
      '<rect x="28" y="40" width="180" height="40" rx="12" fill="var(--bg-surface,#252538)" stroke="var(--border-color,#313244)"/>' +
      '<text x="44" y="64" font-size="11" fill="var(--text-secondary,#a6adc8)">Make a twisting tower…</text>' +
    '</g>' +
    '<g>' +
      '<rect x="132" y="104" width="180" height="44" rx="12" fill="var(--accent-purple,#cba6f7)" opacity="0.18" stroke="var(--accent-purple,#cba6f7)"/>' +
      '<text x="148" y="124" font-size="11" fill="var(--text-primary,#cdd6f4)">Added Loft + Twist nodes</text>' +
      '<text x="148" y="138" font-size="10" fill="var(--text-muted,#6c7086)">wired to your geometry</text>' +
    '</g>' +
    '<circle cx="300" cy="56" r="12" fill="var(--accent-purple,#cba6f7)" opacity="0.9"/>' +
    '<text x="300" y="60" text-anchor="middle" font-size="11" fill="var(--bg-primary,#1e1e2e)">AI</text>'
  );
}

function svgProjects() {
  let cards = '';
  const names = ['Pavilion', 'Facade', 'Bridge'];
  names.forEach((nm, i) => {
    const x = 28 + i * 100;
    cards +=
      '<rect x="' + x + '" y="56" width="84" height="88" rx="10" fill="var(--bg-surface,#252538)" stroke="var(--border-color,#313244)"/>' +
      '<rect x="' + (x + 10) + '" y="68" width="64" height="40" rx="6" fill="var(--accent-blue,#89b4fa)" opacity="0.22"/>' +
      '<text x="' + (x + 42) + '" y="128" text-anchor="middle" font-size="11" fill="var(--text-secondary,#a6adc8)">' + nm + '</text>';
  });
  return svgFrame(
    '<text x="28" y="40" font-size="11" fill="var(--text-muted,#6c7086)">Recent projects</text>' + cards
  );
}

function svgConnect() {
  return svgFrame(
    '<rect x="34" y="78" width="86" height="44" rx="10" fill="var(--bg-surface,#252538)" stroke="var(--accent-blue,#89b4fa)"/>' +
    '<text x="77" y="104" text-anchor="middle" font-size="12" fill="var(--text-primary,#cdd6f4)">Nova</text>' +
    '<rect x="220" y="78" width="86" height="44" rx="10" fill="var(--bg-surface,#252538)" stroke="var(--accent-peach,#fab387)"/>' +
    '<text x="263" y="104" text-anchor="middle" font-size="12" fill="var(--text-primary,#cdd6f4)">Revit</text>' +
    // bidirectional link
    '<path d="M120 94 L 220 94" stroke="var(--accent-peach,#fab387)" stroke-width="2"/>' +
    '<path d="M120 106 L 220 106" stroke="var(--accent-blue,#89b4fa)" stroke-width="2"/>' +
    '<path d="M212 88 L 222 94 L 212 100" fill="none" stroke="var(--accent-peach,#fab387)" stroke-width="2"/>' +
    '<path d="M128 100 L 118 106 L 128 112" fill="none" stroke="var(--accent-blue,#89b4fa)" stroke-width="2"/>' +
    '<text x="170" y="150" text-anchor="middle" font-size="10" fill="var(--text-muted,#6c7086)">pull &amp; push geometry</text>'
  );
}

function svgHero() {
  return (
    '<svg viewBox="0 0 280 220" width="100%" role="img" preserveAspectRatio="xMidYMid meet">' +
      '<defs>' +
        '<linearGradient id="learnHeroGrad" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="var(--accent-blue,#89b4fa)"/>' +
          '<stop offset="1" stop-color="var(--accent-purple,#cba6f7)"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<circle cx="140" cy="110" r="92" fill="url(#learnHeroGrad)" opacity="0.12"/>' +
      nodeBox(28, 60, 'Curve', 'var(--accent-blue,#89b4fa)') +
      nodeBox(150, 30, 'Loft', 'var(--accent-purple,#cba6f7)') +
      nodeBox(150, 130, 'Mesh', 'var(--accent-green,#a6e3a1)') +
      '<path d="M106 83 C 130 83 130 53 150 53" fill="none" stroke="var(--accent-blue,#89b4fa)" stroke-width="2"/>' +
      '<path d="M228 53 C 250 53 250 153 228 153" fill="none" stroke="var(--accent-purple,#cba6f7)" stroke-width="2"/>' +
      port(106, 83, 'var(--accent-blue,#89b4fa)') + port(150, 53, 'var(--accent-purple,#cba6f7)') +
      port(228, 53, 'var(--accent-purple,#cba6f7)') + port(228, 153, 'var(--accent-green,#a6e3a1)') +
    '</svg>'
  );
}

function svgSpark() {
  return (
    '<svg viewBox="0 0 64 64" width="56" height="56" role="img" aria-hidden="true">' +
      '<path d="M32 6 L37 27 L58 32 L37 37 L32 58 L27 37 L6 32 L27 27 Z" fill="var(--accent-yellow,#f9e2af)" opacity="0.9"/>' +
    '</svg>'
  );
}
