import { GPTClient } from './gpt-client.js';

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

    if (l.includes('add') && (l.includes('node') || l.includes('number') || l.includes('point') || l.includes('watch'))) {
      let t = 'number-input';
      if (l.includes('point')) t = 'geo-point';
      else if (l.includes('watch')) t = 'output-watch';
      else if (l.includes('text') || l.includes('string')) t = 'text-input';
      else if (l.includes('slider')) t = 'slider-input';
      const nd = this.addNodeFromLib(t);
      if (nd) this.addAIMessage('workspace', '✅ Added **' + nd.def.name + '** to canvas!');
      return;
    }
    if (l.includes('delete') || l.includes('remove')) {
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

  app._gptChat = function(ch, txt) {
    const existingCode = document.getElementById('cv-code') ? document.getElementById('cv-code').value : '';
    const msgContainer = document.getElementById(ch === 'landing' ? 'landing-chat-messages' : 'ws-chat-messages');
    const streamId = 'gpt-stream-' + Date.now();
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ai';
    msgEl.innerHTML = '<div class="chat-avatar">✦</div><div class="chat-bubble streaming" id="' + streamId + '"></div>';
    msgContainer.appendChild(msgEl);
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
        if (bubble) {
          bubble.classList.remove('streaming');
          bubble.removeAttribute('id');
        }
        app.chatHistories[ch].push({ role: 'ai', text: fullText });
        const parsed = GPTClient.parseResponse(fullText);
        if (parsed && parsed.code && ch === 'workspace') {
          app._validateAndPresent(parsed, bubble, msgContainer, ch, txt);
        } else if (parsed && parsed.code && ch === 'landing') {
          const explanation = parsed.explanation || 'Here is the code.';
          if (bubble) {
            bubble.innerHTML = app.fmt('✨ ' + explanation + '\n\nOpen a **New Project** to try it out!');
          }
        } else {
          const displayText = app._extractDisplayText(fullText);
          if (bubble) {
            bubble.innerHTML = app.fmt(displayText);
          }
          app._showOptionButtons(fullText, ch);
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
      },
      function(errMsg) {
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
            bubble.innerHTML = app.fmt('⏳ **Free-tier limit hit.** Nova\'s shared free model is at capacity for the moment.\n\n• **Wait a few seconds and try again** — the limit resets quickly.\n• Or bring your own free **Groq** key in **Settings → Preferences** for unlimited use → [console.groq.com/keys](https://console.groq.com/keys)');
          }
          msgContainer.scrollTop = msgContainer.scrollHeight;
          return;
        }
        if (errMsg === '__PROXY_NOT_CONFIGURED__') {
          if (bubble) {
            bubble.classList.remove('streaming');
            bubble.removeAttribute('id');
            bubble.innerHTML = app.fmt('⚙️ **Free model not available on this deployment.**\n\nThe site owner needs to set `GROQ_API_KEY` or `NOVA_GROQ_API_KEY` in Vercel environment variables, or you can bring your own free API key in **Settings → Preferences** (Groq is free, no card needed).');
          }
          msgContainer.scrollTop = msgContainer.scrollHeight;
          return;
        }
        if (bubble) {
          bubble.classList.remove('streaming');
          bubble.removeAttribute('id');
          bubble.innerHTML = app.fmt('❌ **API Error:** ' + errMsg + '\n\nCheck your API key and provider in Settings → Preferences.\n\n💡 Try switching to **Groq** or **OpenRouter** for free models.');
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
    );
  };

  app._validateAndPresent = function(parsed, bubble, msgContainer, ch, originalPrompt) {
    const code = parsed.code;
    const explanation = parsed.explanation || 'Generated code for your request.';
    const mockInputs = {};
    code.split('\n').forEach(line => {
      const m = line.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(-?[\d.]+)\s*$/);
      if (m) mockInputs[m[1]] = parseFloat(m[2]);
    });
    const testResult = PythonRunner.execute(code, mockInputs);
    if (!testResult.error) {
      if (bubble) {
        bubble.innerHTML = app.fmt('✨ ' + explanation + '\n\nReview the code below. **Approve** to build the visual graph, or **Cancel**.');
      }
      app._pendingCode = code;
      app.showCodeViewer(code, null);
      app.showApproveButtons();
      msgContainer.scrollTop = msgContainer.scrollHeight;
      return;
    }
    const errorMsg = testResult.error;
    console.warn('[NodeFlow] Code validation failed:', errorMsg);
    if (bubble) {
      bubble.innerHTML = app.fmt('🔧 Testing code... found an issue, asking AI to fix it...');
    }
    msgContainer.scrollTop = msgContainer.scrollHeight;
    if (!app._fixRetries) app._fixRetries = 0;
    app._fixRetries++;
    if (app._fixRetries > 2) {
      app._fixRetries = 0;
      if (bubble) {
        bubble.innerHTML = app.fmt('⚠️ ' + explanation + '\n\n**Note:** The code may have issues — the runtime reported: *' + errorMsg + '*\n\nYou may need to edit it manually. **Approve** to try it, or **Cancel**.');
      }
      app._pendingCode = code;
      app.showCodeViewer(code, null);
      app.showApproveButtons();
      msgContainer.scrollTop = msgContainer.scrollHeight;
      return;
    }
    const fixPrompt = 'The code you generated has a runtime error:\n\nError: ' + errorMsg + '\n\nOriginal code:\n```python\n' + code + '\n```\n\nIMPORTANT CONSTRAINTS of our JavaScript-based Python runner:\n- .pop() is not available, use index access instead\n- list() constructor not available, use [] and .push()\n- Geo classes (Geo.Point3, Geo.createBox, etc.) are available\n- math module functions available: math.sin, math.cos, math.pi, math.sqrt, etc.\n- range() returns an array\n- .append() works (transpiled to .push())\n- No try/except support\n- No dictionary comprehensions\n- Keep it simple — avoid advanced Python features\n\nPlease fix the code and return ONLY the fixed version. Brief explanation first, then ```python block.';
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

  app._updateChatStatus = function() {
    const hasKey = GPTClient.hasApiKey();
    const provider = GPTClient.getProvider();
    const prov = GPTClient.PROVIDERS[provider];
    const provName = prov ? prov.name : provider;
    document.querySelectorAll('.chat-header-text p').forEach(function(el) {
      if (hasKey) {
        el.innerHTML = '● Online — <strong>' + provName + '</strong>';
        el.style.color = 'var(--accent-green)';
      } else if (GPTClient.isProxyMode && GPTClient.isProxyMode()) {
        el.innerHTML = '● Free tier — <strong>Groq Llama 3.3 70B</strong>';
        el.style.color = 'var(--accent-blue)';
      } else {
        el.innerHTML = '● Local AI only';
        el.style.color = 'var(--accent-yellow)';
      }
    });
  };

  // Scans the AI reply for `[1] Option — description` patterns and renders
  // them as inline clickable cards below the chat bubble. No-op when the
  // reply has fewer than two such items.
  app._showOptionButtons = function(fullText, ch) {
    if (!fullText) return;
    var options = [];
    var lines = fullText.split('\n');
    var currentGroup = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var groupMatch = line.match(/^\*\*([^*]+)\*\*\s*:?\s*$/);
      if (groupMatch) { currentGroup = groupMatch[1].trim(); continue; }
      var m = line.match(/^\[(\d)\]\s*\*?\*?([^—–\n]+?)(?:\*?\*?)(?:\s*[—–-]\s*(.+))?$/);
      if (m && m[2]) {
        var label = m[2].replace(/\*\*/g, '').trim();
        var desc = m[3] ? m[3].trim() : '';
        if (label.length >= 2 && label.length < 100) {
          options.push({ num: m[1], label: label, desc: desc, group: currentGroup });
        }
      }
    }
    if (options.length < 2) return;

    var msgContainer = document.getElementById(ch === 'landing' ? 'landing-chat-messages' : 'ws-chat-messages');
    if (!msgContainer) return;

    var cardEl = document.createElement('div');
    cardEl.className = 'chat-msg ai';
    var cardHtml = '<div class="chat-avatar">✦</div><div class="chat-bubble" style="padding:6px 0">';

    var groups = {};
    var groupOrder = [];
    options.forEach(function(opt) {
      var g = opt.group || 'Options';
      if (!groups[g]) { groups[g] = []; groupOrder.push(g); }
      groups[g].push(opt);
    });

    groupOrder.forEach(function(gName) {
      cardHtml += '<div style="font-size:10px;font-weight:700;color:var(--accent-blue);text-transform:uppercase;letter-spacing:0.5px;padding:6px 12px 4px;opacity:0.8">' + gName + '</div>';
      groups[gName].forEach(function(opt) {
        var safeReply = (gName + ': ' + opt.num + '. ' + opt.label).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        cardHtml += '<button class="nf-option-card" onclick="app._selectOption(\'' + ch + '\',\'' + safeReply + '\')" style="display:flex;align-items:flex-start;gap:8px;width:100%;padding:7px 12px;border:none;background:transparent;cursor:pointer;text-align:left;border-radius:0;transition:background 0.15s"'
          + ' onmouseover="this.style.background=\'rgba(137,180,250,0.08)\'" onmouseout="this.style.background=\'transparent\'">';
        cardHtml += '<span style="min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(137,180,250,0.12);color:var(--accent-blue);font-size:11px;font-weight:700">' + opt.num + '</span>';
        cardHtml += '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:var(--text-primary)">' + opt.label + '</div>';
        if (opt.desc) cardHtml += '<div style="font-size:11px;color:var(--text-muted);margin-top:1px">' + opt.desc + '</div>';
        cardHtml += '</div></button>';
      });
    });

    cardHtml += '</div>';
    cardEl.innerHTML = cardHtml;
    msgContainer.appendChild(cardEl);
    msgContainer.scrollTop = msgContainer.scrollHeight;
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

  app._updateChatStatus();
});
