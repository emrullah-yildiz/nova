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
- **P2** — Structured `turn` model + incremental (non-wiping) renderer + a
  collapsible **Thinking** disclosure (expanded while streaming, auto-collapse on
  done).
- **P3** — Real chain-of-thought via Anthropic extended thinking: enable `thinking`
  in the proxy request and parse `thinking_delta` (today only `text_delta` is
  read) into the Thinking block. Fallback: a derived **step timeline** from Nova's
  pipeline (received → parsing → validating → building → done).
- **P4** — Agentic affordances: tool/action chips (Reading graph, Applying fix,
  Filing ticket), Stop / Retry / Copy, status pills.

## Decisions (made)
- Ship the **step timeline** before real thinking (free, works today); add real
  thinking when the proxy supports it.
- Thinking **expanded while streaming, auto-collapse on done**.
- Artifacts **inline** (Nova already has the code terminal for the heavy view).
