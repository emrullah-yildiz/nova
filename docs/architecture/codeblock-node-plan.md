# CodeBlock Node — Design & Migration Plan

> Status: **PLAN ONLY** (no build). Owner review gate — read, decide the open
> questions at the bottom, then approve before any code is written.
> Branch: `docs/codeblock-node-plan` off `develop`. Doc-only commit.

This plan designs a Dynamo-style **Code Block** node for Nova and the evolution of
the existing custom nodes. It is grounded in the real code, not aspiration:

- `src/nodes/categories/custom.js` — the modern custom node defs
  (`Custom.AI`, `Custom.Code`, `Custom.Comment`, `Custom.Formula`, `Custom.Python`).
- `src/runtime/python-port-decl.js` — the **code-driven port** engine
  (`parsePythonPortDecls`, `inferInputPorts`, `lastTopLevelAssignment`,
  `resolvePythonPorts`, `nextPythonPorts`, `setInputHeader`, `renamePythonPort`,
  `wrapPythonNodeCode`). Pure + unit-testable.
- `src/runtime/pyrunner.js` — wires that engine into the node UI
  (`enhancePythonNode`, `pyAddInput`/`pyRemoveInput`, `pyRenamePort`,
  `pySyncPorts`, `_pyResyncPortsFromCode`) and routes execution through Pyodide.
- `src/core/engine.js` — `custom-python` / `custom-code` / `Custom.Python` are
  special-cased to `PythonRunner.execute`; reads `_pyResults` for downstream.
- `src/core/node-versions.js` — node versioning + migration
  (`version`, `priorVersions`, `resolveVersionedDef`, `migrateControlValues`,
  per-version `migrateFrom`).
- `src/app/app.js` — the **central Code Viewer terminal** (`cv-code` textarea +
  `cv-code-highlight` overlay) where Python code is actually edited; node body
  only shows ports + "double-click to edit".
- `docs/NOVA.md` §4 — fit gate, no-duplicate-nodes rule, naming, Properties rule,
  "Code-driven Custom.Python ports".

---

## 0. Three findings that shape every decision below

1. **There is no C# execution engine in Nova.** `csharp` appears only as a
   *codegen string template* on node defs (e.g. `custom.js`, `list.js`); nothing
   evaluates it. Grep for `blazor|mono|wasm|transpile|DesignScript` returns no
   runtime. **Real in-browser C# = a large new dependency (Blazor/Mono WASM) or a
   transpiler.** Dynamo's "Code Block" is **DesignScript**, not C#. So Phase 1 is
   Python-only and honest; C# is a gated later phase (§6).

2. **Custom.Python is NOT edited inline on the node today.** The node body shows
   ports + a `{ } double-click to edit` hint; the actual editing happens in a
   **shared Code Viewer panel** (`cv-code` textarea in `app.js`). The owner's
   requirement "the box grows as you type, on the node" is therefore a **new UI
   surface**, not a tweak to existing behavior. This is the single biggest UI
   decision and is called out as **OPEN-1**.

3. **The series shortcut overlaps existing nodes.** `List.Range`
   (start/end/step, end-exclusive) and `List.Sequence` (start/step/count,
   length-driven) already exist (`src/nodes/categories/list.js`). The `..` syntax
   must *desugar to the same semantics* (produce a number list), not introduce a
   third range concept. No-duplicate rule (NOVA.md §4) applies.

---

## 1. What CodeBlock is

**`Custom.CodeBlock`** — a lightweight, multi-statement code box with code-driven
dynamic ports, modeled on Dynamo's Code Block but described on Nova's own terms
(no "like Dynamo" in user-facing copy, per naming rule).

- **Free / unknown variables → INPUT ports.**
- **Assigned (and `print`-ed) variables → OUTPUT ports.**
- **Literals need no ports:** `a = 5`, `s = "hi"`, `0..10..#5` produce outputs
  with no inputs.
- It reuses the **existing** `python-port-decl.js` inference engine — extended,
  not duplicated.

It is **`language = python`** in Phase 1 (the real runtime). The def keeps a
`language` field so C# can slot in later (§6) without a new node type.

### 1.1 Port inference rules (extends `resolvePythonPorts`)

The current engine already gives us 90% of this:

