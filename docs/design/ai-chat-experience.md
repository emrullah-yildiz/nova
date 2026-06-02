# AI Chat Experience — architecture & plan

## Problem
The assistant rendered a whole turn into **one mutable bubble** that got
overwritten: streaming did `bubble.innerHTML = fmt(extract(fullText))` every
token (full re-render), `_extractDisplayText` collapsed to `"✨ Thinking…"` as
soon as a code block streamed, and on completion a plan/code reply **replaced the
bubble** with an artifact card — discarding the reasoning the user watched stream.
There was no separate, persistent "thinking" channel.

## Target architecture
An assistant turn is a structured set of regions, each persistent and updated
incrementally:
- **status** — Thinking → Planning → Building → Done
- **thinking** — collapsible reasoning, streams, persists
- **answer** — streamed prose, append-only, persists
- **artifacts** — code/plan/action cards rendered *below* the answer, never
  replacing it
- **steps** — optional tool/action timeline

## Market baseline (2026)
Claude.ai (collapsible Thinking + Artifacts), ChatGPT GPT‑5/o-series (Thinking
summary + Canvas), Cursor/Windsurf (streamed reasoning + tool-call timeline + diff
cards), Perplexity (step timeline). Shared principles: **append-only streaming**,
**reasoning as a first-class collapsible persistent block**, **artifacts as cards
that don't replace prose**, **status/step timeline**.

## Phased plan
- **P1 (DONE)** — Stop erasing the narrative. The streamed answer persists in its
  bubble; plan/code/approve UI renders into a separate `.chat-artifact` block
  appended below it; the duplicate explanation was dropped from artifact headers.
- **P2/P3 (DONE for the Anthropic path)** — A collapsible **Thinking** disclosure
  streams the model's real reasoning above the answer (expanded while streaming,
  auto-collapses on done). `callStream` requests Anthropic extended thinking
  (`thinking: {type:'enabled', budget_tokens}`, temperature forced to 1, larger
  max_tokens) and parses `thinking_delta` into the block. Gated to thinking-capable
  Anthropic models (Sonnet/Opus 4.x, 3.7 Sonnet) and the streaming chat only (not
  utility JSON calls); disable via `localStorage 'nova:ai-thinking' = 'off'`. The
  shared free-tier proxy (OpenAI-format) has no reasoning, so the block simply
  doesn't appear there.
- **P2 remaining** — Generalize to a structured `turn` model + incremental
  (non-wiping) renderer; for non-Anthropic providers, a derived **step timeline**
  (received → parsing → validating → building → done) as the reasoning stand-in.
- **P4** — Agentic affordances: tool/action chips (Reading graph, Applying fix,
  Filing ticket), Stop / Retry / Copy, status pills.
  - **Stop (DONE)** — `callStream` runs under an `AbortController`
    (`GPTClient.stopStream()`); aborting finalizes whatever streamed as a normal
    partial reply. A "Stop" pill shows below the streaming message and is removed
    on finalize. Remaining: Retry / Copy / tool chips.

## Decisions (made)
- Ship the **step timeline** before real thinking (free, works today); add real
  thinking when the proxy supports it.
- Thinking **expanded while streaming, auto-collapse on done**.
- Artifacts **inline** (Nova already has the code terminal for the heavy view).
