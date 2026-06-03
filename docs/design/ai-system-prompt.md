# AI system prompt — expert design brain (Phases 0–1)

## Goal
Make the assistant produce **academically-defensible parametric architecture**
(mathematical forms, facades) using Nova's *real* geometry capabilities — not
toy boxes. The kernel is already rich; the bottleneck was the prompt.

## Latent bug found & fixed (important)
`buildSystemPrompt` injected the node catalog with **escaped** backticks inside
the template literal:

```
\` + buildNodeCatalog() + \`     // escaped → literal text, never interpolated
```

So the auto-generated **node inventory never reached the model** — the prompt
contained the literal string `` ` + buildNodeCatalog() + ` ``. The AI was flying
on training priors + the literal examples, which directly explains the method
hallucinations (e.g. `Geo.voronoiOnMesh`) and naive output. Fixed by splicing
the dynamic blocks via placeholder tokens after the literal is built:

```js
sys = sys
  .replace('__NOVA_NODE_CATALOG__', buildNodeCatalog())
  .replace('__NOVA_CAPABILITY_LEDGER__', buildCapabilityLedger());
```

## Phase 0 — Capability ledger (`src/ai/capability-ledger.js`)
A curated, **intent-grouped** view of the architecturally-meaningful `Geo.*`
calls (Mathematical surfaces · Form-finding fields · Surfacing · Panelization ·
Solids & boolean · Transforms). Drift policy:
- **Signatures** for node-backed methods come from the registry
  (`getGeoSignatureMap()` in node-catalog.js) — never hand-copied.
- A thin **overlay** adds only the design semantics the kernel can't express:
  intent group, a one-line "when to use" note, and an honesty **flag**
  (`[approx]`/`[stub]`) on the weak ops (boolean CSG, grid-Voronoi).
- `capability-ledger.test.js` asserts every method named exists in the
  validator's `getKnownGeoMethods()`, so the ledger can never advertise a method
  the validator would reject.

## Phase 1 — Expert prompt (`buildSystemPrompt`)
Kept every working piece (response format, runtime constraints, refusal
contract, COOKBOOK, live graph context, problems, show-action protocol) and:
- **Role framing** — "Nova's computational-design expert … academically-
  defensible geometry," replacing "the AI for a scripting tool."
- **Capability ledger** injected (intent-grouped, with honesty flags).
- **Form vocabulary** (ruled/developable/minimal, NURBS degree & continuity,
  attractor falloff, noise octaves).
- **Parametric method** (expose vs derive; sane ranges; t = i/(n-1)).
- **Facade/panelization playbook** (host on a surface; hex vs diagrid vs voronoi;
  vary by field).
- **Two new worked examples** that actually run (catenary minimal-surface shell;
  phyllotactic attractor-driven facade) — proven by `system-prompt-expert.test.js`.
- **Pre-emit self-check** (state the math + precedent, list parameters, closed
  profiles, panels hosted, no magic numbers, compose around stubs).

The full build-intent prompt is now ~33KB / ~8k tokens (trivial for 200k-context
models). The slim proxy prompt is unchanged for cheap conversational turns.

## Phase 2 — Golden examples (`src/ai/golden-examples.js`)
A curated library of 12 expert, runnable reference designs (twisted tower,
organic pavilion, catenary shell, hypar roof, gyroid lattice, NURBS shell,
attractor facade, Voronoi skin, noise blob, seashell, helix structure, diagrid).
Two jobs:
- **Quality pin** — `golden-examples.test.js` runs every example through the
  Python runner and asserts it yields geometry, so a kernel/method regression is
  caught instead of silently teaching the AI broken code.
- **Prompt grounding** — `buildGoldenGallery()` injects a compact palette (title
  + intent + key methods) into the prompt (placeholder `__NOVA_GALLERY__`) so the
  model knows the range of forms it can produce and which Geo.* calls realize them.

## Not yet done (later phases, each gated)
- **Phase 3** — library hardening: real boolean CSG, surface-conforming
  paneling + mullions, better Voronoi.
- **Phase 4** — architectural validation in the fix loop (semantic + vision).
