// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildLearningHtml, initLearning, LEARNING_CHAPTERS } from '../src/ui/learning-page.js';
import app from '../src/app/app.js';

describe('buildLearningHtml (pure builder)', () => {
  it('contains the panel, nav, and chapter content containers', () => {
    const html = buildLearningHtml();
    expect(html).toContain('class="learn-panel"');
    expect(html).toContain('id="learn-nav"');
    expect(html).toContain('id="learn-chapter-content"');
    expect(html).toContain('id="learn-scroll"');
  });

  it('has the correct number of chapters', () => {
    expect(LEARNING_CHAPTERS.length).toBe(10);
  });

  it('every chapter has an id, title, intro, sections, and quiz', () => {
    LEARNING_CHAPTERS.forEach((ch, i) => {
      expect(typeof ch.id).toBe('string');
      expect(ch.id.length).toBeGreaterThan(0);
      expect(typeof ch.title).toBe('string');
      expect(ch.title.length).toBeGreaterThan(0);
      expect(typeof ch.intro).toBe('string');
      expect(ch.intro.length).toBeGreaterThan(0);
      expect(Array.isArray(ch.sections)).toBe(true);
      expect(ch.sections.length).toBeGreaterThan(0);
      expect(Array.isArray(ch.quiz)).toBe(true);
      // Last chapter (Code Block) and others should all have quizzes
      expect(ch.quiz.length).toBeGreaterThan(0);
      // Every quiz question has options and an answer
      ch.quiz.forEach((q) => {
        expect(typeof q.q).toBe('string');
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(typeof q.answer).toBe('number');
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.options.length);
        expect(typeof q.explanation).toBe('string');
      });
    });
  });
});

describe('initLearning + interactivity', () => {
  let overlay;

  beforeEach(() => {
    document.body.innerHTML = '';
    overlay = document.createElement('div');
    overlay.id = 'learning-overlay';
    overlay.innerHTML = buildLearningHtml();
    document.body.appendChild(overlay);
    initLearning(overlay);
  });

  afterEach(() => {
    if (overlay && overlay.parentNode) overlay.remove();
    delete window.__learnGo;
    delete window.__learnAnswer;
  });

  it('renders the first chapter title in the content area', () => {
    const content = document.getElementById('learn-chapter-content');
    expect(content).not.toBeNull();
    expect(content.textContent).toContain(LEARNING_CHAPTERS[0].title);
  });

  it('renders the chapter nav with all chapter titles', () => {
    const nav = document.getElementById('learn-nav');
    expect(nav).not.toBeNull();
    LEARNING_CHAPTERS.forEach((ch) => {
      expect(nav.textContent).toContain(ch.title);
    });
  });

  it('renders quiz options for the first chapter', () => {
    const opts = overlay.querySelectorAll('.learn-quiz-opt');
    expect(opts.length).toBeGreaterThan(0);
  });

  it('__learnGo navigates to the next chapter', () => {
    window.__learnGo(1);
    const content = document.getElementById('learn-chapter-content');
    expect(content.textContent).toContain(LEARNING_CHAPTERS[1].title);
  });

  it('__learnAnswer with wrong option shows wrong feedback, does not advance', () => {
    const ch = LEARNING_CHAPTERS[0];
    const wrongIdx = ch.quiz[0].answer === 0 ? 1 : 0;
    window.__learnAnswer(0, 0, wrongIdx);
    const fb = document.getElementById('lqf-0-0');
    expect(fb).not.toBeNull();
    expect(fb.textContent).toContain('Not quite');
  });

  it('__learnAnswer with correct option shows correct feedback', () => {
    const ch = LEARNING_CHAPTERS[0];
    window.__learnAnswer(0, 0, ch.quiz[0].answer);
    const content = document.getElementById('learn-chapter-content');
    // After correct answer the UI re-renders — check feedback is shown
    expect(content.innerHTML).toContain('Correct!');
  });
});

