import { describe, it, expect } from 'vitest';
import { buildCapabilityLedger, _ledgerMethodNames } from '../src/ai/capability-ledger.js';
import { getKnownGeoMethods } from '../src/ai/code-validator.js';

describe('capability ledger', () => {
  it('only references Geo.* methods that actually exist (no drift / hallucinated entries)', () => {
    const known = getKnownGeoMethods();
    const missing = _ledgerMethodNames().filter((name) => !known.has(name));
    expect(missing).toEqual([]);
  });

  it('renders intent groups, honesty flags, and registry-derived signatures', () => {
    const text = buildCapabilityLedger();
    // Intent groups present.
    expect(text).toContain('Mathematical surfaces');
    expect(text).toContain('Form-finding fields');
    expect(text).toContain('Panelization');
    // Honesty flags surfaced for the weak ops.
    expect(text).toContain('booleanSubtract');
    expect(text).toContain('[stub]');
    expect(text).toContain('[approx]');
    // A node-backed signature was pulled from the registry (return type + arrow).
    expect(text).toMatch(/Geo\.createBox\([^)]*\)\s*→/);
    // A utility method with no node still shows its authored signature.
    expect(text).toContain('Geo.multiAttractor(');
  });

  it('lists the distinctive mathematical surfaces by their real method names', () => {
    const names = _ledgerMethodNames();
    expect(names).toContain('createGyroid');
    expect(names).toContain('createCatenaryShell');
    expect(names).toContain('createEnneperSurface'); // not "createEnneper"
    expect(names).not.toContain('createEnneper');
  });
});
