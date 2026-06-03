import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { createArtifactBox } from '../src/ai/artifact-box.js';

function answerIn(doc, container, text) {
  const msg = doc.createElement('div');
  msg.className = 'chat-msg ai';
  msg.innerHTML = '<div class="chat-avatar">✦</div><div class="chat-bubble">' + text + '</div>';
  container.appendChild(msg);
  return { msg, bubble: msg.querySelector('.chat-bubble') };
}

describe('createArtifactBox (artifact renders in its own box)', () => {
  it('creates a separate sibling box and leaves the answer + thinking untouched', () => {
    const doc = new JSDOM('<div id="c"></div>').window.document;
    const container = doc.getElementById('c');

    // A "Thinking" block, then the answer — mirrors the real chat layout.
    const think = doc.createElement('div');
    think.className = 'chat-msg ai chat-thinking-msg';
    container.appendChild(think);
    const { msg, bubble } = answerIn(doc, container, 'streamed prose');

    const artifact = createArtifactBox(doc, bubble);

    expect(artifact).toBeTruthy();
    expect(artifact.classList.contains('chat-artifact')).toBe(true);
    // Answer prose is NOT touched and the artifact is NOT nested inside it.
    expect(bubble.textContent).toBe('streamed prose');
    expect(bubble.querySelector('.chat-artifact')).toBeNull();
    // Thinking block still present.
    expect(container.querySelector('.chat-thinking-msg')).toBe(think);
    // Artifact lives in its own box, immediately after the answer message.
    const box = artifact.closest('.chat-artifact-msg');
    expect(box).toBeTruthy();
    expect(msg.nextSibling).toBe(box);
    expect(container.children.length).toBe(3); // think, answer, artifact
  });

  it('inserts before later messages so chat order is preserved', () => {
    const doc = new JSDOM('<div id="c"></div>').window.document;
    const container = doc.getElementById('c');
    const { msg, bubble } = answerIn(doc, container, 'answer');
    const later = doc.createElement('div');
    later.className = 'chat-msg user';
    container.appendChild(later);

    const artifact = createArtifactBox(doc, bubble);
    const box = artifact.closest('.chat-artifact-msg');
    expect(msg.nextSibling).toBe(box);
    expect(box.nextSibling).toBe(later);
  });

  it('falls back to nesting when the answer bubble is detached, and is null-safe', () => {
    const doc = new JSDOM('').window.document;
    const detached = doc.createElement('div'); // no parent chain
    const nested = createArtifactBox(doc, detached);
    expect(nested).toBeTruthy();
    expect(detached.querySelector('.chat-artifact')).toBe(nested);

    expect(createArtifactBox(doc, null)).toBeNull();
    expect(createArtifactBox(null, detached)).toBeNull();
  });
});
