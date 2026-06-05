// Lesson schema + authoring sanity check (PURE).
//
// A lesson is DATA, not code: a plain object Tank authors and the mini-canvas /
// validator consume. `validateLessonShape` is the authoring gate — it catches
// structural mistakes (missing ids, malformed checks, undeclared palette types)
// before a lesson ships. It does NOT run the engine; the "solution passes its own
// checks" guard (see index.js) does that.

/**
 * @typedef {Object} LessonGraph
 * @property {Array<{id:string,type:string,controlValues?:object,role?:string,x?:number,y?:number}>} nodes
 * @property {Array<{fromNode:string,fromPort:string,toNode:string,toPort:string}>} wires
 */

/**
 * @typedef {Object} LessonCheck
 * A discriminated union keyed by `kind` (see validate-lesson.js for semantics):
 *  - output:   { kind:'output', node, port?, expected, tolerance?, hint }
 *  - wiring:   { kind:'wiring', from, fromPort?, to, toPort?, hint }
 *  - presence: { kind:'presence', nodeType?|node?, control?, value?, hint }
 *  - choice:   { kind:'choice', selected?, answer, hint }
 */

/**
 * @typedef {Object} LessonStep
 * @property {string} prompt          What the learner must do this step.
 * @property {Array<LessonCheck>} checks
 */

/**
 * @typedef {Object} Lesson
 * @property {string} id              Stable unique id.
 * @property {'beginner'|'advanced'} track
 * @property {number} order           Sort order within the track.
 * @property {string} title
 * @property {string} intro           Prose/markdown-lite shown above the canvas.
 * @property {Array<string>} palette  Node types offered in the scoped library.
 * @property {LessonGraph} starter    Graph the learner begins from.
 * @property {Array<LessonStep>} steps
 * @property {LessonGraph} [solution] Reference solution; CI asserts it passes checks.
 * @property {Array<string>} [hints]  Optional ordered fallback hints.
 */

