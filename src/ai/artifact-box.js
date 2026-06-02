// Builds a SEPARATE "artifact" message box directly below an answer bubble, so
// the testing / code-ready / plan / approve UI renders in its own bubble and
// never overwrites the answer prose or the "Thinking" block the user watched
// stream. Pure DOM construction (takes the document) so it's unit-testable.
//
// Returns the inner .chat-artifact element to write into, or null if there's no
// answer bubble. If the answer bubble is detached (no parent chain), it falls
// back to nesting the artifact inside the bubble so callers still get a target.
export function createArtifactBox(doc, answerBubble) {
  if (!doc || !answerBubble) return null;
  const answerMsg = answerBubble.parentNode;          // the .chat-msg ai row
  const container = answerMsg && answerMsg.parentNode; // the chat-messages list
  if (!container) {
    const inner = doc.createElement('div');
    inner.className = 'chat-artifact';
    answerBubble.appendChild(inner);
    return inner;
  }
  const box = doc.createElement('div');
  box.className = 'chat-msg ai chat-artifact-msg';
  // Hidden avatar keeps left alignment without repeating the ✦ glyph, so the
  // artifact reads as a continuation of the same answer.
  box.innerHTML = '<div class="chat-avatar" style="visibility:hidden">✦</div><div class="chat-bubble chat-artifact"></div>';
  // Insert right after the answer message, before any later messages.
  if (answerMsg.nextSibling) container.insertBefore(box, answerMsg.nextSibling);
  else container.appendChild(box);
  return box.querySelector('.chat-artifact');
}