describe('chapter examples — simpleExample and advancedExample', () => {
  it('every chapter has a simpleExample and an advancedExample', () => {
    LEARNING_CHAPTERS.forEach((ch, i) => {
      expect(ch.simpleExample, 'chapter ' + i + ' missing simpleExample').toBeTruthy();
      expect(ch.advancedExample, 'chapter ' + i + ' missing advancedExample').toBeTruthy();
    });
  });

  it('every simpleExample has a non-empty title and at least 3 numbered steps', () => {
    LEARNING_CHAPTERS.forEach((ch, i) => {
      const ex = ch.simpleExample;
      expect(typeof ex.title, 'chapter ' + i + ' simpleExample.title type').toBe('string');
      expect(ex.title.length, 'chapter ' + i + ' simpleExample.title length').toBeGreaterThan(0);
      expect(Array.isArray(ex.steps), 'chapter ' + i + ' simpleExample.steps array').toBe(true);
      expect(ex.steps.length, 'chapter ' + i + ' simpleExample.steps count').toBeGreaterThanOrEqual(3);
    });
  });

  it('every advancedExample has a non-empty title and at least 3 numbered steps', () => {
    LEARNING_CHAPTERS.forEach((ch, i) => {
      const ex = ch.advancedExample;
      expect(typeof ex.title, 'chapter ' + i + ' advancedExample.title type').toBe('string');
      expect(ex.title.length, 'chapter ' + i + ' advancedExample.title length').toBeGreaterThan(0);
      expect(Array.isArray(ex.steps), 'chapter ' + i + ' advancedExample.steps array').toBe(true);
      expect(ex.steps.length, 'chapter ' + i + ' advancedExample.steps count').toBeGreaterThanOrEqual(3);
    });
  });

  it('renders .learn-example containers (not the old nodeDiagramSvg HTML)', () => {
    const overlay = document.createElement('div');
    overlay.innerHTML = buildLearningHtml();
    document.body.appendChild(overlay);
    initLearning(overlay);
    const content = overlay.querySelector('#learn-chapter-content');
    const examples = content.querySelectorAll('.learn-example');
    expect(examples.length).toBe(2); // simple + advanced
    // Ensure the old fake-node-graph SVG approach is gone
    expect(content.innerHTML).not.toContain('learn-example-diagram');
    overlay.remove();
    delete window.__learnGo;
    delete window.__learnAnswer;
  });

  it('each chapter renders .learn-example--simple and .learn-example--advanced', () => {
    LEARNING_CHAPTERS.forEach((ch, chIdx) => {
      const overlay = document.createElement('div');
      overlay.innerHTML = buildLearningHtml();
      document.body.appendChild(overlay);
      initLearning(overlay);
      window.__learnGo(chIdx);
      const content = overlay.querySelector('#learn-chapter-content');
      expect(content.querySelector('.learn-example--simple'),
        'chapter ' + chIdx + ' missing .learn-example--simple').not.toBeNull();
      expect(content.querySelector('.learn-example--advanced'),
        'chapter ' + chIdx + ' missing .learn-example--advanced').not.toBeNull();
      overlay.remove();
      delete window.__learnGo;
      delete window.__learnAnswer;
    });
  });

  it('buildChapterHtml includes the "Try It" section when examples exist', () => {
    const overlay = document.createElement('div');
    overlay.innerHTML = buildLearningHtml();
    document.body.appendChild(overlay);
    initLearning(overlay);
    const content = overlay.querySelector('#learn-chapter-content');
    expect(content.innerHTML).toContain('Try It');
    expect(content.innerHTML).toContain('Simple Example');
    expect(content.innerHTML).toContain('Advanced Example');
    overlay.remove();
    delete window.__learnGo;
    delete window.__learnAnswer;
  });

  it('example steps appear as an ordered list in the rendered chapter', () => {
    const overlay = document.createElement('div');
    overlay.innerHTML = buildLearningHtml();
    document.body.appendChild(overlay);
    initLearning(overlay);
    const content = overlay.querySelector('#learn-chapter-content');
    const ol = content.querySelectorAll('.learn-example-steps');
    expect(ol.length).toBe(2); // simple + advanced
    ol.forEach(function (list) {
      expect(list.querySelectorAll('li').length).toBeGreaterThanOrEqual(3);
    });
    overlay.remove();
    delete window.__learnGo;
    delete window.__learnAnswer;
  });

});

describe('app Nova Learning page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    app._escLearning = null;
    // Stub history.pushState so jsdom doesn't error on it
    if (typeof history !== 'undefined' && !history._orig) {
      history._orig = history.pushState;
      history.pushState = () => {};
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
    app.closeLearning();
    if (typeof history !== 'undefined' && history._orig) {
      history.pushState = history._orig;
      delete history._orig;
    }
  });

  it('showLearning() opens the overlay with chapter nav and first chapter content', () => {
    app.showLearning();
    const overlay = document.getElementById('learning-overlay');
    expect(overlay).not.toBeNull();
    const nav = overlay.querySelector('#learn-nav');
    expect(nav).not.toBeNull();
    expect(nav.textContent).toContain(LEARNING_CHAPTERS[0].title);
    const content = overlay.querySelector('#learn-chapter-content');
    expect(content).not.toBeNull();
    expect(content.textContent).toContain(LEARNING_CHAPTERS[0].title);
  });

  it('has the "Start a new project" action wired to newProject on the last chapter', () => {
    app.showLearning();
    // Navigate to last chapter
    window.__learnGo(LEARNING_CHAPTERS.length - 1);
    // Answer all quiz questions correctly in the last chapter
    const lastIdx = LEARNING_CHAPTERS.length - 1;
    LEARNING_CHAPTERS[lastIdx].quiz.forEach((q, qi) => {
      window.__learnAnswer(lastIdx, qi, q.answer);
    });
    const btn = document.querySelector('#learning-overlay .learn-btn--primary');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('onclick')).toContain('app.newProject()');
  });

  it('the Data Privacy link triggers showLegal("privacy")', () => {
    app.showLearning();
    const link = document.querySelector('#learning-overlay .learn-privacy-link');
    expect(link).not.toBeNull();
    const onclick = link.getAttribute('onclick');
    expect(onclick).toContain("app.showLegal('privacy')");
    const spy = vi.spyOn(app, 'showLegal').mockImplementation(() => {});
    new Function('app', onclick)(app);
    expect(spy).toHaveBeenCalledWith('privacy');
  });

  it('closeLearning() removes the overlay', () => {
    app.showLearning();
    app.closeLearning();
    expect(document.getElementById('learning-overlay')).toBeNull();
  });
});
