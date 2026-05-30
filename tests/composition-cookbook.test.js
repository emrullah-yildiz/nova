// Phase 13: composition cookbook in the system prompt.
//
// Pins the cookbook content and the softened refusal contract. The point
// of these tests is to PREVENT a future refactor from quietly removing
// the cookbook examples or re-tightening the refusal contract — both of
// which would regress the AI back to over-refusal behaviour.

import { getLiveCoreRegistry } from '../src/nodes/coreNodes.js';
import { GPTClient } from '../src/ai/gpt-client.js';

getLiveCoreRegistry();

describe('composition cookbook in the system prompt', () => {
  const sys = GPTClient.buildSystemPrompt('');

  it('teaches the AI to decompose before refusing', () => {
    expect(sys).toContain('HOW TO COMPOSE NODES');
    expect(sys).toContain('Decomposition checklist');
  });

  it('lists the canonical chains for the most common architectural intents', () => {
    // If the AI doesn't see these chains spelled out it falls back to
    // "I don't know a single node for X, I refuse". The cookbook is
    // what teaches it that compositions exist.
    expect(sys).toMatch(/twisted tower.*Pattern\.TwistedEllipsePlates.*Solid\.ByLoft/is);
    expect(sys).toMatch(/organic pavilion.*Pattern\.OrganicProfileStack.*Solid\.ByLoft/is);
    expect(sys).toMatch(/wavy roof.*Surface\.WavyGrid/is);
    expect(sys).toMatch(/diagrid facade.*Pattern\.DiagridFacade/is);
    expect(sys).toMatch(/spiral staircase.*helix.*Pattern\.HelicalCurve/is);
  });

  it('shows the tower-with-hex-panels chain — the exact production failure that motivated Phase 13', () => {
    // Specific regression: the AI was refusing "rotating tower with hex
    // panels" because it didn't see how to chain TwistedEllipsePlates +
    // HexPanelGrid. The cookbook now spells it out as example B.
    expect(sys).toContain('Pattern.HexPanelGrid');
    expect(sys).toMatch(/Pattern\.TwistedEllipsePlates.*Pattern\.HexPanelGrid/is);
  });

  it('softens the refusal contract from "refuse if no single node" to "refusal is the LAST resort"', () => {
    expect(sys).toContain('LAST RESORT');
    expect(sys).toContain('DO NOT refuse because');
  });

  it('lists concrete reasons NOT to refuse so the AI can self-check', () => {
    expect(sys).toContain('The request has multiple parts (chain them)');
    expect(sys).toContain('decoration');
    expect(sys).toContain('transformation');
  });

  it('lists the few legitimate reasons to refuse so the AI still refuses honestly when needed', () => {
    expect(sys).toContain('DO refuse when');
    expect(sys.toLowerCase()).toContain("doesn't exist");
    expect(sys).toContain('runtime data');
  });

  it('requires the refusal reason to name the SPECIFIC missing capability', () => {
    expect(sys).toMatch(/naming the SPECIFIC|not just .too complex/i);
  });

  it('still forbids Python fallback (Phase 11 contract is preserved)', () => {
    expect(sys).toContain('Do NOT fall back to Python');
    expect(sys).toContain('Do NOT invent nodes');
  });

  it('keeps the general composition rules so the AI knows transformation patterns', () => {
    expect(sys).toContain('X with a hole');
    expect(sys).toContain('Solid.BooleanSubtract');
    expect(sys).toContain('X arrayed N times');
    expect(sys).toContain('Pattern.ArrayLinear');
  });

  it('stays under a reasonable size budget (~16 KB / 4k tokens before catalog)', () => {
    // Catalog adds ~6KB on top. Total system prompt for build-intent
    // turns lands around ~22KB / ~5.5k tokens — comfortable for any
    // modern chat model.
    expect(sys.length).toBeLessThan(20000);
  });
});
