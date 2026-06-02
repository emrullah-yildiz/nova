import { GPTClient } from './gpt-client.js';
import { validateGeneratedCode } from './code-validator.js';
import { validateGeneratedCodeTypes, formatMismatchHint } from './type-validator.js';
import { extractPlanFromResponse } from './plan-extractor.js';
import { buildCompositeRequestIssue, dedupeKey } from './issue-builder.js';
import { validatePlanShape } from './plan-schema.js';
import { validatePlanAgainstRegistry } from './plan-validator.js';
import { buildGraphFromPlan, planToPython } from './plan-builder.js';
import { rewriteGeoAliasesInResponse } from './geo-alias-rewriter.js';
import { parseNovaActions } from './graph-actions.js';
import { isTextAttachment, attachmentNames, foldAttachments, ATTACH_MAX_BYTES } from './attachment-fold.js';
import {
  buildDecideYourselfReply,
  buildOptionReply,
  buildOtherReply,
  firstOptionGroup
} from './option-flow.js';

document.addEventListener('DOMContentLoaded', () => {
  app.respond = function(ch, txt) {
    const l = txt.toLowerCase();

    if (ch === 'landing') {
      const isInfoQ = (l.includes('started') || l.includes('help') || (l.includes('node') && l.includes('available')) || l.includes('what is') || l.includes('how do'));
      if (isInfoQ) {
        if (GPTClient.canChat()) { this._gptChat(ch, txt); return; }
        if (l.includes('started') || l.includes('help'))
          this.addAIMessage('landing', "Click **New Project** or choose a **template** to begin!\n\n1. Drag nodes from the library\n2. Connect outputs → inputs\n3. Click **▸ Data Inspector** to see data\n4. Ask me anything!");
        else if (l.includes('node') && l.includes('available'))
          this.addAIMessage('landing', "**50+ nodes** in 10 categories:\n\n• **Input** — Number, Text, Boolean, Slider, Integer\n• **Math** — Add, Subtract, Multiply, Divide, Power\n• **Logic** — AND, OR, NOT, Compare, If/Branch\n• **List** — Create, Get, Length, Range, Reverse\n• **Geometry** — Point, Vector, Line, Circle, Distance\n• **Solids** — Box, Sphere, Cylinder, Cone, Torus\n• **Surfaces** — Plane, Surface Grid, Polyline, Arc\n• **Operations** — Extrude, Revolve, Loft, Boolean, Move, Scale, Trim\n• **Output** — Watch, Display, Log, Chart, Export\n• **Custom/AI** — Code, Formula, Python, Comment");
        else {
          this.addAIMessage('landing', "Click **New Project** or a **template** to get started! 🚀\n\n💡 *Tip: Set up your OpenAI API key in **Settings → Preferences** for real AI!*");
        }
        return;
      }

      const buildPrompt = txt;
      const self = this;
      this.addAIMessage('landing', "🚀 Opening a new project for you...");
      setTimeout(function() {
        self.newProject();
        setTimeout(function() {
          self.addUserMessage('workspace', buildPrompt);
          const wsMsgs = document.getElementById('ws-chat-messages');
          if (wsMsgs) {
            const ti = document.createElement('div');
            ti.className = 'chat-msg ai'; ti.id = 'ws-auto-typing';
            ti.innerHTML = '<div class="chat-avatar">✦</div><div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
            wsMsgs.appendChild(ti);
            wsMsgs.scrollTop = wsMsgs.scrollHeight;
          }
          setTimeout(function() {
            const el = document.getElementById('ws-auto-typing');
            if (el) el.remove();
            self.respond('workspace', buildPrompt);
          }, 400);
        }, 500);
      }, 400);
      return;
    }

    // Keyword shortcuts fire ONLY for short, imperative commands — never for
    // questions ("how do I add a node…?") or long prompts (e.g. a warning-fix
    // request), which must go to the AI. Otherwise these would silently hijack
    // legitimate chat into adding/removing nodes.
    const isShortCommand = txt.trim().split(/\s+/).length <= 6 && !/[?]/.test(l)
      && !/\b(how|what|why|explain|should|can you|could)\b/.test(l);

    if (isShortCommand && l.includes('add') && (l.includes('node') || l.includes('number') || l.includes('point') || l.includes('watch'))) {
      let t = 'number-input';
      if (l.includes('point')) t = 'geo-point';
      else if (l.includes('watch')) t = 'output-watch';
      else if (l.includes('text') || l.includes('string')) t = 'text-input';
      else if (l.includes('slider')) t = 'slider-input';
      const nd = this.addNodeFromLib(t);
      if (nd) this.addAIMessage('workspace', '✅ Added **' + nd.def.name + '** to canvas!');
      return;
    }
    if (isShortCommand && (l.includes('delete') || l.includes('remove'))) {
      if (this.selectedNodes.length > 0) {
        const c = this.selectedNodes.length;
        this.selectedNodes.forEach(id => this.removeNode(id));
        this.selectedNodes = [];
        this.addAIMessage('workspace', '🗑️ Removed ' + c + ' node(s)');
      } else {
        this.addAIMessage('workspace', "Select a node first, then ask me to delete it.");
      }
      return;
    }

    if (GPTClient.canChat()) {
      this._gptChat(ch, txt);
    } else {
      // canChat() is effectively always true while a proxy is wired up, so
      // this branch only runs in offline / non-deployed builds. Fall back to
      // the local operator-swap engine when it can answer, otherwise show
      // the BYOK help message.
      const existingCode = document.getElementById('cv-code') ? document.getElementById('cv-code').value : '';
      const aiResult = AIEngine.generateCode(txt, existingCode);
      if (aiResult) {
        this._pendingCode = aiResult.code;
        this.showCodeViewer(aiResult.code, null);
        this.addAIMessage('workspace', '✨ ' + aiResult.explanation + '\n\nReview the code below. **Approve** to build the visual graph, or **Cancel**.');
        this.showApproveButtons();
      } else {
        this.addAIMessage('workspace', "🔑 **AI key required** for code generation.\n\nGo to **Settings → Preferences** to set up your API key:\n\n• **OpenAI** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)\n• **Groq** (free) — [console.groq.com/keys](https://console.groq.com/keys)\n• **OpenRouter** (free) — [openrouter.ai/keys](https://openrouter.ai/keys)\n\nGroq and OpenRouter offer **free models** that work great for parametric design!");
      }
    }
  };

  // Cancels the in-flight streaming response (the Stop button). callStream
  // finalizes whatever streamed so far as a normal partial reply.
  app.stopAiStream = function() {
    if (window.GPTClient && typeof window.GPTClient.stopStream === 'function') window.GPTClient.stopStream();
  };

  // ---- File attachments -----------------------------------------------------
  // Lets the user attach text/data files to a chat message. Contents are folded
  // into the message sent to the AI (as fenced blocks) while the visible bubble
  // only shows the file names. Binary/image files are rejected for now (vision is
  // a follow-up). Pending attachments live per channel until the message sends.
  app._chatAttachments = app._chatAttachments || { landing: [], workspace: [] };
  var _chPrefix = function(ch) { return ch === 'landing' ? 'landing' : 'ws'; };
  var _escHtml = function(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  app.onChatFiles = function(ch, fileList) {
    if (!fileList || !fileList.length) return;
    var list = app._chatAttachments[ch] || (app._chatAttachments[ch] = []);
    Array.prototype.forEach.call(fileList, function(file) {
      if (!isTextAttachment(file.name, file.type)) { app._toast('📎 ' + file.name + ' — only text/data files can be attached (images aren\'t supported yet).'); return; }
      if (file.size > ATTACH_MAX_BYTES) { app._toast('📎 ' + file.name + ' is too large (max 256 KB).'); return; }
      var reader = new FileReader();
      reader.onload = function() {
        list.push({ name: file.name, text: String(reader.result || ''), size: file.size });
        app._renderChatAttachments(ch);
      };
      reader.onerror = function() { app._toast('📎 Could not read ' + file.name + '.'); };
      reader.readAsText(file);
    });
  };

  app._renderChatAttachments = function(ch) {
    var host = document.getElementById(_chPrefix(ch) + '-chat-attachments');
    if (!host) return;
    var list = app._chatAttachments[ch] || [];
    host.innerHTML = list.map(function(f, i) {
      var kb = f.size < 1024 ? (f.size + ' B') : (Math.round(f.size / 1024) + ' KB');
      return '<span class="chat-attach-chip" title="' + _escHtml(f.name) + ' · ' + kb + '">📎 <span class="chat-attach-name">' + _escHtml(f.name) +
        '</span><span class="chat-attach-x" title="Remove" onclick="app.removeChatAttachment(\'' + ch + '\',' + i + ')">✕</span></span>';
    }).join('');
    host.style.display = list.length ? 'flex' : 'none';
  };

  app.removeChatAttachment = function(ch, i) {
    var list = app._chatAttachments[ch] || [];
    if (i >= 0 && i < list.length) list.splice(i, 1);
    app._renderChatAttachments(ch);
  };

  // Names appended to the visible user bubble (the content itself is not shown).
  app._attachmentChipText = function(ch) {
    var names = attachmentNames(app._chatAttachments[ch]);
    return names ? '\n📎 ' + names : '';
  };

  // Full content folded into the message actually sent to the AI.
  app._foldAttachments = function(ch, userText) {
    return foldAttachments(app._chatAttachments[ch], userText);
  };

  app._clearChatAttachments = function(ch) {
    app._chatAttachments[ch] = [];
    app._renderChatAttachments(ch);
  };

  // Lightweight transient toast (reuses the #nova-toast-host / .nova-toast styles).
  app._toast = app._toast || function(msg) {
    try {
      var host = document.getElementById('nova-toast-host');
      if (!host) { host = document.createElement('div'); host.id = 'nova-toast-host'; document.body.appendChild(host); }
      var t = document.createElement('div');
      t.className = 'nova-toast';
      t.textContent = msg;
      host.appendChild(t);
      setTimeout(function() { t.classList.add('nova-toast-out'); }, 3200);
      setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3700);
    } catch (e) { /* ignore */ }
  };

  // Appends a separated "artifact" block INSIDE the streamed answer bubble (a
  // child div, so it stacks below the prose without disturbing the chat-msg flex
  // row). The artifact UI (code-ready / plan / approve) renders here so it never
  // overwrites the reasoning the user watched stream. Returns the new element.
  app._appendArtifactBubble = function(answerBubble) {
    if (!answerBubble) return null;
    var b = document.createElement('div');
    b.className = 'chat-artifact';
    answerBubble.appendChild(b);
    return b;
  };

  app._gptChat = function(ch, txt) {
    const existingCode = document.getElementById('cv-code') ? document.getElementById('cv-code').value : '';
    const msgContainer = document.getElementById(ch === 'landing' ? 'landing-chat-messages' : 'ws-chat-messages');
    const streamId = 'gpt-stream-' + Date.now();
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ai';
    msgEl.innerHTML = '<div class="chat-avatar">✦</div><div class="chat-bubble streaming" id="' + streamId + '"></div>';
    msgContainer.appendChild(msgEl);
    // Stop control — lets the user cancel an in-flight response. Lives below the
    // streaming message (so onChunk's bubble re-render can't wipe it) and is
    // removed when the stream finalizes.
    const stopRow = document.createElement('div');
    stopRow.className = 'chat-stop-row';
    stopRow.id = streamId + '-stop';
    stopRow.innerHTML = '<button class="chat-stop-pill" onclick="event.preventDefault();app.stopAiStream()">■ Stop</button>';
    msgContainer.appendChild(stopRow);
    const _removeStop = function() { var s = document.getElementById(streamId + '-stop'); if (s) s.remove(); };
    msgContainer.scrollTop = msgContainer.scrollHeight;
    const bubble = document.getElementById(streamId);

    GPTClient.callStream(
      txt, ch, existingCode,
      function(chunk, fullText) {
        if (!bubble) return;
        const display = app._extractDisplayText(fullText);
        bubble.innerHTML = app.fmt(display);
        msgContainer.scrollTop = msgContainer.scrollHeight;
      },
      function(fullText) {
        _removeStop();
        if (bubble) {
          bubble.classList.remove('streaming');
          bubble.removeAttribute('id');
        }

        // Auto-collapse the live "Thinking" block now that the answer has arrived.
        var _thinkEl = document.getElementById(streamId + '-think');
        if (_thinkEl) {
          var _tbox = _thinkEl.querySelector('.chat-thinking');
          var _thead = _thinkEl.querySelector('.chat-thinking-head');
          if (_tbox) _tbox.classList.remove('open');
          if (_thead) _thead.innerHTML = '<span class="chat-thinking-caret">▸</span> Thought process';
        }

        // P3: extract any "show" actions the AI emitted, strip the block from the
        // text (so it's never shown raw), and auto-run the read-only view ops on
        // the canvas. Defensive — action handling must never break the response.
        try {
          const act = parseNovaActions(fullText);
          fullText = act.cleanedText;
          if (act.ops.length && ch === 'workspace' && typeof app.runShowActions === 'function') {
            app.runShowActions(act.ops);
          }
        } catch { /* ignore malformed action blocks */ }

        app.chatHistories[ch].push({ role: 'ai', text: fullText });

        // Phase 11 safety net: pre-rewrite the AI's response, swapping
        // common name-bias hallucinations (Geo.createLoft → Geo.loft,
        // Geo.createQuad → Geo.Polyline3, etc.) for the canonical names
        // BEFORE the validators see it. Costs nothing if the AI got the
        // names right; rescues the response cheaply if it didn't.
        const aliasResult = rewriteGeoAliasesInResponse(fullText);
        const cleanedText = aliasResult.text;
        if (aliasResult.rewrites.length && typeof NFLogger !== 'undefined') {
          NFLogger.info('geo-alias-rewriter', 'rewrote ' + aliasResult.rewrites.length + ' Geo.* aliases', { rewrites: aliasResult.rewrites });
        }

        // Chat response architecture P1: persist the streamed answer/reasoning in
        // its own bubble, then render artifacts (plan / code-ready / approve UI)
        // into a SEPARATE appended block below it — so the thinking the user
        // watched stream is never overwritten by the result.
        const answerText = app._extractDisplayText(cleanedText);
        const finalizeAnswer = (fallback) => {
          if (bubble) bubble.innerHTML = app.fmt(answerText || fallback || '');
        };

        // Phase 7: if the AI emitted a nova-plan, route through the
        // plan-mode pipeline (validate against registry → build graph
        // mechanically).
        const planExtract = extractPlanFromResponse(cleanedText);
        if (planExtract && ch === 'workspace' && !(app._pendingNodeFix && app._pendingNodeFix.nodeId)) {
          finalizeAnswer();
          const artifact = app._appendArtifactBubble(bubble);
          app._handleNovaPlan(planExtract, cleanedText, artifact || bubble, msgContainer, ch, txt);
          msgContainer.scrollTop = msgContainer.scrollHeight;
          return;
        }

        // Python-first mode: nova-plan is still accepted above, and
        // parser-friendly Python is also a valid build response.
        const parsed = GPTClient.parseResponse(cleanedText);
        if (parsed && parsed.code && ch === 'workspace') {
          if (app._pendingNodeFix && app._pendingNodeFix.nodeId) {
            app._presentNodeFix(parsed, bubble, msgContainer, ch);
            return;
          }
          finalizeAnswer(parsed.explanation);
          const artifact = app._appendArtifactBubble(bubble);
          app._validateAndPresent(parsed, artifact || bubble, msgContainer, ch, txt);
        } else if (parsed && parsed.code && ch === 'landing') {
          const explanation = parsed.explanation || 'Here is the code.';
          if (bubble) {
            bubble.innerHTML = app.fmt('✨ ' + explanation + '\n\nOpen a **New Project** to try it out!');
          }
        } else {
          if (app._pendingNodeFix && app._pendingNodeFix.nodeId && ch === 'workspace') {
            if (bubble) {
              bubble.innerHTML = app.fmt(app._extractDisplayText(fullText) + '\n\nPlease return one fenced ```python code block so I can apply it to the selected node.');
            }
            app.showNodeFixButtons(false);
            msgContainer.scrollTop = msgContainer.scrollHeight;
            return;
          }
          const displayText = app._extractDisplayText(fullText);
          if (bubble) {
            bubble.innerHTML = app.fmt(displayText);
          }
          app._showOptionButtons(fullText, ch);
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
      },
      function(errMsg) {
        _removeStop();
        if (errMsg && errMsg.indexOf('__RATE_LIMIT_SWITCHED__') === 0) {
          const switchedTo = errMsg.replace('__RATE_LIMIT_SWITCHED__', '');
          if (bubble) {
            bubble.innerHTML = app.fmt(GPTClient.getRateLimitMessage(switchedTo) + '\n\n🔄 Retrying your request...');
          }
          msgContainer.scrollTop = msgContainer.scrollHeight;
          app._updateChatStatus();
          setTimeout(function() {
            app._gptChat(ch, txt);
          }, 500);
          return;
        }
        if (errMsg === '__RATE_LIMIT_NO_FREE__') {
          if (bubble) {
            bubble.classList.remove('streaming');
            bubble.removeAttribute('id');
            bubble.innerHTML = app.fmt(GPTClient.getRateLimitMessage(null));
          }
          msgContainer.scrollTop = msgContainer.scrollHeight;
          return;
        }
        if (errMsg === '__PROXY_RATE_LIMIT__') {
          if (bubble) {
            bubble.classList.remove('streaming');
            bubble.removeAttribute('id');
            bubble.innerHTML = app.fmt('⏳ **Free-tier limit hit.** Nova\'s shared free model is at capacity for the moment.\n\nWait a few seconds and try again, or get unlimited use with your own free key below.')
              + app._byokCardHtml();
          }
          msgContainer.scrollTop = msgContainer.scrollHeight;
          return;
        }
        if (errMsg && errMsg.indexOf('ALL_PROVIDERS_FAILED') !== -1) {
          if (bubble) {
            bubble.classList.remove('streaming');
            bubble.removeAttribute('id');
            bubble.innerHTML = app.fmt('⚠️ **Every free-tier provider is busy.** All shared models hit their limit for now.\n\nBring your own free key for unlimited access — takes 30 seconds.')
              + app._byokCardHtml();
          }
          msgContainer.scrollTop = msgContainer.scrollHeight;
          return;
        }
        if (errMsg === '__PROXY_NOT_CONFIGURED__') {
          if (bubble) {
            bubble.classList.remove('streaming');
            bubble.removeAttribute('id');
            bubble.innerHTML = app.fmt('⚙️ **Free model not available on this deployment.**\n\nThe site owner needs to set `GROQ_API_KEY` as a Cloudflare Worker secret, or you can bring your own free key below.')
              + app._byokCardHtml();
          }
          msgContainer.scrollTop = msgContainer.scrollHeight;
          return;
        }
        if (bubble) {
          bubble.classList.remove('streaming');
          bubble.removeAttribute('id');
          bubble.innerHTML = app.fmt('❌ **API Error:** ' + errMsg + '\n\nCheck your API key and provider in Settings → Preferences.')
            + app._byokCardHtml();
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
      },
      // Extended-thinking stream → a collapsible "Thinking" block above the answer,
      // so the user sees the model's reasoning as it happens (auto-collapses on done).
      function(thinkingChunk, fullThinking) {
        if (!bubble) return;
        var thinkId = streamId + '-think';
        var thinkEl = document.getElementById(thinkId);
        if (!thinkEl) {
          var msgEl = bubble.parentNode;
          thinkEl = document.createElement('div');
          thinkEl.className = 'chat-msg ai chat-thinking-msg';
          thinkEl.id = thinkId;
          thinkEl.innerHTML = '<div class="chat-avatar">✦</div><div class="chat-thinking open">'
            + '<div class="chat-thinking-head" onclick="this.parentNode.classList.toggle(\'open\')"><span class="chat-thinking-caret">▾</span> Thinking…</div>'
            + '<div class="chat-thinking-body"></div></div>';
          if (msgEl && msgEl.parentNode) msgEl.parentNode.insertBefore(thinkEl, msgEl);
        }
        var tbody = thinkEl.querySelector('.chat-thinking-body');
        if (tbody) tbody.textContent = fullThinking;
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
    );
  };

  // Inline BYOK upsell card — appended below the streaming bubble whenever
  // the free-tier proxy hits a hard cap. One-tap path to either opening
  // Nova's Settings dialog or grabbing a personal Groq key (the durable
  // answer to "free tier exhausted"). HTML inlined so it doesn't depend on
  // a separate stylesheet entry.
  // Phase 9: refusal feedback loop.
  //
  // _refusalIssueCardHtml renders the "Request this composite on GitHub"
  // button under a plan-mode refusal. _rememberRefusal and
  // _refusalAlreadyRequested manage a small localStorage log so the user
  // doesn't file the same request twice across retries.

  app._refusalIssueCardHtml = function(issue, alreadyRequested) {
    const escapedUrl = String(issue.url).replace(/[<>"]/g, function(c) {
      return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
    const button = alreadyRequested
      ? '<a href="' + escapedUrl + '" target="_blank" rel="noopener" style="flex:1;min-width:160px;padding:8px 12px;border:1px solid var(--accent-yellow,#f9e2af);border-radius:6px;background:transparent;color:var(--accent-yellow,#f9e2af);font-weight:600;font-size:12px;text-align:center;text-decoration:none">Already requested — open again ↗</a>'
      : '<a href="' + escapedUrl + '" target="_blank" rel="noopener" style="flex:1;min-width:160px;padding:8px 12px;border:none;border-radius:6px;background:var(--accent-green,#a6e3a1);color:#1e1e2e;font-weight:600;font-size:12px;text-align:center;text-decoration:none">Request this composite on GitHub ↗</a>';

    return ''
      + '<div style="margin-top:10px;padding:12px;border:1px solid var(--accent-green,#a6e3a1);border-radius:8px;background:rgba(166,227,161,0.06);display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">💡</span><strong style="color:var(--text-primary,#fff);font-size:13px">Help Nova learn this pattern</strong></div>'
      + '<div style="font-size:11px;color:var(--text-muted,#a6adc8);line-height:1.4">Your prompt is what we use to prioritise new composite nodes. Clicking the button opens a GitHub issue pre-filled with the details — you can review and edit it before submitting.</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">' + button + '</div></div>';
  };

  app._rememberRefusal = function(userPrompt, reason) {
    try {
      const key = dedupeKey(userPrompt);
      if (!key) return;
      const raw = localStorage.getItem('nova:refusal-log') || '[]';
      let log;
      try { log = JSON.parse(raw); } catch { log = []; }
      if (!Array.isArray(log)) log = [];
      const existing = log.find(function(entry) { return entry && entry.key === key; });
      if (existing) {
        existing.count = (existing.count || 1) + 1;
        existing.lastAt = new Date().toISOString();
      } else {
        log.unshift({ key: key, prompt: userPrompt, reason: reason, count: 1, firstAt: new Date().toISOString(), lastAt: new Date().toISOString() });
      }
      // Cap the log so we never pile up unbounded data in the browser.
      if (log.length > 100) log.length = 100;
      localStorage.setItem('nova:refusal-log', JSON.stringify(log));
    } catch (err) {
      // Defensive — localStorage can be disabled or full. Don't block chat.
      if (typeof NFLogger !== 'undefined') NFLogger.warn('refusal-log', 'failed to remember refusal', { error: err && err.message });
    }
  };

  app._refusalAlreadyRequested = function(userPrompt) {
    try {
      const key = dedupeKey(userPrompt);
      if (!key) return false;
      const raw = localStorage.getItem('nova:refusal-log') || '[]';
      const log = JSON.parse(raw);
      if (!Array.isArray(log)) return false;
      const entry = log.find(function(e) { return e && e.key === key; });
      return !!(entry && entry.count > 1);
    } catch {
      return false;
    }
  };

  app._byokCardHtml = function() {
    return ''
      + '<div style="margin-top:10px;padding:12px;border:1px solid var(--accent-blue,#89b4fa);border-radius:8px;background:rgba(137,180,250,0.06);display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">🔑</span><strong style="color:var(--text-primary,#fff);font-size:13px">Bring your own free key for unlimited access</strong></div>'
      + '<div style="font-size:11px;color:var(--text-muted,#a6adc8);line-height:1.4">Groq is free, no card required. Your key stays in your browser — Nova never sees it. Takes about 30 seconds.</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button onclick="(window.SettingsDialog||{}).open&&SettingsDialog.open()" style="flex:1;min-width:120px;padding:8px 12px;border:none;border-radius:6px;background:var(--accent-blue,#89b4fa);color:#1e1e2e;font-weight:600;font-size:12px;cursor:pointer">Open Settings</button>'
      + '<a href="https://console.groq.com/keys" target="_blank" rel="noopener" style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--accent-blue,#89b4fa);border-radius:6px;background:transparent;color:var(--accent-blue,#89b4fa);font-weight:600;font-size:12px;text-align:center;text-decoration:none">Get Groq key →</a>'
      + '</div></div>';
  };

  app._presentNodeFix = function(parsed, bubble, msgContainer) {
    const pending = this._pendingNodeFix;
    if (!pending || !pending.nodeId) return;
    const nd = this.nodes.find(function(n) { return n.id === pending.nodeId; });
    if (!nd) {
      this._pendingNodeFix = null;
      if (bubble) bubble.innerHTML = this.fmt('That node is no longer on the canvas.');
      return;
    }
    pending.code = parsed.code || '';
    pending.explanation = parsed.explanation || 'I prepared a replacement for this Python node.';
    if (typeof this.showCodeViewer === 'function') {
      this.showCodeViewer(nd.controlValues.code || '', nd);
      const tab = this._cvNodeTabFor ? this._cvNodeTabFor(nd.id) : null;
      if (tab) {
        tab.draft = pending.code;
        this._cvTab = tab.id;
        if (this.renderCvTabs) this.renderCvTabs();
        if (this.renderCvActiveTab) this.renderCvActiveTab();
      }
    }
    if (bubble) {
      bubble.innerHTML = this.fmt('Proposed a fix for **' + (nd.def && nd.def.name ? nd.def.name : 'Custom.Python') + '** (`' + nd.id + '`).\n\nReview the node code below, then apply it or cancel.');
    }
    this.showNodeFixButtons();
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
  };

  app.showNodeFixButtons = function(canApply) {
    const sug = document.getElementById('ws-chat-suggestions');
    if (!sug) return;
    const apply = canApply === false ? '' : '<button class="chat-suggestion-btn" style="background:rgba(166,227,161,0.15);border-color:rgba(166,227,161,0.3);color:var(--accent-green);font-weight:600" onclick="app.applyNodeFix()">Apply to node</button>';
    sug.innerHTML = apply +
      '<button class="chat-suggestion-btn" style="background:rgba(243,139,168,0.1);border-color:rgba(243,139,168,0.2);color:var(--accent-red)" onclick="app.cancelNodeFix()">Cancel</button>';
  };

  app.applyNodeFix = function() {
    const pending = this._pendingNodeFix;
    if (!pending || !pending.nodeId) return;
    const nd = this.nodes.find(function(n) { return n.id === pending.nodeId; });
    if (!nd) {
      this._pendingNodeFix = null;
      this.addAIMessage('workspace', 'That Python node is no longer on the canvas.');
      return;
    }
    const ta = document.getElementById('cv-code');
    const code = ta ? ta.value : pending.code;
    pending.code = code;
    if (typeof this.pySyncPorts === 'function') this.pySyncPorts(nd.id, code);
    else if (nd.controlValues) nd.controlValues.code = code;
    if (this.clearNodeError) this.clearNodeError(nd.id);
    nd._lastError = null;
    nd._lastRunValue = undefined;
    if (this.invalidateCompute) this.invalidateCompute();
    if (this.renderNode) {
      const el = document.getElementById(nd.id);
      if (el) el.remove();
      this.renderNode(nd);
    }
    if (this.renderWires) this.renderWires();
    const sug = document.getElementById('ws-chat-suggestions');
    if (sug) sug.innerHTML = '';
    this._pendingNodeFix = null;
    this.addAIMessage('workspace', 'Applied the AI fix to **' + (nd.def && nd.def.name ? nd.def.name : 'Custom.Python') + '**. Run the graph again to verify the output.');
  };

  app.cancelNodeFix = function() {
    const sug = document.getElementById('ws-chat-suggestions');
    if (sug) sug.innerHTML = '';
    this._pendingNodeFix = null;
    this.addAIMessage('workspace', 'Cancelled the node fix. The Python node was not changed.');
  };

  app._validateAndPresent = function(parsed, bubble, msgContainer, ch, originalPrompt) {
    const code = parsed.code;
    // Catch hallucinated Geo.* method names BEFORE running. Doesn't block
    // execution — PythonRunner will fail anyway and the fix-retry kicks in
    // — but it gives the fix prompt a head start by saying exactly which
    // calls don't exist and what the closest real methods are.
    const validation = validateGeneratedCode(code);
    if (!validation.ok && typeof NFLogger !== 'undefined') {
      NFLogger.warn('code-validator', 'Hallucinated Geo.* calls detected', {
        unknowns: validation.unknowns.map(u => u.method),
        suggestions: validation.unknowns.map(u => u.suggestions)
      });
    }
    // Phase 3: type-check argument flow. Catches the "valid method, wrong
    // input type" class of bug (Geo.combineAll fed a list of points).
    const typeCheck = validateGeneratedCodeTypes(code);
    if (!typeCheck.ok && typeof NFLogger !== 'undefined') {
      NFLogger.warn('type-validator', 'Argument type mismatches detected', {
        mismatches: typeCheck.mismatches.map(m => ({
          line: m.line, method: m.method, expected: m.expected, got: m.got
        }))
      });
    }
    const mockInputs = {};
    code.split('\n').forEach(line => {
      const m = line.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(-?[\d.]+)\s*$/);
      if (m) mockInputs[m[1]] = parseFloat(m[2]);
    });
    const testResult = PythonRunner.execute(code, mockInputs);
    // A definite argument-type mismatch (e.g. Geo.pipe fed two points, or
    // Geo.combineAll fed points) usually produces NO runtime error — the bad
    // geometry is silently dropped — so the code would otherwise sail through
    // to approval and render nothing. Treat such a mismatch as a failure that
    // warrants a fix pass, using a synthesized message when the runtime was
    // happy. The type-validator is intentionally conservative (only flags
    // definitely-wrong types), and the fix loop is capped, so this is safe.
    if (!testResult.error && typeCheck.ok) {
      if (bubble) {
        bubble.innerHTML = app.fmt('✅ **Code ready** — review it below, then **Approve** to build the graph, or **Cancel**.');
      }
      app._pendingCode = code;
      app.showCodeViewer(code, null);
      app.showApproveButtons();
      msgContainer.scrollTop = msgContainer.scrollHeight;
      return;
    }
    const errorMsg = testResult.error
      || ('Argument-type mismatch (no values rendered): ' + typeCheck.mismatches.slice(0, 3).map(formatMismatchHint).join('; '));
    console.warn('[NodeFlow] Code validation failed:', errorMsg);
    if (bubble) {
      // Surface validator findings inline so the user sees what went wrong
      // before the retry runs. Both name (Phase 2) and type (Phase 3)
      // issues are listed; they're complementary failure modes.
      let note = '🔧 Testing code... found an issue, asking AI to fix it...';
      const items = [];
      if (validation && !validation.ok) {
        for (const u of validation.unknowns.slice(0, 3)) {
          const suggest = u.suggestions && u.suggestions.length
            ? ' → did you mean **' + u.suggestions[0] + '**?'
            : '';
          items.push('• `Geo.' + u.method + '` is not a real Nova method' + suggest);
        }
      }
      if (typeCheck && !typeCheck.ok) {
        for (const m of typeCheck.mismatches.slice(0, 3)) {
          items.push('• type mismatch on line ' + m.line + ': `Geo.' + m.method + '()` arg ' + (m.paramIndex + 1) + ' got `' + m.got + '` but expected `' + m.expected + '`');
        }
      }
      if (items.length) note += '\n\n' + items.join('\n');
      bubble.innerHTML = app.fmt(note);
    }
    msgContainer.scrollTop = msgContainer.scrollHeight;
    if (!app._fixRetries) app._fixRetries = 0;
    app._fixRetries++;
    if (app._fixRetries > 2) {
      app._fixRetries = 0;
      if (bubble) {
        bubble.innerHTML = app.fmt('⚠️ **Code generated, but it may have issues** — the runtime reported: *' + errorMsg + '*\n\nYou may need to edit it manually. **Approve** to try it, or **Cancel**.');
      }
      app._pendingCode = code;
      app.showCodeViewer(code, null);
      app.showApproveButtons();
      msgContainer.scrollTop = msgContainer.scrollHeight;
      return;
    }
    // If validation flagged unknown methods, hand the AI a precise list of
    // bad calls + closest matches. Without this the retry typically loops
    // on the same hallucination because the raw runtime error
    // ("Geo.Edge is not a function") doesn't say what to use instead.
    let validatorHint = '';
    if (validation && !validation.ok) {
      const lines = validation.unknowns.map(u => {
        const suggest = u.suggestions && u.suggestions.length
          ? ' — closest real methods: ' + u.suggestions.join(', ')
          : ' — no close match; remove the call or wrap in a Custom.Python fallback with a `# fallback: <reason>` comment';
        return '  • line ' + u.line + ': `Geo.' + u.method + '` does NOT exist' + suggest;
      });
      validatorHint = '\n\nCRITICAL — your code uses Geo.* methods that do not exist in Nova:\n' + lines.join('\n') + '\nReplace each with a real method from the inventory in your system prompt, or use a Custom.Python block as a last resort.\n';
    }
    // Phase 3 hint: argument type errors. These are higher-signal than the
    // raw runtime error because they tell the AI exactly which arg of which
    // call was the wrong KIND of value.
    let typeHint = '';
    if (typeCheck && !typeCheck.ok) {
      const lines = typeCheck.mismatches.map(formatMismatchHint);
      typeHint = '\n\nTYPE MISMATCH — your code passes the wrong KIND of value to a real Geo.* method:\n  • ' + lines.join('\n  • ') + '\nFor list arguments, build the list from values of the expected element type. For scalars, derive the right shape (e.g. wrap a points list in Geo.Polyline3 / Geo.bezier before lofting).\n';
    }
    const fixPrompt = 'The code you generated has a runtime error:\n\nError: ' + errorMsg + '\n\nOriginal code:\n```python\n' + code + '\n```' + validatorHint + typeHint + '\n\nIMPORTANT CONSTRAINTS of our JavaScript-based Python runner:\n- .pop() is not available, use index access instead\n- list() constructor not available, use [] and .push()\n- Geo classes (Geo.Point3, Geo.createBox, etc.) are available\n- math module functions available: math.sin, math.cos, math.pi, math.sqrt, etc.\n- range() returns an array\n- .append() works (transpiled to .push())\n- No try/except support\n- No dictionary comprehensions\n- Keep it simple — avoid advanced Python features\n\nPlease fix the code and return ONLY the fixed version. Brief explanation first, then ```python block.';
    GPTClient.callStream(
      fixPrompt, ch, '',
      function(chunk, fullText) {
        if (bubble) {
          bubble.innerHTML = app.fmt('🔧 Fixing code... ' + app._extractDisplayText(fullText));
          msgContainer.scrollTop = msgContainer.scrollHeight;
        }
      },
      function(fullText) {
        const fixParsed = GPTClient.parseResponse(fullText);
        if (fixParsed && fixParsed.code) {
          app._validateAndPresent(fixParsed, bubble, msgContainer, ch, originalPrompt);
        } else {
          if (bubble) {
            bubble.innerHTML = app.fmt('⚠️ Unable to parse a fix from the AI response. Please try again.');
          }
        }
      },
      function(errMsg) {
        if (bubble) {
          bubble.classList.remove('streaming');
          bubble.removeAttribute('id');
          bubble.innerHTML = app.fmt('❌ **Fix failed:** ' + errMsg);
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
    );
  };

  // Strips code/JSON blocks (complete and still-streaming) and any raw
  // JSON-shaped tail. Used by the chat bubble to render only the
  // human-readable narration while a response is in flight.
  app._extractDisplayText = function(text) {
    if (!text) return '';
    let display = text;
    display = display.replace(/```(?:python|json)?[\s\S]*?```/g, '');
    display = display.replace(/```(?:python|json)?\s*\n[\s\S]*$/, '');
    display = display.replace(/\{\s*"code"\s*:[\s\S]*$/g, '');
    display = display.replace(/\n{3,}/g, '\n\n').trim();
    if (!display || display.length < 2) display = '✨ Thinking...';
    return display;
  };

  // True while a signed-in user's account-stored AI settings are still loading
  // (the in-memory cache hasn't hydrated yet). Avoids flashing "Inactive" before
  // the synced key arrives.
  app._aiHydrating = function() {
    return !!(window.app && window.app.currentUser && GPTClient._aiSettingsHydrated === false && !GPTClient.hasApiKey());
  };

  app._updateChatStatus = function() {
    const hasKey = GPTClient.hasApiKey();
    const provider = GPTClient.getProvider();
    const prov = GPTClient.PROVIDERS[provider];
    const provName = prov ? prov.name : provider;
    const enterprise = GPTClient.isEnterpriseAiEnabled && GPTClient.isEnterpriseAiEnabled();
    const hydrating = app._aiHydrating();
    document.querySelectorAll('.chat-header-text p').forEach(function(el) {
      if (hasKey) {
        el.innerHTML = '● Online — <strong>' + provName + '</strong>';
        el.style.color = 'var(--accent-green)';
      } else if (hydrating) {
        el.innerHTML = '● Connecting…';
        el.style.color = 'var(--accent-blue)';
      } else if (GPTClient.isProxyMode && GPTClient.isProxyMode()) {
        el.innerHTML = '● Free tier — <strong>Groq Llama 3.3 70B</strong>';
        el.style.color = 'var(--accent-blue)';
      } else if (enterprise) {
        el.innerHTML = '● Online — <strong>Nova Cloud</strong>';
        el.style.color = 'var(--accent-green)';
      } else {
        // BYOK-only, no key yet: the assistant is inactive (see the gate below).
        el.innerHTML = '○ Inactive — add API key';
        el.style.color = 'var(--accent-yellow)';
      }
    });
    // Toggle the input gate to match readiness.
    if (app._updateAssistantGate) app._updateAssistantGate();
  };

  // When the assistant can't take a request (BYOK-only and no key connected
  // yet), make the chat input inactive and show a short explanation + a button
  // that opens Settings. Once a key is saved, canChat() flips true and this
  // removes the gate and re-enables the input. Runs for both the landing and
  // workspace chat panels.
  app._updateAssistantGate = function() {
    const ready = GPTClient.canChat();
    const hydrating = app._aiHydrating();
    ['landing', 'workspace'].forEach(function(ch) {
      const input = document.getElementById(ch === 'landing' ? 'landing-chat-input' : 'ws-chat-input');
      if (!input) return;
      const area = (input.closest && input.closest('.chat-input-area')) || input.parentElement;
      if (!area) return;
      const sendBtn = area.querySelector('.chat-send-btn');
      const gateId = ch + '-chat-gate';
      let gate = document.getElementById(gateId);

      if (ready) {
        input.disabled = false;
        input.style.opacity = '';
        const active = input.getAttribute('data-active-placeholder');
        if (active !== null) input.placeholder = active;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = ''; sendBtn.style.cursor = ''; }
        if (gate) gate.remove();
        return;
      }

      if (hydrating) {
        // Loading the account's synced key — disable briefly without the
        // alarming "inactive" card; _updateChatStatus re-runs when hydration
        // completes and resolves to Online or the gate.
        if (input.getAttribute('data-active-placeholder') === null) {
          input.setAttribute('data-active-placeholder', input.placeholder || '');
        }
        input.disabled = true;
        input.style.opacity = '0.5';
        input.placeholder = 'Connecting to your account…';
        if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.4'; sendBtn.style.cursor = 'not-allowed'; }
        if (gate) gate.remove();
        return;
      }

      // Gated: disable the input + send button and surface the CTA.
      if (input.getAttribute('data-active-placeholder') === null) {
        input.setAttribute('data-active-placeholder', input.placeholder || '');
      }
      input.disabled = true;
      input.style.opacity = '0.5';
      input.placeholder = 'Add your API key in Settings to activate the assistant…';
      if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.4'; sendBtn.style.cursor = 'not-allowed'; }

      if (!gate) {
        gate = document.createElement('div');
        gate.id = gateId;
        gate.className = 'chat-gate';
        gate.innerHTML = ''
          + '<div style="margin:8px 12px;padding:12px;border:1px solid var(--accent-blue,#89b4fa);border-radius:8px;background:rgba(137,180,250,0.06);display:flex;flex-direction:column;gap:8px">'
          + '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">🔑</span><strong style="color:var(--text-primary,#fff);font-size:13px">Assistant inactive</strong></div>'
          + '<div style="font-size:11px;color:var(--text-muted,#a6adc8);line-height:1.45">Nova runs on your own AI key. Add one to activate the assistant — Groq and OpenRouter offer free keys, and your key stays in your browser.</div>'
          + '<button onclick="(window.SettingsDialog||{}).open&&SettingsDialog.open()" style="padding:8px 12px;border:none;border-radius:6px;background:var(--accent-blue,#89b4fa);color:#1e1e2e;font-weight:600;font-size:12px;cursor:pointer">Add API key in Settings</button>'
          + '</div>';
        // Place the CTA directly above the input row.
        area.parentNode.insertBefore(gate, area);
      }
    });
  };

  // Scans the AI reply for `[1] Option — description` patterns and renders
  // them as inline clickable cards below the chat bubble. No-op when the
  // reply has fewer than two such items.
  app._renderOptionGroup = function(group, ch) {
    var msgContainer = document.getElementById(ch === 'landing' ? 'landing-chat-messages' : 'ws-chat-messages');
    if (!msgContainer || !group || !group.options || group.options.length < 2) return;

    var cardEl = document.createElement('div');
    cardEl.className = 'chat-msg ai';
    cardEl.innerHTML = '<div class="chat-avatar">&#10022;</div><div class="chat-bubble" style="padding:6px 0"></div>';

    var bubble = cardEl.querySelector('.chat-bubble');
    var title = document.createElement('div');
    title.style.cssText = 'font-size:10px;font-weight:700;color:var(--accent-blue);text-transform:uppercase;letter-spacing:0.5px;padding:6px 12px 4px;opacity:0.8';
    title.textContent = group.title || 'Options';
    bubble.appendChild(title);

    group.options.forEach(function(opt) {
      bubble.appendChild(app._createOptionCard(ch, buildOptionReply(group.title, opt), opt.num, opt.label, opt.desc));
    });

    var hasBuiltInAction = group.options.some(function(opt) {
      var label = String(opt.label || '').toLowerCase();
      return label.indexOf('decide yourself') !== -1 || label === 'other';
    });
    if (!hasBuiltInAction) {
      var actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px 10px;border-top:1px solid var(--border-color)';
      actionRow.appendChild(app._createOptionAction(ch, buildDecideYourselfReply(group.title), 'Decide yourself'));
      actionRow.appendChild(app._createOptionAction(ch, buildOtherReply(group.title), 'Other'));
      bubble.appendChild(actionRow);
    }

    msgContainer.appendChild(cardEl);
    msgContainer.scrollTop = msgContainer.scrollHeight;
  };

  app._createOptionCard = function(ch, reply, num, label, desc) {
    var btn = document.createElement('button');
    btn.className = 'nf-option-card';
    btn.style.cssText = 'display:flex;align-items:flex-start;gap:8px;width:100%;padding:7px 12px;border:none;background:transparent;cursor:pointer;text-align:left;border-radius:0;transition:background 0.15s';
    btn.onmouseover = function() { btn.style.background = 'rgba(137,180,250,0.08)'; };
    btn.onmouseout = function() { btn.style.background = 'transparent'; };
    btn.onclick = function() { app._selectOption(ch, reply); };

    var badge = document.createElement('span');
    badge.style.cssText = 'min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(137,180,250,0.12);color:var(--accent-blue);font-size:11px;font-weight:700';
    badge.textContent = num;
    btn.appendChild(badge);

    var copy = document.createElement('div');
    copy.style.cssText = 'flex:1;min-width:0';
    var labelEl = document.createElement('div');
    labelEl.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-primary)';
    labelEl.textContent = label;
    copy.appendChild(labelEl);

    if (desc) {
      var descEl = document.createElement('div');
      descEl.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:1px';
      descEl.textContent = desc;
      copy.appendChild(descEl);
    }

    btn.appendChild(copy);
    return btn;
  };

  app._createOptionAction = function(ch, reply, label) {
    var btn = document.createElement('button');
    btn.className = 'nf-option-card nf-option-action';
    btn.style.cssText = 'flex:1;min-width:118px;padding:7px 10px;border:1px solid rgba(137,180,250,0.24);background:rgba(137,180,250,0.08);color:var(--accent-blue);border-radius:6px;font-size:11px;font-weight:700;cursor:pointer';
    btn.textContent = label;
    btn.onclick = function() { app._selectOption(ch, reply); };
    return btn;
  };

  app._showOptionButtons = function(fullText, ch) {
    if (!fullText) return;
    var firstGroup = firstOptionGroup(fullText);
    if (!firstGroup) return;
    app._renderOptionGroup(firstGroup, ch);
    return;
  };

  app._selectOption = function(ch, reply) {
    document.querySelectorAll('.nf-option-card').forEach(function(btn) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'default';
      btn.onmouseover = null;
      btn.onmouseout = null;
    });
    var inp = document.getElementById(ch === 'landing' ? 'landing-chat-input' : 'ws-chat-input');
    if (inp) {
      inp.value = reply;
      app.sendChat(ch);
    }
  };

  // ──────────────────────────────────────────────────────────────────
  // Phase 7: nova-plan handler. Validates a plan emitted by the AI, builds
  // the graph mechanically, and surfaces validation failures back to the
  // AI as a smart fix-retry. The plan path is gated by extractPlanFromResponse
  // upstream — this function only runs when a fenced ```nova-plan block
  // was found in the response.
  app._handleNovaPlan = function(planExtract, fullText, bubble, msgContainer, ch, originalPrompt) {
    const intro = planExtract.narrationBefore || 'Here is the plan.';

    // 1) JSON parse failure
    if (planExtract.parseError || !planExtract.plan) {
      if (bubble) {
        bubble.innerHTML = app.fmt('⚠️ The AI emitted a `nova-plan` block but it isn\'t valid JSON.\n\n```\n' + (planExtract.parseError || 'unknown parse error') + '\n```\n\nAsking it to fix...');
      }
      app._novaPlanFixRetry(planExtract.raw, 'JSON parse error: ' + (planExtract.parseError || 'malformed'), bubble, msgContainer, ch, originalPrompt);
      return;
    }

    const plan = planExtract.plan;

    // 2) Refusal — AI says it can't build with available nodes.
    const shape = validatePlanShape(plan);
    if (shape.refused) {
      const reason = (plan.refused && plan.refused.reason) || 'No reason given';
      const suggestions = (plan.refused && Array.isArray(plan.refused.suggestions)) ? plan.refused.suggestions : [];
      let html = '🛑 **I can\'t build this with Nova\'s current nodes.**\n\n**Reason:** ' + reason;
      if (suggestions.length) {
        html += '\n\n**Try one of these alternatives:**\n' + suggestions.map(function(s) { return '• ' + s; }).join('\n');
      }
      // Phase 9: turn every refusal into actionable feedback. Pre-fills a
      // GitHub issue with the prompt + reason + suggested composite shape
      // so the missing capability flows directly into the backlog. Local
      // dedup avoids the user filing the same refusal twice if they retry.
      const issue = buildCompositeRequestIssue({
        userPrompt: originalPrompt,
        refusalReason: reason,
        suggestions: suggestions,
        context: {
          novaVersion: (typeof window !== 'undefined' && window.NOVA_VERSION) || null,
          aiProvider: (typeof GPTClient !== 'undefined' && GPTClient.getProvider) ? GPTClient.getProvider() : null,
          aiModel: (typeof GPTClient !== 'undefined' && GPTClient.getEffectiveModel) ? GPTClient.getEffectiveModel() : null,
          timestamp: new Date().toISOString()
        }
      });
      app._rememberRefusal(originalPrompt, reason);
      const alreadyRequested = app._refusalAlreadyRequested(originalPrompt);
      if (bubble) bubble.innerHTML = app.fmt(html) + app._refusalIssueCardHtml(issue, alreadyRequested);
      return;
    }

    // 3) Shape validation
    if (!shape.ok) {
      if (bubble) {
        bubble.innerHTML = app.fmt('⚠️ The plan has structural issues:\n\n' + shape.issues.map(function(i) { return '• ' + i; }).join('\n') + '\n\nAsking the AI to fix...');
      }
      app._novaPlanFixRetry(JSON.stringify(plan, null, 2), shape.issues.join('\n'), bubble, msgContainer, ch, originalPrompt);
      return;
    }

    // 4) Registry validation
    const reg = validatePlanAgainstRegistry(plan);
    if (!reg.ok) {
      if (bubble) {
        bubble.innerHTML = app.fmt('⚠️ The plan references things that aren\'t real:\n\n' + reg.issues.map(function(i) { return '• ' + i; }).join('\n') + '\n\nAsking the AI to fix...');
      }
      app._novaPlanFixRetry(JSON.stringify(plan, null, 2), reg.issues.join('\n'), bubble, msgContainer, ch, originalPrompt);
      return;
    }

    // 5) Build the graph and present for approval
    const graph = buildGraphFromPlan(plan);
    const canonicalPy = planToPython(plan);
    app._pendingPlanGraph = { plan, graph, canonicalPy };
    if (typeof app.showCodeViewer === 'function') app.showCodeViewer(canonicalPy, null);
    if (bubble) {
      bubble.innerHTML = app.fmt('✨ ' + intro + '\n\nReady to build: **' + graph.nodes.length + ' nodes**, **' + graph.wires.length + ' wires**. Click **Approve** to drop them on the canvas.');
    }
    if (typeof app.showApproveButtons === 'function') app.showApproveButtons();
  };

  app._novaPlanFixRetry = function(originalPlanText, issuesText, bubble, msgContainer, ch, originalPrompt) {
    if (!app._planFixRetries) app._planFixRetries = 0;
    app._planFixRetries++;
    if (app._planFixRetries > 2) {
      app._planFixRetries = 0;
      if (bubble) {
        bubble.innerHTML = app.fmt('⚠️ Couldn\'t produce a valid plan after retries. You can try rephrasing the request.');
      }
      return;
    }
    const fixPrompt = 'The nova-plan you just emitted is invalid:\n\n' + issuesText + '\n\nOriginal plan:\n```\n' + originalPlanText + '\n```\n\nRe-emit ONLY the corrected plan in a ```nova-plan fenced block. No explanation, no other text.';
    GPTClient.callStream(
      fixPrompt, ch, '',
      function() {},
      function(fullText) {
        const planExtract = extractPlanFromResponse(fullText);
        if (planExtract) {
          app._handleNovaPlan(planExtract, fullText, bubble, msgContainer, ch, originalPrompt);
        } else if (bubble) {
          bubble.innerHTML = app.fmt('⚠️ AI retry did not include a nova-plan block. Try rephrasing.');
        }
      },
      function(errMsg) {
        if (bubble) bubble.innerHTML = app.fmt('❌ Plan fix failed: ' + errMsg);
      }
    );
  };

  app._updateChatStatus();
});
