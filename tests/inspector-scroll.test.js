import { readFileSync } from 'node:fs';

describe('Inspector scrolling styles', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

  it('keeps inspector panels vertically scrollable without horizontal overflow', () => {
    expect(css).toMatch(/\.node-inspector-content\s*{[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden/s);
    expect(css).toMatch(/\.node-data-content\s*{[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden/s);
  });

  it('constrains list views inside the Data Inspector', () => {
    expect(css).toMatch(/\.data-list-view\s*{[^}]*max-height:\s*180px[^}]*overflow-y:\s*auto[^}]*overflow-x:\s*hidden/s);
    expect(css).toMatch(/\.data-list-item\s*{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/s);
  });
});
