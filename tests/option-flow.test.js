import {
  buildDecideYourselfReply,
  buildOptionReply,
  buildOtherReply,
  firstOptionGroup,
  parseOptionGroups
} from '../src/ai/option-flow.js';

describe('option-flow parser', () => {
  it('splits multiple headed option groups and exposes only the first active group', () => {
    const text = `Pick the petal count.

**Petal Count:**
[1] 5 petals - natural, asymmetric feel
[2] 6 petals - balanced honeycomb harmony
[3] 8 petals - grand formal symmetry

**Petal Shape:**
[1] Cupped & rising - petals curve upward
[2] Splayed open - petals sweep outward`;

    const groups = parseOptionGroups(text);

    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe('Petal Count');
    expect(groups[0].options.map(o => o.label)).toEqual(['5 petals', '6 petals', '8 petals']);
    expect(groups[1].title).toBe('Petal Shape');
    expect(firstOptionGroup(text).title).toBe('Petal Count');
  });

  it('starts a new group when numbering resets even without headings', () => {
    const groups = parseOptionGroups(`[1] 5 petals - natural
[2] 6 petals - balanced
[1] Cupped - curves upward
[2] Splayed - sweeps outward`);

    expect(groups).toHaveLength(2);
    expect(groups[0].options.map(o => o.label)).toEqual(['5 petals', '6 petals']);
    expect(groups[1].options.map(o => o.label)).toEqual(['Cupped', 'Splayed']);
  });

  it('builds deterministic replies for option buttons and action buttons', () => {
    expect(buildOptionReply('Petal Count', { num: '2', label: '6 petals' })).toBe('Petal Count: 2. 6 petals');
    expect(buildDecideYourselfReply('Petal Count')).toContain('fill the remaining design parameters');
    expect(buildOtherReply('Petal Count')).toContain('one question at a time');
  });
});
