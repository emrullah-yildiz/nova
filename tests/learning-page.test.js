// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildLearningHtml, LEARNING_STEPS } from '../src/ui/learning-page.js';
import app from '../src/app/app.js';

describe('buildLearningHtml (pure builder)', () => {
  it('contains the hero, all 8 step sections, and the footer', () => {
    const html = buildLearningHtml();
    expect(html).toContain('class="learn-hero"');
    expect(html).toContain('Build parametric design, visually.');
    // 7 designed step sections + the footer "Ready to design?" = 8 sections.
    expect(LEARNING_STEPS.length).toBe(7);
    LEARNING_STEPS.forEach((s) => {
      expect(html).toContain('id="learn-step-' + s.id + '"');
      expect(html).toContain(s.title);
    });
    expect(html).toContain('class="learn-footer"');
    expect(html).toContain('Ready to design?');
  });

  it('every figure ships an inline SVG and never a broken <img> (img is hidden + has no src)', () => {
    const html = buildLearningHtml();
    const svgCount = (html.match(/<svg /g) || []).length;
    // hero + spark + one per step.
    expect(svgCount).toBeGreaterThanOrEqual(LEARNING_STEPS.length + 1);
    // The optional screenshot <img> ships hidden with a data-shot-src (NOT src),
    // so the browser never requests a missing file as a visible broken image.
    expect(html).not.toMatch(/<img[^>]*\ssrc=/);
    expect(html).toContain('data-shot-src="learning/what.png"');
    expect(html).toContain('class="learn-shot"');
  });
});

describe('app Nova Learning page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    app._escLearning = null;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    app.closeLearning();
  });

  it('showLearning() opens the overlay with hero + all 7 step headings', () => {
    app.showLearning();
    const overlay = document.getElementById('learning-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.querySelector('.learn-hero')).not.toBeNull();
    LEARNING_STEPS.forEach((s) => {
      const sec = document.getElementById('learn-step-' + s.id);
      expect(sec).not.toBeNull();
      expect(sec.textContent).toContain(s.title);
    });
    // The footer "Ready to design?" section is the 8th section overall.
    expect(overlay.querySelector('.learn-footer')).not.toBeNull();
  });

  it('renders inline SVG illustrations and no visible broken <img>', () => {
    app.showLearning();
    const overlay = document.getElementById('learning-overlay');
    // Inline SVGs are present in the DOM.
    expect(overlay.querySelectorAll('svg').length).toBeGreaterThanOrEqual(LEARNING_STEPS.length);
    // Any screenshot <img> that didn't load is hidden (jsdom never loads them).
    overlay.querySelectorAll('img.learn-shot').forEach((img) => {
      expect(img.hidden).toBe(true);
    });
  });

  it('the Data Privacy link triggers showLegal("privacy")', () => {
    app.showLearning();
    const link = document.querySelector('#learning-overlay .learn-privacy-link');
    expect(link).not.toBeNull();
    // The link is wired to showLegal('privacy') (matches the legal-viewer test
    // pattern, which asserts the onclick wiring rather than dispatching, since
    // this jsdom env does not execute inline handler attributes).
    const onclick = link.getAttribute('onclick');
    expect(onclick).toContain("app.showLegal('privacy')");
    // And running that handler against the real app invokes showLegal('privacy').
    const spy = vi.spyOn(app, 'showLegal').mockImplementation(() => {});
    new Function('app', onclick)(app);
    expect(spy).toHaveBeenCalledWith('privacy');
  });

  it('the footer exposes a "Start a new project" action wired to newProject', () => {
    app.showLearning();
    const btn = document.querySelector('#learning-overlay .learn-btn--primary');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('onclick')).toContain('app.newProject()');
  });

  it('closeLearning() removes the overlay', () => {
    app.showLearning();
    app.closeLearning();
    expect(document.getElementById('learning-overlay')).toBeNull();
  });
});