| Rule | Source today | Change for CodeBlock |
|---|---|---|
| Free vars read but never bound → inputs | `inferInputPorts` | **none** — reuse as-is |
| Last top-level assignment → output | `lastTopLevelAssignment` | **extend: ALL top-level assigned names → outputs**, not just the last |
| `# in:` / `# out:` headers authoritative | `parsePythonPortDecls` | keep (advanced/Python-script mode) |
| Keywords/builtins/bridge excluded | `PY_KEYWORDS`/`PY_BUILTINS`/`BRIDGE_GLOBALS` | keep |

**The one real engine change:** Dynamo's Code Block exposes *every* assigned
variable as an output (`a = 1; b = a + 2` → outputs `a`, `b`). Today
`lastTopLevelAssignment` returns only the **last**. We add a sibling pure helper
`topLevelAssignments(code) -> string[]` (all distinct top-level LHS names, in
order) and a CodeBlock-specific `resolveCodeBlockPorts(code)` that:

- inputs = `inferInputPorts(code)` (unchanged),
- outputs = `topLevelAssignments(code)` (new), falling back to `output0` when none.

`Custom.Python` keeps using `resolvePythonPorts` (last-assignment-only) so its
behavior is **unchanged**. This keeps the two nodes' rules cleanly separated and
avoids regressing existing Python graphs. (See §5 for the taxonomy.)

> Open question **OPEN-2**: do we want *every* assignment as an output, or only
> "leaf" assignments (names never subsequently read)? Dynamo shows all; that can
> create many ports for intermediate temps. Recommendation: **all top-level
> assignments**, matching Dynamo, but allow `_name` (leading underscore) to mean
> "private, no port" — the inference engine already skips `_`-prefixed names.

### 1.2 Literal / boolean / string semantics

CodeBlock evaluates as **Python** (Pyodide), so semantics are Python's, with a
thin coercion layer to satisfy the owner's rules:

- **Bare number → number.** `x = 5` → number `5`. `x = 2.5` → float.
- **String → `"..."` (or `'...'`).** `s = "hello"` → string. Bare unquoted words
  that aren't bound become **input ports** (free vars), exactly as today — this is
  what makes `Result = x + y` surface `x`,`y` as inputs.
- **`1` acts as True, `0` as False (numeric booleans).** Python already treats
  `1`/`0` as truthy/falsy in boolean *context* (`if 1:`). The owner's requirement
  is that a CodeBlock output feeding a boolean-typed port coerces `1→true`,
  `0→false`. We implement this as a **wire-level coercion**, not a language
  change: when a CodeBlock numeric output flows into a `boolean` input, `0`→false,
  any other number→true (mirrors the existing single-value→list promotion pattern
  in NOVA.md §4). Conversely a `bool` into a number port → `1`/`0`.
  - This is a **coercion rule**, documented once, applied at the port boundary —
    it does **not** redefine Python's `==`/`is`. Flag: **OPEN-3** — confirm we
    coerce at the wire boundary (recommended) vs. forcing every number literal to
    a tri-state bool (rejected: breaks arithmetic).

### 1.3 Series shortcut (range syntax)

