// ============================================
// Nova — Operation Logger
// Captures all operations, errors, AI interactions,
// and graph events for debugging
// ============================================

export const NFLogger = {
  logs: [],
  MAX_LOGS: 5000,
  startTime: Date.now(),

  // Log levels
  LEVEL: { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', AI: 'AI', GRAPH: 'GRAPH', CODE: 'CODE', USER: 'USER' },

  // ── Core logging ──
  log(level, category, message, data) {
    const entry = {
      ts: Date.now() - this.startTime,
      time: new Date().toISOString(),
      level: level,
      cat: category,
      msg: message,
      data: data || null
    };
    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) this.logs.shift();

    // Also mirror to browser console with color
    const colors = {
      INFO: 'color:#89b4fa', WARN: 'color:#f9e2af', ERROR: 'color:#f38ba8',
      AI: 'color:#cba6f7', GRAPH: 'color:#a6e3a1', CODE: 'color:#fab387', USER: 'color:#94e2d5'
    };
    console.log('%c[NF:' + level + ':' + category + '] ' + message, colors[level] || 'color:#cdd6f4',
      data ? data : '');
  },

  info(cat, msg, data) { this.log(this.LEVEL.INFO, cat, msg, data); },
  warn(cat, msg, data) { this.log(this.LEVEL.WARN, cat, msg, data); },
  error(cat, msg, data) { this.log(this.LEVEL.ERROR, cat, msg, data); },

  // ── Specialized loggers ──
  aiRequest(prompt, provider, model) {
    this.log(this.LEVEL.AI, 'request', 'AI prompt sent', { prompt: prompt, provider: provider, model: model });
  },
  aiResponse(response, duration) {
    this.log(this.LEVEL.AI, 'response', 'AI response received (' + duration + 'ms)', {
      response_length: response ? response.length : 0,
      response_preview: response ? response.substring(0, 500) : null,
      duration_ms: duration
    });
  },
  aiError(error, provider) {
    this.log(this.LEVEL.ERROR, 'ai', 'AI call failed', { error: String(error), provider: provider });
  },
  aiParsed(parsed) {
    this.log(this.LEVEL.AI, 'parsed', 'AI response parsed', {
      has_code: parsed && parsed.code ? true : false,
      code_length: parsed && parsed.code ? parsed.code.length : 0,
      code_preview: parsed && parsed.code ? parsed.code.substring(0, 300) : null,
      explanation: parsed && parsed.explanation ? parsed.explanation.substring(0, 200) : null
    });
  },
  aiLocalGen(prompt, result) {
    this.log(this.LEVEL.AI, 'local-gen', 'Local AI engine generated code', {
      prompt: prompt,
      action: result ? result.action : null,
      code_length: result && result.code ? result.code.length : 0,
      code_preview: result && result.code ? result.code.substring(0, 300) : null,
      explanation: result && result.explanation ? result.explanation.substring(0, 200) : null
    });
  },

  graphNodeAdded(nodeType, nodeId) {
    this.log(this.LEVEL.GRAPH, 'node-add', 'Node added: ' + nodeType, { type: nodeType, id: nodeId });
  },
  graphNodeRemoved(nodeId) {
    this.log(this.LEVEL.GRAPH, 'node-remove', 'Node removed: ' + nodeId, { id: nodeId });
  },
  graphWireAdded(from, to) {
    this.log(this.LEVEL.GRAPH, 'wire-add', 'Wire connected', { from: from, to: to });
  },
  graphParsed(nodeCount, wireCount, nodeTypes) {
    this.log(this.LEVEL.GRAPH, 'parse', 'Code parsed to graph', {
      nodes: nodeCount, wires: wireCount, types: nodeTypes
    });
  },
  graphParseError(error, code) {
    this.log(this.LEVEL.ERROR, 'parse', 'Code parse failed', {
      error: String(error), code_preview: code ? code.substring(0, 300) : null
    });
  },

  codeGenerated(lang, nodeCount, codeLength) {
    this.log(this.LEVEL.CODE, 'gen', 'Code generated from graph', {
      lang: lang, nodes: nodeCount, length: codeLength
    });
  },
  codeApproved(code) {
    this.log(this.LEVEL.CODE, 'approve', 'User approved code', {
      code_length: code ? code.length : 0,
      code_preview: code ? code.substring(0, 300) : null
    });
  },
  codeCancelled() {
    this.log(this.LEVEL.CODE, 'cancel', 'User cancelled code', null);
  },

  userAction(action, details) {
    this.log(this.LEVEL.USER, 'action', action, details);
  },

  geoError(operation, error) {
    this.log(this.LEVEL.ERROR, 'geometry', 'Geometry operation failed: ' + operation, { error: String(error) });
  },

  pyrunnerError(error, code) {
    this.log(this.LEVEL.ERROR, 'pyrunner', 'Python runner error', {
      error: String(error), code_preview: code ? code.substring(0, 300) : null
    });
  },

  pyrunnerResult(result, code) {
    this.log(this.LEVEL.CODE, 'pyrunner', 'Python runner executed', {
      result_type: typeof result,
      result_preview: result ? String(result).substring(0, 200) : null,
      code_preview: code ? code.substring(0, 200) : null
    });
  },

  // ── Export for Step 2 ──
  getLogsJSON() {
    // Capture workspace state
    var workspace = null;
    if (typeof app !== 'undefined' && app.nodes) {
      var nodeIdSet = {};
      app.nodes.forEach(function(n) { nodeIdSet[n.id] = true; });
      var orphanWires = app.wires.filter(function(w) { return !nodeIdSet[w.fromNode] || !nodeIdSet[w.toNode]; });

      workspace = {
        nodeCount: app.nodes.length,
        wireCount: app.wires.length,
        orphanWireCount: orphanWires.length,
        nodes: app.nodes.map(function(n) {
          return { id: n.id, type: n.type, name: n.def ? n.def.name : n.type, x: Math.round(n.x), y: Math.round(n.y), controls: n.controlValues || {} };
        }),
        wires: app.wires.map(function(w) {
          var fromNd = app.nodes.find(function(n) { return n.id === w.fromNode; });
          var toNd = app.nodes.find(function(n) { return n.id === w.toNode; });
          return {
            from: w.fromNode + ':' + w.fromPort,
            to: w.toNode + ':' + w.toPort,
            fromName: fromNd ? (fromNd.def ? fromNd.def.name : fromNd.type) : '???MISSING',
            toName: toNd ? (toNd.def ? toNd.def.name : toNd.type) : '???MISSING'
          };
        }),
        orphanWires: orphanWires.map(function(w) {
          return { from: w.fromNode + ':' + w.fromPort, to: w.toNode + ':' + w.toPort };
        })
      };
    }

    return JSON.stringify({
      session_duration_ms: Date.now() - this.startTime,
      total_entries: this.logs.length,
      summary: this.getSummary(),
      workspace: workspace,
      logs: this.logs
    }, null, 2);
  },

  getSummary() {
    var counts = {};
    var errors = [];
    var aiCalls = [];
    for (var i = 0; i < this.logs.length; i++) {
      var e = this.logs[i];
      var key = e.level + ':' + e.cat;
      counts[key] = (counts[key] || 0) + 1;
      if (e.level === 'ERROR') errors.push(e);
      if (e.level === 'AI') aiCalls.push(e);
    }
    return {
      counts: counts,
      error_count: errors.length,
      ai_call_count: aiCalls.length,
      errors: errors.slice(-20),
      ai_interactions: aiCalls.slice(-30)
    };
  },

  // ── Auto-save to localStorage ──
  autoSave() {
    try {
      var logData = this.getLogsJSON();
      localStorage.setItem('nodeflow_session_logs', logData);
      window.__NODEFLOW_LOGS__ = logData;
    } catch(e) {
      // localStorage might be full or unavailable
    }
  },

  // ── Download logs as JSON file (with canvas screenshot) ──
  downloadLogs() {
    var self = this;
    
    // Try to capture canvas screenshot
    var canvasArea = document.getElementById('canvas-area');
    if (canvasArea && typeof html2canvas !== 'undefined') {
      html2canvas(canvasArea, { backgroundColor: '#1e1e2e', scale: 0.5, logging: false }).then(function(canvas) {
        self._canvasScreenshot = canvas.toDataURL('image/png');
        self._doDownload();
      }).catch(function() {
        self._canvasScreenshot = null;
        self._doDownload();
      });
    } else {
      this._canvasScreenshot = null;
      this._doDownload();
    }
  },
  
  _doDownload() {
    // Inject screenshot into log data
    var logObj = JSON.parse(this.getLogsJSON());
    if (this._canvasScreenshot) {
      logObj.canvasScreenshot = this._canvasScreenshot;
    }
    var logData = JSON.stringify(logObj, null, 2);
    
    var blob = new Blob([logData], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'nodeflow-session-logs.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.info('system', 'Logs downloaded', { size: logData.length, hasScreenshot: !!this._canvasScreenshot });
  },

  // ── Copy logs to clipboard ──
  copyLogs() {
    var logData = this.getLogsJSON();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(logData).then(function() {
        console.log('[NF] Logs copied to clipboard (' + logData.length + ' chars)');
      });
    } else {
      // Fallback
      var ta = document.createElement('textarea');
      ta.value = logData;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    return logData;
  },

  // ── Write logs to file in temp dir (via ActiveXObject if available) ──
  writeLogsToFile() {
    var logData = this.getLogsJSON();
    // Try writing via ActiveXObject (IE/Edge legacy mode)
    try {
      if (typeof ActiveXObject !== 'undefined') {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var currentPath = window.location.pathname.replace(/\//g, '\\').replace(/\\[^\\]+$/, '');
        if (currentPath.charAt(0) === '\\') currentPath = currentPath.substring(1);
        var logPath = currentPath + '\\nf-session-logs.json';
        var file = fso.CreateTextFile(logPath, true);
        file.Write(logData);
        file.Close();
        this.info('system', 'Logs written to file', { path: logPath });
        return true;
      }
    } catch(e) { /* ActiveXObject not available */ }
    
    // Fallback: try writing via fetch to file:// (usually blocked)
    try {
      // Placeholder for environments that may allow file writes.
      // This won't work in most browsers but worth trying
    } catch(e) { /* ignore */ }
    
    return false;
  },

  // ── Window message to OkPy ──
  sendLogsToParent() {
    this.autoSave();
    this.writeLogsToFile();
    window.__NODEFLOW_LOGS__ = this.getLogsJSON();
  },

  // ── Intercept console.error ──
  interceptConsole() {
    var self = this;
    var origError = console.error;
    console.error = function() {
      var args = Array.prototype.slice.call(arguments);
      var msg = args.map(function(a) { return String(a); }).join(' ');
      self.log(self.LEVEL.ERROR, 'console', msg, null);
      origError.apply(console, arguments);
    };

    // Catch unhandled errors
    window.addEventListener('error', function(e) {
      self.log(self.LEVEL.ERROR, 'unhandled', e.message || 'Unknown error', {
        filename: e.filename, lineno: e.lineno, colno: e.colno
      });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', function(e) {
      self.log(self.LEVEL.ERROR, 'promise', String(e.reason), null);
    });

    // Send logs before page unload
    window.addEventListener('beforeunload', function() {
      self.sendLogsToParent();
    });

    // Auto-save every 5 seconds
    setInterval(function() { self.autoSave(); }, 5000);
  },

  // ── Initialize ──
  init() {
    this.startTime = Date.now();
    this.logs = [];
    this.interceptConsole();
    // Load html2canvas for screenshot capture
    if (typeof html2canvas === 'undefined') {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(script);
    }
    this.info('system', 'NF Logger initialized', { userAgent: navigator.userAgent });
  }
};

if (typeof window !== 'undefined') {
  window.NFLogger = NFLogger;
  NFLogger.init();
}
