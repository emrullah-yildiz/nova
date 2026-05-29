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
});