export const TRACKS = Object.freeze(['beginner', 'advanced']);
export const CHECK_KINDS = Object.freeze(['output', 'wiring', 'presence', 'choice']);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function validateGraphShape(graph, label, errors) {
  if (!isPlainObject(graph)) {
    errors.push(`${label} must be an object with { nodes, wires }`);
    return;
  }
  if (!Array.isArray(graph.nodes)) {
    errors.push(`${label}.nodes must be an array`);
  } else {
    const seen = new Set();
    graph.nodes.forEach((n, i) => {
      if (!isPlainObject(n)) {
        errors.push(`${label}.nodes[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(n.id)) errors.push(`${label}.nodes[${i}].id must be a non-empty string`);
      else if (seen.has(n.id)) errors.push(`${label}.nodes[${i}].id "${n.id}" is duplicated`);
      else seen.add(n.id);
      if (!isNonEmptyString(n.type)) errors.push(`${label}.nodes[${i}].type must be a non-empty string`);
    });
  }
  if (graph.wires != null && !Array.isArray(graph.wires)) {
    errors.push(`${label}.wires must be an array`);
  } else if (Array.isArray(graph.wires)) {
    graph.wires.forEach((w, i) => {
      if (!isPlainObject(w)) {
        errors.push(`${label}.wires[${i}] must be an object`);
        return;
      }
      ['fromNode', 'fromPort', 'toNode', 'toPort'].forEach((field) => {
        if (!isNonEmptyString(w[field])) {
          errors.push(`${label}.wires[${i}].${field} must be a non-empty string`);
        }
      });
    });
  }
}

function validateCheckShape(check, label, errors) {
  if (!isPlainObject(check)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!CHECK_KINDS.includes(check.kind)) {
    errors.push(`${label}.kind "${check.kind}" must be one of ${CHECK_KINDS.join(', ')}`);
    return;
  }
  if (!isNonEmptyString(check.hint)) {
    errors.push(`${label}.hint must be a non-empty string (shown on failure)`);
  }
  switch (check.kind) {
    case 'output':
      if (!isNonEmptyString(check.node)) errors.push(`${label}.node (target node id/role) is required`);
      if (!('expected' in check)) errors.push(`${label}.expected is required`);
      break;
    case 'wiring':
      if (!isNonEmptyString(check.from)) errors.push(`${label}.from (source node id/role) is required`);
      if (!isNonEmptyString(check.to)) errors.push(`${label}.to (target node id/role) is required`);
      break;
    case 'presence':
      if (!isNonEmptyString(check.nodeType) && !isNonEmptyString(check.node)) {
        errors.push(`${label} requires either nodeType or node`);
      }
      if (isNonEmptyString(check.node) && !isNonEmptyString(check.control)) {
        errors.push(`${label} with node requires a control to inspect`);
      }
      break;
    case 'choice':
      if (!('answer' in check)) errors.push(`${label}.answer is required`);
      break;
    default:
      break;
  }
}

/**
 * Authoring sanity check for a lesson object.
 * @param {Lesson} lesson
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateLessonShape(lesson) {
  const errors = [];

  if (!isPlainObject(lesson)) {
    return { valid: false, errors: ['lesson must be an object'] };
  }

  if (!isNonEmptyString(lesson.id)) errors.push('lesson.id must be a non-empty string');
  if (!TRACKS.includes(lesson.track)) errors.push(`lesson.track must be one of ${TRACKS.join(', ')}`);
  if (typeof lesson.order !== 'number' || Number.isNaN(lesson.order)) {
    errors.push('lesson.order must be a number');
  }
  if (!isNonEmptyString(lesson.title)) errors.push('lesson.title must be a non-empty string');
  if (!isNonEmptyString(lesson.intro)) errors.push('lesson.intro must be a non-empty string');

  if (!Array.isArray(lesson.palette) || lesson.palette.length === 0) {
    errors.push('lesson.palette must be a non-empty array of node types');
  } else if (!lesson.palette.every(isNonEmptyString)) {
    errors.push('lesson.palette entries must be non-empty strings');
  }

  // starter is optional but, if present, must be a valid graph; palette must cover
  // every node type the starter seeds so the library can render it.
  if (lesson.starter != null) {
    validateGraphShape(lesson.starter, 'lesson.starter', errors);
    if (Array.isArray(lesson.palette) && Array.isArray(lesson.starter.nodes)) {
      const paletteSet = new Set(lesson.palette);
      lesson.starter.nodes.forEach((n) => {
        if (n && n.type && !paletteSet.has(n.type)) {
          errors.push(`lesson.starter seeds "${n.type}" which is not in palette`);
        }
      });
    }
  }

  if (!Array.isArray(lesson.steps) || lesson.steps.length === 0) {
    errors.push('lesson.steps must be a non-empty array');
  } else {
    lesson.steps.forEach((step, si) => {
      if (!isPlainObject(step)) {
        errors.push(`lesson.steps[${si}] must be an object`);
        return;
      }
      if (!isNonEmptyString(step.prompt)) errors.push(`lesson.steps[${si}].prompt must be a non-empty string`);
      if (!Array.isArray(step.checks) || step.checks.length === 0) {
        errors.push(`lesson.steps[${si}].checks must be a non-empty array`);
      } else {
        step.checks.forEach((check, ci) => {
          validateCheckShape(check, `lesson.steps[${si}].checks[${ci}]`, errors);
        });
      }
    });
  }

  // A lesson whose steps use graph checks (output/wiring/presence) MUST ship a
  // solution so the CI guard can prove it is completable.
  const usesGraphChecks = Array.isArray(lesson.steps)
    && lesson.steps.some(
      (s) => Array.isArray(s.checks) && s.checks.some((c) => c && c.kind !== 'choice')
    );
  if (usesGraphChecks) {
    if (lesson.solution == null) {
      errors.push('lesson.solution is required when steps include graph checks (output/wiring/presence)');
    } else {
      validateGraphShape(lesson.solution, 'lesson.solution', errors);
    }
  }

  if (lesson.hints != null && (!Array.isArray(lesson.hints) || !lesson.hints.every(isNonEmptyString))) {
    errors.push('lesson.hints, if present, must be an array of non-empty strings');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Flatten every check across a lesson's steps (used by the solution guard).
 * @param {Lesson} lesson
 * @returns {Array<LessonCheck>}
 */
export function collectLessonChecks(lesson) {
  if (!lesson || !Array.isArray(lesson.steps)) return [];
  return lesson.steps.reduce((acc, step) => {
    if (step && Array.isArray(step.checks)) acc.push(...step.checks);
    return acc;
  }, []);
}