Desugars **before** execution into a Python list literal, so it runs on the
existing runtime and produces a plain number **list** (consumable by every
`List.*` node — passes the fit gate's "usable output" test).

**Chosen Nova syntax** (documented, unambiguous, Dynamo-compatible tokens):

| Syntax | Meaning | Desugars to |
|---|---|---|
| `0..10` | start..end, step = 1, **end inclusive** | `[0,1,…,10]` |
| `0..10..2` | start..end..**step** | `[0,2,4,6,8,10]` |
| `0..10..#5` | start..end..**count** (`#` = count) | 5 evenly spaced incl. ends → `[0,2.5,5,7.5,10]` |
| `0..#5..2` | start..**count**..step (`#` on the 2nd token) | `[0,2,4,6,8]` |

Rule: **`#` prefixes a count token; a plain number is end or step by position.**
This matches Dynamo's `#` convention exactly, so it's familiar without us
describing it as "like Dynamo" in copy. End is **inclusive** (Dynamo behavior),
which differs from `List.Range`'s exclusive end — documented explicitly so users
aren't surprised.

- A line like `nums = 0..10..#5` → output port `nums`, value = the list.
- A bare `0..10..#5` with no assignment → single output `output0`.
- Desugaring is a **pure pre-pass** (`desugarSeries(code) -> code`) so it's
  unit-testable and never touches the runtime. It emits a Python list literal or
  a helper call — **not** a new node — so no duplication of `List.Range`.

> **OPEN-4:** end inclusive (Dynamo, chosen here) vs. exclusive (Nova's existing
> `List.Range`). Inclusive is recommended for Code Block ergonomics; note the
> intentional divergence in docs.

### 1.4 Pre-filled "Series CodeBlock" shortcut

Per requirement 3, provide a fast way to drop a ready-made series block:

- **Node-library entry:** a single library item "Series (Code Block)" that inserts
  a `Custom.CodeBlock` pre-loaded with `nums = 0..10..#11`. This is a *library
  preset of the same node type* (like a snippet), **not** a new node `type` — so
  it does not violate no-duplicate. Implemented via the library's existing preset
  mechanism (controls default override).
- **Keyboard shortcut:** propose `C` then `B` (or a single configurable key) on an
  empty canvas to drop a blank CodeBlock; `S` to drop the series preset.
  **OPEN-5:** confirm the exact keys against the existing shortcut map in
  `app.js` (`['INPUT','TEXTAREA','SELECT']` guard at ~line 2527). The
  orchestrator did not reserve keys to avoid collisions — Switch picks free ones.

---

## 2. Auto-grow UI spec (no scrollbars)

This is a **new inline editor on the node body**, replacing the current
"double-click to edit in terminal" model for CodeBlock (the Code Viewer terminal
stays for full `Custom.Python` scripts). Owned by **Switch (ui-engineer)**.

**Behavior:**

- The code area is a `<textarea>` (or contenteditable) with
  `overflow: hidden` — **never** `auto`/`scroll`. No horizontal or vertical
  scrollbars, in any state.
- **Height = line count.** On every `input` event, set
  `el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';`
  (the standard auto-grow idiom — `scrollHeight` is already used elsewhere in
  `app.js`/`pyrunner.js`, so the pattern exists). Min 1 row; **no max** on height
  (the node grows down).
- **Width = longest line, capped.** Measure the longest line in monospace and set
  width to fit it, clamped between a `MIN_W` (e.g. 160px) and `MAX_W`
  (e.g. 460px). At `MAX_W`, **soft-wrap** lines (`white-space: pre-wrap`) and let
  height absorb the wrap — still no horizontal scrollbar. Width measurement via a
  hidden mirror element or canvas `measureText` (pure, no layout thrash).
- **Ports re-derive on commit, not per keystroke** — mirror the existing
  `pySyncPorts` decision (re-port on `change`, not `input`) so the editor keeps
  focus while typing. Auto-grow (resize) happens per keystroke; port re-derivation
  happens on blur/commit. This split is deliberate and matches current Python UX.
- Node card width follows the editor width; the renderer's existing node-resize
  path is reused. **Hot file:** `src/ui/node-renderer.js` (one agent at a time).

**OPEN-1 (the big one):** Should CodeBlock edit **inline on the node** (this spec)
or reuse the **existing Code Viewer terminal**? Inline matches Dynamo and the
owner's "box grows as you type" wording → **recommended**. But it is net-new UI
and the largest UI lift. The orchestrator recommends inline for CodeBlock and
keeping the terminal for `Custom.Python` full scripts. Owner confirms.

---

## 3. Remove `Custom.Formula` (+ migration)

`Custom.Formula` (inputs `x`,`y`; control `expr`; default `x + y`; JS `eval`) is
fully superseded: a CodeBlock with `Result = x + y` produces the same two inputs
and one output, with arbitrary expressions and more inputs.

**Removal + graceful migration via `node-versions.js`:**

1. **Do not delete the type id outright** — old saved graphs reference
   `Custom.Formula` / alias `custom-formula`. Deleting it would orphan nodes.
2. Register a **migration shim**: keep `Custom.Formula` resolvable, but mark it
   `deprecated: true` (hidden from the library / fit gate) and give it a
   `migrateTo` that converts an instance into a `Custom.CodeBlock`:
   - new code = `Result = <expr>` (the old `expr` control value, defaulting
     `x + y`),
   - inputs `x`,`y` re-derive automatically from the free vars in `<expr>`,
   - output `Result`,
   - **wire remap:** old ports `x`,`y`,`result` → CodeBlock ports `x`,`y`,
     `Result` (1:1 by name; `result`→`Result` handled in the migrator).
3. Migration runs **on load** (when a graph containing `Custom.Formula` is
   opened) and/or lazily when the node is first computed — same hook the engine
   already uses to populate `_dynInputs`. Use `migrateControlValues` +
   a node-type rewrite. **OPEN-6:** auto-convert on load (recommended, seamless)
   vs. leave deprecated-but-working until the user edits (safer, zero-touch).
   Recommendation: auto-convert on load behind a one-time per-graph pass, with the
   old def retained one release as a fallback so nothing breaks if the migrator
   misses an edge case.

> Note: this is a **type→type** migration, which `node-versions.js` does not do
> natively today (it versions *within* a type). Neo adds a small pure
> `migrateNodeType(oldType, instance) -> newInstance` helper in
> `src/core/node-versions.js` (or a sibling `node-migrations.js`) and wires it
> into the load path. Kept pure + unit-tested per the "pure helper + thin wiring"
> pattern.

---

## 4. Rename `Custom.Code` → `Custom.CodeBlock` (preserve old graphs)

`Custom.Code` is the natural home for CodeBlock (it's already the "code block"
custom node). Plan:

1. **New canonical type id: `Custom.CodeBlock`**, display name "CodeBlock".
2. **Keep `Custom.Code` + alias `custom-code` working** as deprecated aliases that
   resolve to the new def — the registry already supports `aliases`, and the
   engine already aliases `custom-code`/`custom-python`/`Custom.Python` together in
   its switch (`engine.js` ~line 906). Add `Custom.CodeBlock` to that same switch
   arm so it routes through the runtime.
3. **Behavior change is real** (JS single-input → Python multi-port code block),
   so this is a **versioned** change, not a silent swap:
   - `Custom.CodeBlock` def declares `version: 2`,
   - `priorVersions: [ <the old JS Custom.Code v1 def> ]` so a pinned v1 graph
     still runs the **old JS** behavior exactly,
   - `migrateFrom: { 1: (old) => ({ code: jsToCodeBlock(old.code) }) }` offers an
     opt-in upgrade. `jsToCodeBlock` wraps a `return input0;` body into
     `output0 = input0` form (best-effort; flagged for review where the JS isn't
     trivially portable). **OPEN-7:** auto-upgrade v1→v2 on load, or keep v1
     graphs on v1 and only upgrade when the user picks the new version in the
     node's version picker (the picker UI already exists per `availableVersions`)?
     Recommendation: **keep v1 on v1** (JS keeps working), surface v2 in the
     version picker, default **new** nodes to v2. Zero risk to old graphs.

This satisfies "old type id keeps working / migrates" without breaking JS graphs.

---

## 5. Custom.Python overlap — taxonomy recommendation

Both CodeBlock and `Custom.Python` do code-driven ports. The no-duplicate rule
(NOVA.md §4) forbids two nodes for the same purpose. Two options:

- **(a) Keep both, with a sharp boundary** (RECOMMENDED):
  - **`Custom.CodeBlock`** = lightweight, **inline**, multi-statement block for
    literals / series / formulas / free-var ports. **All** top-level assignments →
    outputs. No `# in:`/`# out:` headers, no `import`, no Revit bridge UI. Edits
    **inline** on the node (auto-grow). The "I want to type `Result = x + y` and
    get ports" node.
  - **`Custom.Python`** = the **full Python script** escape hatch: `import math`,
    Geo/RevitBridge bridge globals, `# in:`/`# out:` typed headers, last-assignment
    output, edited in the **Code Viewer terminal**. The "I need a real script with
    typed ports and the host bridge" node.
  - Boundary is **capability-based and documented**: CodeBlock = expressions +
    series + literals (no imports/bridge); Python = scripts + imports + bridge +
    typed headers. They share the *inference engine* (`python-port-decl.js`) but
    expose different surfaces. This passes the fit gate: each enables a workflow
    the other doesn't serve well.

- **(b) Fold Python into CodeBlock as `language=python` + a "script mode" toggle.**
  Cleaner taxonomy on paper, but: it merges the inline auto-grow box with the
  full-script terminal, the bridge-globals UI, and typed headers into one node
  with modes — more complex, riskier migration, and muddies the "lightweight"
  promise. Rejected for Phase 1.

**Recommendation: (a).** Ship CodeBlock as the lightweight inline block; keep
`Custom.Python` as the distinct full-script node. Revisit folding only if usage
shows the boundary confuses users. **OPEN-8:** owner confirms (a) vs (b).

---

## 6. Language: C# feasibility verdict + phasing

**Honest verdict: Nova cannot execute C# today, and shouldn't pretend to.**

- The `csharp` codegen fields are **export templates** only — never evaluated.
- Real in-browser C# requires **Blazor WebAssembly / Mono-WASM** (multi-MB runtime
  download, big bundle + cold-start cost) **or** a **C#→JS/Python transpiler**
  (large, partial-coverage dependency). Either is a major platform decision, not a
  node feature.
