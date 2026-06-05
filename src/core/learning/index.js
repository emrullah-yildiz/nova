// Learning system core — public surface.
//
// Exposes the pure validator, the lesson schema helpers, a lesson registry, and
// the "solution passes its own checks" CI guard (the learn-system analog of the
// node "working sample" gate). Tank/Mouse register real lessons (under
// src/ui/learning/lessons/) into this registry later; it is empty for now.

import { validateChecks } from './validate-lesson.js';
import { validateLessonShape, collectLessonChecks } from './lesson-schema.js';

export {
  validateChecks,
  createLessonComputeContext,
  deepEqualWithTolerance,
  readNodeOutput
} from './validate-lesson.js';

export {
  validateLessonShape,
  collectLessonChecks,
  TRACKS,
  CHECK_KINDS
} from './lesson-schema.js';

// ── Lesson registry / manifest hook ──────────────────────────────────────────
// Empty for now. Tank adds lessons via registerLesson(...) from the manifest.

const _lessons = new Map();

/**
 * Register a lesson into the manifest. Throws on a malformed lesson or a
 * duplicate id so authoring mistakes fail loudly at startup/test time.
 * @param {import('./lesson-schema.js').Lesson} lesson
 */
export function registerLesson(lesson) {
  const shape = validateLessonShape(lesson);
  if (!shape.valid) {
    throw new Error(`Invalid lesson "${lesson && lesson.id}": ${shape.errors.join('; ')}`);
  }
  if (_lessons.has(lesson.id)) {
    throw new Error(`Duplicate lesson id "${lesson.id}"`);
  }
  _lessons.set(lesson.id, lesson);
  return lesson;
}

/** @returns {Array<import('./lesson-schema.js').Lesson>} sorted by track then order */
export function listLessons() {
  return [..._lessons.values()].sort((a, b) => {
    if (a.track !== b.track) return a.track < b.track ? -1 : 1;
    return (a.order || 0) - (b.order || 0);
  });
}

export function getLesson(id) {
  return _lessons.get(id);
}

/** Test-only reset so suites don't leak registered lessons between cases. */
export function _clearLessons() {
  _lessons.clear();
}

/**
 * The CI solution guard: run every one of a lesson's checks against the lesson's
 * own `solution` graph and assert they ALL pass. `choice` checks have no graph to
 * evaluate, so the guard supplies the authored `answer` as the selection (the
 * solution, by definition, knows the right MCQ answer).
 *
 * @param {import('./lesson-schema.js').Lesson} lesson
 * @param {object} [options] forwarded to validateChecks (e.g. { registry })
 * @returns {{ pass: boolean, results: Array, firstHint: (string|null) }}
 */
export function verifyLessonSolution(lesson, options = {}) {
  const solution = lesson.solution || { nodes: [], wires: [] };
  const checks = collectLessonChecks(lesson).map((check) =>
    check.kind === 'choice' ? { ...check, selected: check.answer } : check
  );
  return validateChecks(solution, checks, options);
}
