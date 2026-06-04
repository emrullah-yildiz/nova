// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderMarkdown, escapeHtml, LEGAL_DOCS } from '../src/ui/legal-viewer.js';
import app from '../src/app/app.js';

describe('renderMarkdown (safe markdown renderer)', () => {
  it('renders headings, bold/italic/code, links, lists, tables, blockquotes, hr', () => {
    const md = [
      '# Title',
      '',
      'A **bold** and *italic* and `code` line with a [doc](privacy-policy.md) and an [ext](https://example.com).',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '> a quote',
      '',
      '---'
    ].join('\n');
    const html = renderMarkdown(md);
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
    // Internal doc link becomes a slug switcher, external opens new tab safely.
    expect(html).toContain('data-legal-slug="privacy"');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">ext</a>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<blockquote>a quote</blockquote>');
    expect(html).toContain('<hr>');
  });

  it('escapes HTML in text — no script injection', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> & <img src=x onerror=y>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('does not emit javascript: links', () => {
    const html = renderMarkdown('[x](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    // Falls back to plain (escaped) label text.
    expect(html).toContain('x');
  });

  it('escapeHtml handles quotes and ampersands', () => {
    expect(escapeHtml('"a" & <b>')).toBe('&quot;a&quot; &amp; &lt;b&gt;');
  });
});

describe('app legal viewer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    app._escLegal = null;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    app.closeLegal();
  });

  it('showLegal() renders the Privacy Policy by default', () => {
    app.showLegal();
    const overlay = document.getElementById('legal-overlay');
    expect(overlay).not.toBeNull();
    const content = document.getElementById('legal-content');
    expect(content.innerHTML).toContain('<h1>Privacy Policy</h1>');
    // Active nav item is Privacy Policy.
    const active = overlay.querySelector('.legal-nav-item.active');
    expect(active.textContent).toBe('Privacy Policy');
  });

  it('left-nav switches to another doc', () => {
    app.showLegal();
    app.showLegal('data');
    const content = document.getElementById('legal-content');
    expect(content.innerHTML).toContain('<h1>Data Handling &amp; Sub-processors</h1>');
    const active = document.querySelector('#legal-overlay .legal-nav-item.active');
    expect(active.textContent).toBe('Data Handling');
  });

  it('renders the Data Handling tables as <table>', () => {
    app.showLegal('data');
    const content = document.getElementById('legal-content');
    expect(content.querySelectorAll('table').length).toBeGreaterThanOrEqual(2);
    // Sub-processor table content is present.
    expect(content.textContent).toContain('Cloudflare, Inc.');
  });

  it('escapes HTML in doc text rendered into the DOM (no injected script element)', () => {
    app.showLegal();
    const content = document.getElementById('legal-content');
    // No <script> nodes ever reach the DOM from doc content.
    expect(content.querySelectorAll('script').length).toBe(0);
  });

  it('nav exposes all five user-facing docs', () => {
    app.showLegal();
    const items = document.querySelectorAll('#legal-overlay .legal-nav-item');
    expect(items.length).toBe(LEGAL_DOCS.length);
    expect(items.length).toBe(5);
  });

  it('closeLegal() removes the overlay', () => {
    app.showLegal();
    app.closeLegal();
    expect(document.getElementById('legal-overlay')).toBeNull();
  });
});

describe('sign-in modal accept-terms footer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    app._authConfig = {};
    app._signInReason = '';
    app._escSignIn = null;
  });
  afterEach(() => {
    app.closeSignIn();
    app.closeLegal();
  });

  it('renders .signin-legal with both links wired to showLegal', () => {
    app.openSignIn();
    const footer = document.querySelector('#signin-overlay .signin-legal');
    expect(footer).not.toBeNull();
    const links = footer.querySelectorAll('a');
    expect(links.length).toBe(2);
    const onclicks = Array.from(links).map(a => a.getAttribute('onclick'));
    expect(onclicks.some(o => o.includes("app.showLegal('terms')"))).toBe(true);
    expect(onclicks.some(o => o.includes("app.showLegal('privacy')"))).toBe(true);
  });
});