- Dynamo's Code Block is **DesignScript**, not C#. So "C# Code Block" is not even
  the Dynamo-faithful thing; it's a Nova-specific ask.

**Phasing:**

- **Phase 1 — Python (REAL).** Everything in §1–§5 on the existing Pyodide
  runtime: free-var inputs, all-assignment outputs, number/string literals,
  numeric-bool coercion, the `..`/`#` series shortcut, inline auto-grow UI,
  Formula removal, Code→CodeBlock rename. **This is the shippable scope.**
- **Phase 2 — C# (GATED on a runtime decision).** Do **not** start until the owner
  picks a path. Options, with trade-offs:
  - **2a. Restricted expression subset** (SMALL): support a safe C#-ish
    *expression* grammar (`a = x + y`, arithmetic, ternary) transpiled to JS/Python
    — no full language, no libraries. Cheap, but limited and arguably not worth a
    separate language label.
  - **2b. Blazor/Mono-WASM** (LARGE): real C#, multi-MB runtime, bundle + perf
    cost, ongoing maintenance. Only if there's strong demand for true C#.
  - **2c. Keep C# as codegen-export only** (ZERO runtime): CodeBlock stays Python
    for execution; "Export to C#" remains a codegen string. Likely the honest
    long-term answer.
  - A **time-boxed spike** (owned by a runtime spike engineer, see §8) measures
    bundle size + cold start for 2b before any commitment.

