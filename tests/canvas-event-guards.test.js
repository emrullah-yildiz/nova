import {
  shouldCancelRectSelection,
  shouldStartRectSelection
} from '../src/ui/canvas-event-guards.js';

function targetWithClosest(matches = []) {
  return {
    closest(selector) {
      return matches.indexOf(selector) >= 0 ? { selector } : null;
    }
  };
}

describe('canvas event guards', () => {
  it('lets plain left-button canvas drags start rectangular selection', () => {
    expect(shouldStartRectSelection({}, {
      button: 0,
      altKey: false,
      target: targetWithClosest()
    })).toBe(true);
  });

  it('keeps portal drag/drop above rectangular selection', () => {
    expect(shouldStartRectSelection({ _portalDragActive: true }, {
      button: 0,
      altKey: false,
      target: targetWithClosest()
    })).toBe(false);

    expect(shouldStartRectSelection({}, {
      button: 0,
      altKey: false,
      target: targetWithClosest(['.portal-ring'])
    })).toBe(false);
  });

  it('does not start rectangular selection from other interactive UI', () => {
    ['.node', '.canvas-toolbar', '.canvas-zoom', '.ws-chat-panel', '.node-library'].forEach(selector => {
      expect(shouldStartRectSelection({}, {
        button: 0,
        altKey: false,
        target: targetWithClosest([selector])
      })).toBe(false);
    });
  });

  it('cancels active rectangular selection while another canvas operation owns the drag', () => {
    expect(shouldCancelRectSelection({ _portalDragActive: true })).toBe(true);
    expect(shouldCancelRectSelection({ isPanning: true })).toBe(true);
    expect(shouldCancelRectSelection({ draggingNode: { id: 'node-1' } })).toBe(true);
    expect(shouldCancelRectSelection({ connectingWire: { fromNode: 'node-1' } })).toBe(true);
    expect(shouldCancelRectSelection({})).toBe(false);
  });
});
