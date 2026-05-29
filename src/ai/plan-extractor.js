// Extracts a `nova-plan` block from an AI response. We look for a fenced
// code block tagged `nova-plan`:
//
//   Some explanation prose…
//   ```nova-plan
//   { "version": 1, "ops": [ ... ] }
//   ```
//
// Returns { plan, narrationBefore, narrationAfter } or null when no plan
// block is found. The narrations let the chat UI show the AI's explanation
// surrounding the plan without re-parsing.

const PLAN_FENCE = /```nova-plan\s*\n([\s\S]*?)\n\s*```/;

export function extractPlanFromResponse(text) {
  if (typeof text !== 'string' || !text) return null;
  const m = text.match(PLAN_FENCE);
  if (!m) return null;
  const raw = m[1].trim();
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    return {
      plan: null,
      parseError: err && err.message || String(err),
      raw,
      narrationBefore: text.slice(0, m.index).trim(),
      narrationAfter: text.slice(m.index + m[0].length).trim()
    };
  }
  return {
    plan,
    narrationBefore: text.slice(0, m.index).trim(),
    narrationAfter: text.slice(m.index + m[0].length).trim()
  };
}