The `Custom.CodeBlock` def carries a `language` field (`'python'` now) so a future
language is a value, not a new node — no taxonomy churn when/if C# lands.

**OPEN-9:** owner picks the Phase-2 direction (2a / 2b / 2c / defer). Phase 1 does
not depend on this.

---

## 7. Fit-gate / naming / Properties compliance

- **Fit gate (NOVA.md §4):**
  1. *Valuable workflow* — yes: "type a formula/series, get ports" is a core
     parametric workflow; series feeds every `List.*` consumer.
  2. *Not a duplicate* — CodeBlock replaces Formula (removed) and is bounded
     against Custom.Python (§5); series **desugars** to existing list semantics
     rather than adding a `List.Range` clone.
  3. *Usable inputs with real producers* — free-var inputs are `any`, fed by any
     upstream node.
  4. *Usable outputs with real consumers* — outputs are numbers/strings/lists,
     consumed by `List.*`, `Output.Watch`, math nodes.
  5. *Working sample* — `help.example`: `Input.Number(5)` → CodeBlock
     `Result = x * 2` → `Output.Watch` (= 10). Series sample:
     CodeBlock `nums = 0..10..#6` → `List.Sum` → `Output.Watch`. Both run and
     produce defined, readable results (verify, don't assume).
- **Naming:** `Custom.CodeBlock` follows `Parent.Node`. Icon stays a symbol
  (`{ }`), never a text abbreviation. No "like Dynamo/Grasshopper" in user copy.
- **Properties rule:** CodeBlock outputs raw values (numbers/strings/lists), not
  opaque handles — nothing to expose as Properties; rule satisfied trivially.
- **No-duplicate:** Formula folded out; series desugars (no new range node);
  Python boundary defined.

---

## 8. Phase / lane table (Matrix codenames)

| Phase | Task | Lane / codename | Owns (files) | Notes / gate |
|---|---|---|---|---|
| 1 | All-assignment output inference + `topLevelAssignments` + `resolveCodeBlockPorts` + `desugarSeries` (pure) | **Neo (core-engineer)** | `src/runtime/python-port-decl.js`, new `src/runtime/codeblock-syntax.js`, tests | extends, doesn't duplicate, the inference engine |
| 1 | `Custom.CodeBlock` def (v2) + `Custom.Code` v1 priorVersion + aliases + library preset + samples | **Neo (core-engineer)** | `src/nodes/categories/custom.js` | fit gate, naming |
| 1 | Engine routing for `Custom.CodeBlock` + numeric-bool wire coercion | **Neo (core-engineer)** | `src/core/engine.js` | mirrors single-value→list coercion |
| 1 | Formula removal + type→type migration helper | **Neo (core-engineer)** | `src/core/node-versions.js` (or new `node-migrations.js`), load hook in `src/app/app.js`* | *app.js is a hot file — coordinate lock |
| 1 | Inline auto-grow editor on the node + dynamic-port rendering + width/height fit | **Switch (ui-engineer)** | `src/ui/node-renderer.js` (hot), `src/runtime/pyrunner.js` (render path) | no scrollbars; resize per keystroke, re-port on commit |
| 1 | Series library preset + keyboard shortcuts | **Switch (ui-engineer)** | `src/ui/node-library.js` (hot), shortcut map in `src/app/app.js`* | *hot file — coordinate |
| 2 | C# runtime feasibility spike (bundle/cold-start for Blazor vs transpiler vs codegen-only) | **C# runtime spike owner — propose `platform-engineer` (codename "Dozer")** | spike branch, no src changes until decision | time-boxed; produces a recommendation, not a merge |

**Hot-file contention:** `src/app/app.js`, `src/ui/node-renderer.js`,
`src/core/node-library.js` are all hot files (one agent at a time). Neo needs
`app.js` (load-time migration hook + shortcuts) and Switch needs `app.js`
(shortcut map) + `node-renderer.js` + `node-library.js`. **Sequence to avoid a
collision:** Neo's pure-engine + def work (no hot files) runs in parallel with
Switch's inline-editor design; the `app.js`/`node-renderer.js`/`node-library.js`
edits are serialized — recommend a single **integration task** that lands the
hot-file edits last, or hand the `app.js` lock to one agent for the whole phase.
Decided at dispatch time, not here.

**Execution order:** Phase 1 parallel { Neo pure engine + defs, Switch editor
shell } → serialize hot-file edits (app.js / node-renderer.js / node-library.js) →
integrate + verify samples. Phase 2 spike is independent and gated on owner choice
(§6); it does not block Phase 1.

---

## 9. Open decisions for the owner (decide before build)

- **OPEN-1** — CodeBlock edits **inline on the node** (recommended, Dynamo-like)
  vs. reuse the existing Code Viewer terminal. Biggest UI call.
- **OPEN-2** — outputs = **all** top-level assignments (recommended) vs. leaf-only;
  `_name` = private/no-port.
- **OPEN-3** — numeric-bool as **wire-boundary coercion** (recommended) vs.
  language-level. (Recommend coercion.)
- **OPEN-4** — series end **inclusive** (recommended, Dynamo) vs. exclusive
  (matches `List.Range`).
- **OPEN-5** — exact keyboard shortcuts for drop-blank / drop-series (Switch picks
  free keys).
- **OPEN-6** — Formula migration: **auto-convert on load** (recommended) vs.
  deprecate-but-keep-working-until-edited.
- **OPEN-7** — Code→CodeBlock: **keep v1 (JS) graphs on v1**, default new nodes to
  v2, expose v2 in the version picker (recommended) vs. auto-upgrade.
- **OPEN-8** — Python overlap: **(a) keep both with a sharp boundary**
  (recommended) vs. (b) fold into CodeBlock as a mode.
- **OPEN-9** — C# Phase-2 direction: 2a restricted subset / 2b Blazor-WASM /
  2c codegen-export-only / defer. (Phase 1 is independent.)

---

## 10. Workboard note

This is a doc-only branch (`docs/codeblock-node-plan`). No source files touched;
no active claims required for the plan itself. When the owner approves and build
starts, Neo and Switch add their rows to `docs/agent-workboard.md` (status
`active`), locking `app.js` / `node-renderer.js` / `node-library.js` per the
hot-file rule, before any edit.
