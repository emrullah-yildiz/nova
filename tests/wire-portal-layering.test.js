import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}', 's'));
  return match ? match[1] : '';
}

function zIndex(selector) {
  const match = ruleBody(selector).match(/z-index:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

describe('wire portal layering', () => {
  it('keeps portal rings above the 3D viewport in split view', () => {
    expect(zIndex('.canvas-area.split-view.view-3d #viewport-3d')).toBe(5);
    expect(zIndex('.canvas-area.split-view #portal-overlay')).toBeGreaterThan(5);
  });

  it('hides portal overlay in 3D-only mode with the rest of the 2D layers', () => {
    expect(css).toMatch(/\.canvas-area\.view-3d:not\(\.split-view\)\s+#portal-overlay\s*\{\s*display:\s*none/s);
  });
});
