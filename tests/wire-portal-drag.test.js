import {
  PORTAL_DEFAULT_IN_T,
  PORTAL_DEFAULT_OUT_T,
  PORTAL_MAX_T,
  PORTAL_MIN_T,
  movePortalDrag,
  startPortalDrag
} from '../src/ui/wire-portal-drag.js';

describe('wire portal drag controller', () => {
  it('starts input and output portals at their default positions when no saved position exists', () => {
    const inputDrag = startPortalDrag({
      key: 'node-1:value>node-2:x:in',
      clientX: 100,
      clientY: 50
    });
    const outputDrag = startPortalDrag({
      key: 'node-1:value>node-2:x:out',
      clientX: 100,
      clientY: 50
    });

    expect(inputDrag.startT).toBe(PORTAL_DEFAULT_IN_T);
    expect(outputDrag.startT).toBe(PORTAL_DEFAULT_OUT_T);
  });

  it('moves a portal forward and backward along the wire direction', () => {
    const drag = startPortalDrag({
      key: 'node-1:value>node-2:x:in',
      wireLength: 200,
      dx: 100,
      dy: 0,
      startT: 0.2,
      clientX: 100,
      clientY: 50
    });

    expect(movePortalDrag(drag, 150, 50)).toBeCloseTo(0.4);
    expect(movePortalDrag(drag, 50, 50)).toBeCloseTo(PORTAL_MIN_T);
  });

  it('projects diagonal drags onto the wire axis', () => {
    const drag = startPortalDrag({
      key: 'node-1:value>node-2:x:out',
      wireLength: 200,
      dx: 100,
      dy: 100,
      startT: 0.5,
      clientX: 0,
      clientY: 0
    });

    const movedT = movePortalDrag(drag, 50, 50);

    expect(movedT).toBeGreaterThan(0.5);
    expect(movedT).toBeLessThan(0.9);
  });

  it('clamps dragged portals to the allowed wire range', () => {
    const drag = startPortalDrag({
      key: 'node-1:value>node-2:x:out',
      wireLength: 100,
      dx: 100,
      dy: 0,
      startT: 0.9,
      clientX: 0,
      clientY: 0
    });

    expect(movePortalDrag(drag, 1000, 0)).toBe(PORTAL_MAX_T);
    expect(movePortalDrag(drag, -1000, 0)).toBe(PORTAL_MIN_T);
  });

  it('returns null for move events after drag state has been dropped/reset', () => {
    expect(movePortalDrag(null, 100, 100)).toBeNull();
  });
});
