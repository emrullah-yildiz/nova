// ============================================

// NODEFLOW AI — Engine v1

// Single source of truth for:

// - Compute pipeline (node value calculation)

// - 3D rendering (code → Geo → Three.js)

// - Run pipeline (Run button → code → 3D → inspectors)

// - View switching (2D ↔ 3D, isolated zoom)

// - Wire rendering (animation only after Run)

// - Data Inspector refresh

//

// REPLACES: geo-viewer-patch.js, code-renderer.js, list-node-patch.js

// ============================================



import { createLacingFrames, hasListInput, mapLacingFrames } from './lacing.js';
import { hostRegistry } from '../hosts/HostRegistry.js';

/* eslint-disable no-redeclare, no-inner-declarations, no-empty, no-unused-vars */

function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

function getHostAdapter(hostId) {
  var runtimeGlobal = typeof globalThis !== 'undefined' ? globalThis : {};
  var registry = runtimeGlobal.HostRegistry || (runtimeGlobal.NodeFlow && runtimeGlobal.NodeFlow.hostRegistry) || hostRegistry;
  return registry.require(hostId || registry.activeHostId || 'revit');
}

export function installEngine(targetApp = getRuntimeApp()) {
  if (!targetApp) return false;
  const app = targetApp;



  // ═══════════════════════════════════════

  // COMPUTE CACHE

  // Prevents exponential re-evaluation in deep graphs

  // ═══════════════════════════════════════



  function executeBinaryLacedMath(nd, a, b, operation) {
    if (a === undefined || b === undefined) return undefined;

    var inputDefinitions = [{ id: 'a' }, { id: 'b' }];
    var inputs = { a: a, b: b };
    var mode = nd.controlValues && nd.controlValues._lacingMode
      ? nd.controlValues._lacingMode
      : (nd.def && nd.def.lacing && nd.def.lacing.mode) || 'shortest';

    if (mode === 'none' || !hasListInput(inputDefinitions, inputs)) {
      return operation(a, b);
    }

    return mapLacingFrames(createLacingFrames(inputDefinitions, inputs, mode), function(frame) {
      return operation(frame.a, frame.b);
    });
  }

  var CACHE_UNDEFINED = Symbol('CACHE_UNDEFINED');

  var CACHE_COMPUTING = Symbol('CACHE_COMPUTING');



  app._computeCache = null;

  app._computeDepth = 0;
  var isVitestRuntime = typeof process !== 'undefined' && process.env && process.env.VITEST;
  app._manualRunMode = typeof document !== 'undefined' && !isVitestRuntime;
  app._hasRun = false;
  app._isRunningGraph = false;
  app._lastRunVersion = 0;
  app._debugHostLogs = [];

  app._manualNoDataHTML = function() {
    return '<span style="color:var(--text-muted)">Run to inspect data</span>';
  };

  app._escapeHTML = function(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  app.createErrorValue = function(error, nodeId) {
    return {
      type: 'ErrorValue',
      nodeId: nodeId || '',
      message: error && error.message ? error.message : String(error || 'Unknown error'),
      stack: error && error.stack ? error.stack : ''
    };
  };

  app._recordHostRequest = function(entry) {
    var log = Object.assign({ at: new Date().toISOString() }, entry || {});
    this._debugHostLogs.push(log);
    if (this._debugHostLogs.length > 200) this._debugHostLogs.shift();
    return log;
  };

  app._recordNodeTiming = function(nd, durationMs, cacheStatus) {
    if (!nd) return;
    nd._debug = Object.assign({}, nd._debug || {}, {
      timingMs: durationMs,
      cache: cacheStatus || (nd._debug && nd._debug.cache) || 'computed',
      lastRunVersion: this._lastRunVersion || 0
    });
  };

  app.getLastRunNodeValue = function(nd, portId) {
    if (!nd || !this._hasRun) return undefined;
    if (portId && nd._lastRunPortValues && nd._lastRunPortValues[portId] !== undefined) {
      return nd._lastRunPortValues[portId];
    }
    return nd._lastRunValue;
  };

  app._commitRunSnapshot = function() {
    this._hasRun = true;
    this._lastRunVersion = (this._lastRunVersion || 0) + 1;
    this.nodes.forEach(function(nd) {
      nd._lastRunValue = nd._lastComputedValue;
      if (nd._portValues) {
        nd._lastRunPortValues = Object.assign({}, nd._portValues);
      } else if (!nd._lastRunPortValues) {
        nd._lastRunPortValues = undefined;
      }
      if (nd._pyResults) {
        nd._lastRunPyResults = Object.assign({}, nd._pyResults);
      }
    });
  };



  app.beginCompute = function() {

    if (this._computeDepth === 0) this._computeCache = new Map();

    this._computeDepth++;

  };



  app.endCompute = function() {

    this._computeDepth--;

    if (this._computeDepth <= 0) { this._computeCache = null; this._computeDepth = 0; }

  };



  app.invalidateCompute = function() {

    this._computeCache = null;

    this._computeDepth = 0;

    this._graphDirty = true;

    // Re-render wires to stop animation

    if (typeof app.renderWires === 'function') app.renderWires();

  };



  // ═══════════════════════════════════════

  // COMPUTE NODE VALUE

  // Central computation — handles cache, v2 nodes, multi-output, all node types

  // ═══════════════════════════════════════



  app.computeNodeValue = function(nd) {

    var self = this;

    if (self._manualRunMode && !self._isRunningGraph) {
      return self.getLastRunNodeValue(nd);
    }

    var cache = self._computeCache;



    // Cache check

    if (cache) {

      var cached = cache.get(nd.id);

      if (cached === CACHE_COMPUTING) return undefined; // cycle

      if (cached !== undefined) return cached === CACHE_UNDEFINED ? undefined : cached;

      cache.set(nd.id, CACHE_COMPUTING);

    }



    // getInput: resolves wire → source node value, handles multi-output (_portValues)

    var getInput = function(portId) {

      var wire = self.wires.find(function(w) { return w.toNode === nd.id && w.toPort === portId; });

      if (!wire) return undefined;

      var srcNd = self.nodes.find(function(n) { return n.id === wire.fromNode; });

      if (!srcNd) return undefined;



      // Compute source

      self.computeNodeValue(srcNd);



      // Multi-output: check _portValues first

      if (srcNd._portValues && srcNd._portValues[wire.fromPort] !== undefined) {

        return srcNd._portValues[wire.fromPort];

      }



      // Python node results

      if ((srcNd.type === 'custom-python' || srcNd.type === 'custom-code') && srcNd._pyResults) {

        if (srcNd._pyResults[wire.fromPort] !== undefined) return srcNd._pyResults[wire.fromPort];

        var keys = Object.keys(srcNd._pyResults).filter(function(k) { return !k.startsWith('_') && k.length > 1; });

        if (keys.length > 0) return srcNd._pyResults[keys[0]];

      }



      return self.computeNodeValue(srcNd);

    };



    // Helper: get control value with wire override, formula evaluation, 0 is valid

    var getVal = function(id, def) {

      var v = getInput(id);

      if (v !== undefined) return v;

      // Check pre-evaluated formula result first (only if it exists and is a number)

      var evalKey = '_eval_' + id;

      if (nd.controlValues && nd.controlValues[evalKey] !== undefined && !isNaN(nd.controlValues[evalKey])) {
        var n = Number(nd.controlValues[evalKey]);
        return isNaN(n) ? def : n;
      }

      var cv = nd.controlValues ? nd.controlValues[id] : undefined;

      if (cv !== undefined && cv !== null) {

        // Try formula eval

        if (typeof FormulaEval !== 'undefined' && typeof cv === 'string' && cv.length > 0) {

          var result = FormulaEval.eval(cv);

          if (result.error === null) {
            var n2 = Number(result.value);
            return isNaN(n2) ? def : n2;
          }

        }

        var num = parseFloat(cv);

        return isNaN(num) ? def : num;

      }

      return def;

    };



    var result = undefined;

    try {

      result = computeInner(nd, getInput, getVal);

    } catch(e) {

      result = undefined;

    }



    if (cache) cache.set(nd.id, result !== undefined ? result : CACHE_UNDEFINED);

    return result;

  };

  app._getComputedInputValue = function(nd, portId) {
    var wire = this.wires.find(function(w) { return w.toNode === nd.id && w.toPort === portId; });
    if (!wire) return undefined;
    var srcNd = this.nodes.find(function(n) { return n.id === wire.fromNode; });
    if (!srcNd) return undefined;
    this.computeNodeValue(srcNd);
    if (srcNd._portValues && srcNd._portValues[wire.fromPort] !== undefined) return srcNd._portValues[wire.fromPort];
    if ((srcNd.type === 'custom-python' || srcNd.type === 'custom-code') && srcNd._pyResults) {
      if (srcNd._pyResults[wire.fromPort] !== undefined) return srcNd._pyResults[wire.fromPort];
      var keys = Object.keys(srcNd._pyResults).filter(function(k) { return !k.startsWith('_') && k.length > 1; });
      if (keys.length > 0) return srcNd._pyResults[keys[0]];
    }
    return this.computeNodeValue(srcNd);
  };

  app._prepareLiveRevitGeometries = async function() {
    var runtimeGlobal = typeof globalThis !== 'undefined' ? globalThis : {};
    var revitBridge = runtimeGlobal.RevitBridge || (runtimeGlobal.NodeFlow && runtimeGlobal.NodeFlow.RevitBridge) || null;
    var geometryNodes = this.nodes.filter(function(node) { return node.type === 'revit-element-geometries'; });
    var getParamNodes = this.nodes.filter(function(node) { return node.type === 'revit-get-parameter-values'; });
    var setParamNodes = this.nodes.filter(function(node) { return node.type === 'revit-set-parameter-values'; });
    var sendGeometryNodes = this.nodes.filter(function(node) { return node.type === 'revit-send-geometry'; });
    geometryNodes.forEach(function(node) {
      delete node._liveGeometryResult;
      delete node._liveGeometryError;
    });
    getParamNodes.forEach(function(node) {
      delete node._liveParameterGetResult;
      delete node._liveParameterError;
    });
    setParamNodes.forEach(function(node) {
      delete node._liveParameterSetResult;
      delete node._liveParameterError;
    });
    sendGeometryNodes.forEach(function(node) {
      delete node._liveSendGeometryResult;
      delete node._liveSendGeometryError;
    });
    if (!revitBridge) return;
    var hasLiveGeometry = typeof revitBridge.getLiveGeometries === 'function';
    var hasLiveGetParams = typeof revitBridge.getLiveParameterValues === 'function';
    var hasLiveSetParams = typeof revitBridge.setLiveParameterValues === 'function';
    var hasSendGeometry = typeof revitBridge.sendGeometry === 'function';
    if (!hasLiveGeometry && !hasLiveGetParams && !hasLiveSetParams && !hasSendGeometry) return;
    this.beginCompute();
    try {
      for (var i = 0; i < geometryNodes.length; i++) {
        var nd = geometryNodes[i];
        if (!hasLiveGeometry) continue;
        var inputElems = this._getComputedInputValue(nd, 'elements');
        if (!inputElems) {
          nd._liveGeometryResult = { meshes: [], count: 0 };
          continue;
        }
        if (!Array.isArray(inputElems)) inputElems = [inputElems];
        try {
          var geoMeshes = await revitBridge.getLiveGeometries(inputElems);
          if (Array.isArray(geoMeshes)) nd._liveGeometryResult = { meshes: geoMeshes, count: geoMeshes.length };
        } catch (err) {
          nd._liveGeometryError = err;
          console.warn('[Revit] Could not fetch live geometry for Element.Geometries:', err.message || err);
        }
      }
      for (var gi = 0; gi < getParamNodes.length; gi++) {
        var getNode = getParamNodes[gi];
        if (!hasLiveGetParams) continue;
        var getElems = this._getComputedInputValue(getNode, 'elements');
        var getParamName = this._getComputedInputValue(getNode, 'parameterName') || (getNode.controlValues && getNode.controlValues.parameterName) || '';
        if (!getElems || !getParamName) {
          getNode._liveParameterGetResult = { values: [], count: 0 };
          continue;
        }
        if (!Array.isArray(getElems)) getElems = [getElems];
        try {
          var values = await revitBridge.getLiveParameterValues(getElems, String(getParamName));
          if (Array.isArray(values)) getNode._liveParameterGetResult = { values: values, count: values.length };
        } catch (getErr) {
          getNode._liveParameterError = getErr;
          console.warn('[Revit] Could not fetch live parameter values:', getErr.message || getErr);
        }
      }
      for (var si = 0; si < setParamNodes.length; si++) {
        var setNode = setParamNodes[si];
        if (!hasLiveSetParams) continue;
        var setElems = this._getComputedInputValue(setNode, 'elements');
        var setParamName = this._getComputedInputValue(setNode, 'parameterName') || (setNode.controlValues && setNode.controlValues.parameterName) || '';
        var setValue = this._getComputedInputValue(setNode, 'value');
        if (setValue === undefined && setNode.controlValues) setValue = setNode.controlValues.value;
        if (!setElems || !setParamName) {
          setNode._liveParameterSetResult = { results: [], count: 0, success: false };
          continue;
        }
        if (!Array.isArray(setElems)) setElems = [setElems];
        try {
          var results = await revitBridge.setLiveParameterValues(setElems, String(setParamName), setValue);
          var successCount = Array.isArray(results) ? results.filter(function(result) { return result && result.ok; }).length : 0;
          setNode._liveParameterSetResult = {
            results: Array.isArray(results) ? results : [],
            count: successCount,
            success: Array.isArray(results) && results.length > 0 && successCount === results.length
          };
        } catch (setErr) {
          setNode._liveParameterError = setErr;
          console.warn('[Revit] Could not set live parameter values:', setErr.message || setErr);
        }
      }
      for (var sgi = 0; sgi < sendGeometryNodes.length; sgi++) {
        var sendNode = sendGeometryNodes[sgi];
        if (!hasSendGeometry) continue;
        var sendGeometry = this._getComputedInputValue(sendNode, 'geometry');
        if (!sendGeometry) {
          sendNode._liveSendGeometryResult = {
            result: { ok: false, message: 'No geometry input.' },
            elementId: '',
            success: false
          };
          continue;
        }
        var sendCategory = this._getComputedInputValue(sendNode, 'category') || (sendNode.controlValues && sendNode.controlValues.category) || 'Generic Models';
        var sendName = this._getComputedInputValue(sendNode, 'name') || (sendNode.controlValues && sendNode.controlValues.name) || 'Nova Geometry';
        try {
          var sendResult = await revitBridge.sendGeometry(sendGeometry, {}, {
            category: String(sendCategory),
            name: String(sendName),
            approval: {
              approved: true,
              message: 'Create native Revit DirectShape from Nova geometry.'
            }
          });
          var sendElementId = sendResult && sendResult.data ? (sendResult.data.directShapeId || sendResult.data.elementId || '') : '';
          sendNode._liveSendGeometryResult = {
            result: sendResult,
            elementId: sendElementId,
            success: !!(sendResult && sendResult.ok)
          };
        } catch (sendErr) {
          sendNode._liveSendGeometryError = sendErr;
          sendNode._liveSendGeometryResult = {
            result: { ok: false, message: sendErr.message || String(sendErr) },
            elementId: '',
            success: false
          };
          console.warn('[Revit] Could not send geometry to Revit:', sendErr.message || sendErr);
        }
      }
    } finally {
      this.endCompute();
    }
  };



  // ═══════════════════════════════════════

  // COMPUTE INNER — all node type logic in one place

  // ═══════════════════════════════════════



  // Curve helpers (work with Line3, Polyline3, NurbsCurve, any curve)

  function curveStart(c) { if (!c) return undefined; if (c.start) return c.start; if (c.points && c.points.length > 0) return c.points[0]; return undefined; }

  function curveEnd(c) { if (!c) return undefined; if (c.end) return c.end; if (c.points && c.points.length > 0) return c.points[c.points.length - 1]; return undefined; }

  function curveLen(c) { if (!c) return 0; if (typeof c.length === 'function') return c.length(); if (c.points) { var l = 0; for (var i = 1; i < c.points.length; i++) l += c.points[i-1].distanceTo(c.points[i]); return l; } return 0; }

  function curveDir(c) { var s = curveStart(c), e = curveEnd(c); if (s && e) { var d = e.sub(s); var l = Math.sqrt(d.x*d.x+d.y*d.y+d.z*d.z)||1; return new Geo.Vector3(d.x/l,d.y/l,d.z/l); } return new Geo.Vector3(0,0,0); }

  function curveMid(c) { var s = curveStart(c), e = curveEnd(c); return (s && e) ? s.lerp(e, 0.5) : undefined; }



  function computeInner(nd, getInput, getVal) {

    var ctrl = nd.controlValues || {};



    switch (nd.type) {



      // ── Point nodes ──

      case 'point-origin': return new Geo.Point3(0, 0, 0);

      case 'point-bycoordinates': return new Geo.Point3(getVal('x', 0), getVal('y', 0), getVal('z', 0));

      case 'point-deconstruct': {

        var pt = getInput('point');

        if (!pt) return undefined;

        nd._portValues = { x: pt.x !== undefined ? pt.x : 0, y: pt.y !== undefined ? pt.y : 0, z: pt.z !== undefined ? pt.z : 0 };

        return nd._portValues;

      }

      case 'point-x': { var p = getInput('point'); return p ? (p.x !== undefined ? p.x : 0) : undefined; }

      case 'point-y': { var p = getInput('point'); return p ? (p.y !== undefined ? p.y : 0) : undefined; }

      case 'point-z': { var p = getInput('point'); return p ? (p.z !== undefined ? p.z : 0) : undefined; }



      // ── Line nodes ──

      case 'line-bystartpointendpoint': {

        var sp = getInput('startPoint'), ep = getInput('endPoint');

        if (sp && ep) {

          var s = sp instanceof Geo.Point3 ? sp : new Geo.Point3(sp.x||0, sp.y||0, sp.z||0);

          var e = ep instanceof Geo.Point3 ? ep : new Geo.Point3(ep.x||0, ep.y||0, ep.z||0);

          return new Geo.Line3(s, e);

        }

        return undefined;

      }

      case 'line-bypointanddirection': {

        var orig = getInput('origin'), dir = getInput('direction'), len = getVal('length', 10);

        if (orig && dir) {

          var o = orig instanceof Geo.Point3 ? orig : new Geo.Point3(orig.x||0, orig.y||0, orig.z||0);

          var d = dir instanceof Geo.Vector3 ? dir : new Geo.Vector3(dir.x||1, dir.y||0, dir.z||0);

          var dn = d.normalize().scale(len);

          return new Geo.Line3(o, o.add(dn));

        }

        return undefined;

      }

      case 'line-startpoint': return curveStart(getInput('curve'));

      case 'line-endpoint': return curveEnd(getInput('curve'));

      case 'line-direction': return curveDir(getInput('curve'));

      case 'line-length': return curveLen(getInput('curve'));

      case 'line-deconstruct': {

        var c = getInput('curve'); if (!c) return undefined;

        nd._portValues = { start: curveStart(c), end: curveEnd(c), length: curveLen(c), midpoint: curveMid(c), direction: curveDir(c) };

        return nd._portValues;

      }



      // ── Input nodes ──

      case 'number-input': case 'slider-input': return parseFloat(ctrl.val) || 0;

      case 'integer-input': return parseInt(ctrl.val) || 0;

      case 'text-input': return ctrl.val || '';

      case 'boolean-input': return ctrl.val === 'True';



      // ── Math (extended) ──

      case 'math-modulo': { var a = getVal('a',undefined), b = getVal('b',undefined); return (a !== undefined && b !== undefined && b !== 0) ? a % b : undefined; }

      case 'math-negate': { var a = getVal('a',undefined); return a !== undefined ? -a : undefined; }

      case 'math-abs': { var a = getVal('a',undefined); return a !== undefined ? Math.abs(a) : undefined; }

      case 'math-reciprocal': { var a = getVal('a',undefined); return (a !== undefined && a !== 0) ? 1 / a : undefined; }

      case 'math-remap': {

        var v = getVal('value', undefined);

        var tMin = getVal('toMin', 0), tMax = getVal('toMax', 100);

        var fMinRaw = nd.controlValues ? nd.controlValues['fromMin'] : '0';

        var fMaxRaw = nd.controlValues ? nd.controlValues['fromMax'] : '1';

        var fMinAuto = (fMinRaw === 'auto' || fMinRaw === undefined);

        var fMaxAuto = (fMaxRaw === 'auto' || fMaxRaw === undefined);

        if (v === undefined) return undefined;

        // List of numbers

        if (Array.isArray(v)) {

          var nums = v.filter(function(x) { return typeof x === 'number'; });

          if (nums.length === 0) return undefined;

          var fMin = fMinAuto ? Math.min.apply(null, nums) : getVal('fromMin', 0);

          var fMax = fMaxAuto ? Math.max.apply(null, nums) : getVal('fromMax', 1);

          if (fMax === fMin) fMax = fMin + 1;

          return nums.map(function(n) { return tMin + (n - fMin) / (fMax - fMin) * (tMax - tMin); });

        }

        // Single number

        if (typeof v === 'number') {

          var fMin = fMinAuto ? 0 : getVal('fromMin', 0);

          var fMax = fMaxAuto ? 1 : getVal('fromMax', 1);

          if (fMax === fMin) fMax = fMin + 1;

          return tMin + (v - fMin) / (fMax - fMin) * (tMax - tMin);

        }

        return undefined;

      }

      case 'math-floor': { var a = getVal('a',undefined); return a !== undefined ? Math.floor(a) : undefined; }

      case 'math-ceil': { var a = getVal('a',undefined); return a !== undefined ? Math.ceil(a) : undefined; }

      case 'math-round': { var a = getVal('a',undefined), d = getVal('digits',0); return a !== undefined ? parseFloat(a.toFixed(Math.max(0,Math.round(d)))) : undefined; }

      case 'math-min': { var a = getVal('a',undefined), b = getVal('b',undefined); return (a !== undefined && b !== undefined) ? Math.min(a, b) : undefined; }

      case 'math-max': { var a = getVal('a',undefined), b = getVal('b',undefined); return (a !== undefined && b !== undefined) ? Math.max(a, b) : undefined; }

      case 'math-clamp': { var v = getInput('value'), mn = getVal('min',0), mx = getVal('max',1); return v !== undefined ? Math.max(mn, Math.min(mx, v)) : undefined; }



      // ── Math (v1+v2 unified — uses getVal for formula/control fallback) ──
      // Array-aware arithmetic: broadcasts scalars, adds element-wise for arrays

      case 'math-add': {
        var a = getVal('a',undefined), b = getVal('b',undefined);
        return executeBinaryLacedMath(nd, a, b, function(x, y) { return x + y; });
      }

      case 'math-subtract': {
        var a = getVal('a',undefined), b = getVal('b',undefined);
        return executeBinaryLacedMath(nd, a, b, function(x, y) { return x - y; });
      }

      case 'math-multiply': {
        var a = getVal('a',undefined), b = getVal('b',undefined);
        return executeBinaryLacedMath(nd, a, b, function(x, y) { return x * y; });
      }

      case 'math-divide': {
        var a = getVal('a',undefined), b = getVal('b',undefined);
        return executeBinaryLacedMath(nd, a, b, function(x, y) { return y !== 0 ? x / y : undefined; });
      }

      case 'math-power': {
        var base = getVal('base',undefined), exp = getVal('exp',undefined);
        if (base === undefined || exp === undefined) return undefined;
        if (Array.isArray(base) && Array.isArray(exp)) { var powArr = []; for (var pi = 0; pi < Math.min(base.length, exp.length); pi++) powArr.push(Math.pow(base[pi], exp[pi])); return powArr; }
        if (Array.isArray(base)) { var powArrA = []; for (var pi2 = 0; pi2 < base.length; pi2++) powArrA.push(Math.pow(base[pi2], exp)); return powArrA; }
        if (Array.isArray(exp)) { var powArrB = []; for (var pi3 = 0; pi3 < exp.length; pi3++) powArrB.push(Math.pow(base, exp[pi3])); return powArrB; }
        return Math.pow(base, exp);
      }



      // ── Logic (extended) ──

      case 'logic-xor': { var a = getVal('a',undefined), b = getVal('b',undefined); return (a !== undefined && b !== undefined) ? (a || b) && !(a && b) : undefined; }

      case 'logic-isnull': { var v = getInput('value'); return v === undefined || v === null; }

      case 'logic-gate': { var v = getInput('value'), p = getVal('pass',true); return p ? v : undefined; }



      // ── Logic (core) ──

      case 'logic-and': { var a = getVal('a',undefined), b = getVal('b',undefined); return (a !== undefined && b !== undefined) ? (!!a && !!b) : undefined; }

      case 'logic-or': { var a = getVal('a',undefined), b = getVal('b',undefined); return (a !== undefined && b !== undefined) ? (!!a || !!b) : undefined; }

      case 'logic-not': { var v = getVal('value',undefined); return v !== undefined ? !v : undefined; }

      case 'logic-compare': { var a = getVal('a',undefined), b = getVal('b',undefined), op = ctrl.op; if (a === undefined || b === undefined) return undefined; switch(op){case'==':return a===b;case'!=':return a!==b;case'<':return a<b;case'>':return a>b;case'<=':return a<=b;case'>=':return a>=b;} return undefined; }

      case 'logic-if': { var cond = getVal('condition',undefined), t = getVal('ifTrue',undefined), f = getVal('ifFalse',undefined); return cond !== undefined ? (cond ? t : f) : undefined; }



      // ── List (extended) ──

      case 'list-first': { var lst = getInput('list'); return Array.isArray(lst) && lst.length > 0 ? lst[0] : undefined; }

      case 'list-last': { var lst = getInput('list'); return Array.isArray(lst) && lst.length > 0 ? lst[lst.length - 1] : undefined; }

      case 'list-take': { var lst = getInput('list'), n = getVal('count', 5); return Array.isArray(lst) ? lst.slice(0, Math.max(0, Math.round(n))) : undefined; }

      case 'list-skip': { var lst = getInput('list'), n = getVal('count', 1); return Array.isArray(lst) ? lst.slice(Math.max(0, Math.round(n))) : undefined; }

      case 'list-slice': { var lst = getInput('list'), f = getVal('from', 0), t = getVal('to', 5); return Array.isArray(lst) ? lst.slice(Math.max(0, Math.round(f)), Math.round(t)) : undefined; }

      case 'list-sort': { var lst = getInput('list'); if (!Array.isArray(lst)) return undefined; var sorted = lst.slice().sort(function(a,b){return a-b;}); return ctrl.desc === 'Descending' ? sorted.reverse() : sorted; }

      case 'list-shuffle': {

        var lst = getInput('list'); if (!Array.isArray(lst)) return undefined;

        var seed = getVal('seed', 0); var s = lst.slice();

        // Seeded pseudo-random shuffle (mulberry32)

        var t = Math.abs(Math.round(seed)) + 1;

        function seedRand() { t = (t + 0x6D2B79F5) | 0; var x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }

        for (var si = s.length - 1; si > 0; si--) { var sj = Math.floor(seedRand() * (si + 1)); var tmp = s[si]; s[si] = s[sj]; s[sj] = tmp; }

        return s;

      }

      case 'list-unique': { var lst = getInput('list'); if (!Array.isArray(lst)) return undefined; var seen = []; lst.forEach(function(v) { if (seen.indexOf(v) < 0) seen.push(v); }); return seen; }

      case 'list-zip': { var a = getInput('listA'), b = getInput('listB'); if (Array.isArray(a) && Array.isArray(b)) { var r = []; for (var zi = 0; zi < Math.min(a.length, b.length); zi++) r.push([a[zi], b[zi]]); return r; } return undefined; }

      case 'list-join': { var a = getInput('listA'), b = getInput('listB'); if (Array.isArray(a) && Array.isArray(b)) return a.concat(b); return undefined; }

      case 'list-insert': { var lst = getInput('list'), item = getInput('item'), idx = getVal('index', 0); if (Array.isArray(lst)) { var r = lst.slice(); r.splice(Math.round(idx), 0, item); return r; } return undefined; }

      case 'list-remove': { var lst = getInput('list'), idx = getVal('index', 0); if (Array.isArray(lst) && lst.length > 0) { var r = lst.slice(); var i = Math.max(0, Math.min(r.length - 1, Math.round(idx))); nd._portValues = { result: r.slice(0, i).concat(r.slice(i + 1)), removed: r[i] }; return nd._portValues; } return undefined; }

      case 'list-sum': { var lst = getInput('list'); if (Array.isArray(lst)) { var s = 0; lst.forEach(function(v) { if (typeof v === 'number') s += v; }); return s; } return undefined; }

      case 'list-average': { var lst = getInput('list'); if (Array.isArray(lst) && lst.length > 0) { var s = 0, c = 0; lst.forEach(function(v) { if (typeof v === 'number') { s += v; c++; } }); return c > 0 ? s / c : 0; } return undefined; }

      case 'list-minval': { var lst = getInput('list'); if (Array.isArray(lst) && lst.length > 0) { var nums = lst.filter(function(v) { return typeof v === 'number'; }); return nums.length > 0 ? Math.min.apply(null, nums) : undefined; } return undefined; }

      case 'list-maxval': { var lst = getInput('list'); if (Array.isArray(lst) && lst.length > 0) { var nums = lst.filter(function(v) { return typeof v === 'number'; }); return nums.length > 0 ? Math.max.apply(null, nums) : undefined; } return undefined; }

      case 'list-groupby': {

        var lst = getInput('list');

        if (!Array.isArray(lst)) return undefined;

        var keysList = getInput('keys'); // optional parallel keys list

        var exprStr = ctrl.expr || 'x%3';

        var gdict = {}, gorder = [];

        // Build key function from expression

        var keyFn;

        try {

          if (typeof FormulaEval !== 'undefined') {

            keyFn = function(x) {

              // Replace 'x' in expression with the value, then eval

              var expr = String(exprStr).replace(/\bx\b/g, typeof x === 'number' ? String(x) : '"' + String(x) + '"');

              return FormulaEval.eval(expr).value;

            };

          } else {

            keyFn = function(x) { return typeof x === 'number' ? Math.floor(x) : String(x).charAt(0); };

          }

        } catch(e) { keyFn = function(x) { return 0; }; }

        for (var gi = 0; gi < lst.length; gi++) {

          var k;

          if (Array.isArray(keysList) && gi < keysList.length) {

            k = keysList[gi]; // use provided keys

          } else {

            try { k = keyFn(lst[gi]); } catch(e2) { k = 0; }

          }

          var ks = String(k);

          if (!gdict[ks]) { gdict[ks] = []; gorder.push(ks); }

          gdict[ks].push(lst[gi]);

        }

        var groups = gorder.map(function(ks) { return gdict[ks]; });

        var groupKeys = gorder.map(function(ks) { return isNaN(Number(ks)) ? ks : Number(ks); });

        nd._portValues = { groups: groups, groupKeys: groupKeys };

        return nd._portValues;

      }

      case 'list-chunk': {

        var lst = getInput('list'), sz = Math.max(1, Math.round(getVal('size', 3)));

        if (!Array.isArray(lst)) return undefined;

        var chunks = [];

        for (var ci = 0; ci < lst.length; ci += sz) chunks.push(lst.slice(ci, ci + sz));

        return chunks;

      }

      case 'list-transpose': {

        var lst = getInput('list');

        if (!Array.isArray(lst) || lst.length === 0 || !Array.isArray(lst[0])) return undefined;

        var maxLen = 0; lst.forEach(function(r) { if (Array.isArray(r) && r.length > maxLen) maxLen = r.length; });

        var result = [];

        for (var ti = 0; ti < maxLen; ti++) { var row = []; lst.forEach(function(r) { row.push(Array.isArray(r) && ti < r.length ? r[ti] : undefined); }); result.push(row); }

        return result;

      }

      case 'list-pairs': {

        var lst = getInput('list');

        if (!Array.isArray(lst) || lst.length < 2) return undefined;

        var pairs = [];

        for (var pi = 0; pi < lst.length - 1; pi++) pairs.push([lst[pi], lst[pi + 1]]);

        return pairs;

      }

      case 'list-indexof': {

        var lst = getInput('list'), item = getVal('item', 0);

        if (!Array.isArray(lst)) return -1;

        var idx = lst.indexOf(item);

        return idx;

      }

      case 'list-contains': {

        var lst = getInput('list'), item = getVal('item', 0);

        if (!Array.isArray(lst)) return false;

        return lst.indexOf(item) >= 0;

      }

      case 'list-filterbool': {

        var lst = getInput('list'), mask = getInput('mask');

        if (!Array.isArray(lst)) return undefined;

        // Mask can be a list of booleans, numbers (0/1), or any truthy/falsy values

        if (!Array.isArray(mask)) mask = [];

        var inL = [], outL = [];

        for (var fi = 0; fi < lst.length; fi++) {

          var m = fi < mask.length ? mask[fi] : false;

          // Treat as boolean: true, 1, "true", non-zero = true; false, 0, "false", null, undefined = false

          var isTruthy = !!m && m !== 'false' && m !== 'False' && m !== 0;

          if (isTruthy) inL.push(lst[fi]); else outL.push(lst[fi]);

        }

        nd._portValues = { inList: inL, outList: outL }; return nd._portValues;

      }



      // ── List (core — unified with formula support) ──

      case 'list-create': {

        var items = [];

        // Collect all item inputs (dynamic)

        var dynInputs = nd._dynInputIds || (nd.def.inputs || []).map(function(inp) { return inp.id; });

        for (var di = 0; di < dynInputs.length; di++) {

          var v = getInput(dynInputs[di]);

          if (v !== undefined) items.push(v);

        }

        return items;

      }

      case 'list-get': { var lst = getInput('list'), idx = getVal('index', 0); return Array.isArray(lst) && idx !== undefined ? lst[Math.max(0, Math.floor(idx))] : undefined; }

      case 'list-length': case 'list-count': { var lst = getInput('list'); return Array.isArray(lst) ? lst.length : undefined; }

      case 'list-range': { var s = getVal('start',0), e = getVal('end',10), st = getVal('step',1); if (s !== undefined && e !== undefined) { var r = []; st = st || 1; for (var i = s; st > 0 ? i < e : i > e; i += st) { r.push(i); if (r.length > 10000) break; } return r; } return undefined; }

      case 'list-reverse': { var lst = getInput('list'); return Array.isArray(lst) ? lst.slice().reverse() : undefined; }

      case 'list-sequence': { var start = getVal('start',0), step = getVal('step',1), count = getVal('count',10); if (count !== undefined) { var r = []; for (var i = 0; i < Math.min(count, 10000); i++) r.push(start + step * i); return r; } return undefined; }

      case 'list-flatten': { var lst = getInput('list'); if (Array.isArray(lst)) { var flat = []; lst.forEach(function(item) { if (Array.isArray(item)) item.forEach(function(sub) { flat.push(sub); }); else flat.push(item); }); return flat; } return undefined; }

      case 'list-cross-ref': { var a = getInput('listA'), b = getInput('listB'); if (Array.isArray(a) && Array.isArray(b)) { var pA = [], pB = []; a.forEach(function(av) { b.forEach(function(bv) { pA.push(av); pB.push(bv); }); }); nd._portValues = { pairsA: pA, pairsB: pB }; return nd._portValues; } return undefined; }

      case 'list-repeat': { var item = getInput('item'), count = getVal('count', 5); if (count !== undefined) { var r = []; for (var i = 0; i < Math.min(count, 10000); i++) r.push(item); return r; } return undefined; }



      // ── Geometry primitives ──

      case 'geo-point': { var x = getInput('x'), y = getInput('y'), z = getInput('z'); return (x !== undefined || y !== undefined || z !== undefined) ? new Geo.Point3(x||0, y||0, z||0) : undefined; }

      case 'geo-vector': { var x = getInput('x'), y = getInput('y'), z = getInput('z'); return (x !== undefined || y !== undefined || z !== undefined) ? new Geo.Vector3(x||0, y||0, z||0) : undefined; }

      case 'geo-line': { var s = getInput('start'), e = getInput('end'); if (s && e) { var sp = s instanceof Geo.Point3 ? s : new Geo.Point3(s.x||0,s.y||0,s.z||0); var ep = e instanceof Geo.Point3 ? e : new Geo.Point3(e.x||0,e.y||0,e.z||0); return new Geo.Line3(sp,ep); } return undefined; }

      case 'geo-circle': { var c = getInput('center'), r = getInput('radius'); if (c) return new Geo.Circle3(c instanceof Geo.Point3 ? c : new Geo.Point3(0,0,0), r||5); return undefined; }

      case 'geo-distance': { var a = getInput('a'), b = getInput('b'); if (a && b) { var ap = a instanceof Geo.Point3 ? a : new Geo.Point3(a.x||0,a.y||0,a.z||0); var bp = b instanceof Geo.Point3 ? b : new Geo.Point3(b.x||0,b.y||0,b.z||0); return ap.distanceTo(bp); } return undefined; }



      // ── Solids ──

      case 'solid-box': { var c = getInput('center')||new Geo.Point3(0,0,0); return Geo.createBox(c instanceof Geo.Point3?c:new Geo.Point3(0,0,0), getInput('width')||10, getInput('depth')||10, getInput('height')||10); }

      case 'solid-sphere': { var c = getInput('center')||new Geo.Point3(0,0,0); return Geo.createSphere(c instanceof Geo.Point3?c:new Geo.Point3(0,0,0), getInput('radius')||5); }

      case 'solid-cylinder': { var b = getInput('base')||new Geo.Point3(0,0,0); return Geo.createCylinder(b instanceof Geo.Point3?b:new Geo.Point3(0,0,0), getInput('radius')||5, getInput('height')||10); }

      case 'solid-cone': { var b = getInput('base')||new Geo.Point3(0,0,0); return Geo.createCone(b instanceof Geo.Point3?b:new Geo.Point3(0,0,0), getInput('radius')||5, getInput('height')||10); }

      case 'solid-torus': { var c = getInput('center')||new Geo.Point3(0,0,0); return Geo.createTorus(c instanceof Geo.Point3?c:new Geo.Point3(0,0,0), getInput('majorR')||5, getInput('minorR')||1.5); }



      // ── Operations ──

      case 'op-extrude': { var curve = getInput('curve'), vec = getInput('vector'); if (curve && vec) return Geo.extrude(curve, vec instanceof Geo.Vector3 ? vec : new Geo.Vector3(vec.x||0,vec.y||0,vec.z||0)); return undefined; }

      case 'op-revolve': { var curve = getInput('curve'), ao = getInput('axisOrigin'), ad = getInput('axisDir'), angle = getInput('angle'); if (curve) return Geo.revolve(curve, ao, ad, (angle||360)*Math.PI/180); return undefined; }

      case 'op-loft': { var profiles = getInput('profiles'); if (profiles) return Geo.loft(profiles); return undefined; }

      case 'op-sweep': { var profile = getInput('profile'), path = getInput('path'); if (profile && path) return Geo.sweep(profile, path); return undefined; }

      case 'op-pipe': { var curve = getInput('curve'), r = getInput('radius'); if (curve) return Geo.pipe(curve, r||0.5); return undefined; }

      case 'op-boolean-union': { var a = getInput('a'), b = getInput('b'); if (a && b) return Geo.booleanUnion(a,b); return undefined; }

      case 'op-boolean-intersect': { var a = getInput('a'), b = getInput('b'); if (a && b) return Geo.booleanIntersect(a,b); return undefined; }

      case 'op-boolean-subtract': { var a = getInput('a'), b = getInput('b'); if (a && b) return Geo.booleanSubtract(a,b); return undefined; }

      case 'op-combine-all': { var meshes = getInput('meshes'); if (meshes && Array.isArray(meshes)) return Geo.combineAll(meshes); return undefined; }

      case 'op-move': { var geo = getInput('geometry'), vec = getInput('vector'); if (geo && vec) return Geo.move(geo, vec instanceof Geo.Vector3 ? vec : new Geo.Vector3(vec.x||0,vec.y||0,vec.z||0)); return undefined; }

      case 'op-rotate': { var geo = getInput('geometry'), ao = getInput('axisOrigin'), ad = getInput('axisDir'), angle = getInput('angle'); if (geo) return Geo.rotate(geo, ao, ad, (angle||0)*Math.PI/180); return undefined; }

      case 'op-scale': { var geo = getInput('geometry'), f = getInput('factor'), o = getInput('origin'); if (geo && f) return Geo.scaleGeo(geo, f, o); return undefined; }

      case 'op-mirror': { var geo = getInput('geometry'), po = getInput('planeOrigin'), pn = getInput('planeNormal'); if (geo) return Geo.mirror(geo, po, pn); return undefined; }

      case 'op-array-linear': { var geo = getInput('geometry'), dir = getInput('direction'), cnt = getInput('count'), sp = getInput('spacing'); if (geo && dir) return Geo.arrayLinear(geo, dir, cnt||3, sp||1); return undefined; }

      case 'op-array-polar': { var geo = getInput('geometry'), c = getInput('center'), ax = getInput('axis'), cnt = getInput('count'); if (geo) return Geo.arrayPolar(geo, c, ax, cnt||6); return undefined; }

      case 'op-thicken': { var mesh = getInput('mesh'), t = getInput('thickness'); if (mesh) return Geo.thicken(mesh, t||1); return undefined; }

      case 'op-smooth': { var mesh = getInput('mesh'), it = getInput('iterations'); if (mesh) return Geo.smooth(mesh, Math.min(it||1, 20)); return undefined; }

      case 'op-subdivide': { var mesh = getInput('mesh'), it = getInput('iterations'); if (mesh) return Geo.subdivide(mesh, Math.min(it||1, 5)); return undefined; }

      case 'op-offset': { var curve = getInput('curve'), d = getInput('distance'); if (curve && d) return Geo.offsetCurve(curve, d); return undefined; }

      case 'op-trim': { var line = getInput('line'), t0 = getInput('t0'), t1 = getInput('t1'); if (line) return Geo.trimLine(line, t0||0, t1||1); return undefined; }

      case 'op-bezier': { var pts = getInput('points'); if (pts) return Geo.bezier(pts); return undefined; }

      case 'op-interpolate': { var pts = getInput('points'); if (pts) return Geo.interpolate(pts); return undefined; }

      case 'op-ruled-surface': { var c1 = getInput('curve1'), c2 = getInput('curve2'); if (c1 && c2) return Geo.ruledSurface(c1, c2); return undefined; }

      case 'op-isolines': { var mesh = getInput('mesh'), cnt = getInput('count'); var dir = ctrl.dir; if (mesh) return dir === 'V' ? Geo.getIsolinesV(mesh, cnt||10) : Geo.getIsolinesU(mesh, cnt||10); return undefined; }

      case 'op-point-grid': { var o = getInput('origin')||new Geo.Point3(0,0,0); return Geo.pointGrid(o instanceof Geo.Point3?o:new Geo.Point3(0,0,0), new Geo.Vector3(1,0,0), new Geo.Vector3(0,1,0), getInput('uCount')||5, getInput('vCount')||5, getInput('spacing')||1, getInput('spacing')||1); }



      // ── Surfaces ──

      case 'surf-plane': { var o = getInput('origin')||new Geo.Point3(0,0,0), n = getInput('normal')||new Geo.Vector3(0,0,1); return new Geo.Plane(o instanceof Geo.Point3?o:new Geo.Point3(0,0,0), n instanceof Geo.Vector3?n:new Geo.Vector3(0,0,1)); }

      case 'surf-from-grid': { var pts = getInput('points'), u = getInput('uCount'), v = getInput('vCount'); if (pts && u && v) return Geo.surfaceFromGrid(pts, u, v); return undefined; }

      case 'surf-polyline': { var pts = getInput('points'), closed = getInput('closed'); if (pts && Array.isArray(pts)) return new Geo.Polyline3(pts, !!closed); return undefined; }

      case 'surf-arc': { var c = getInput('center')||new Geo.Point3(0,0,0), r = getInput('radius'), sa = getInput('startAngle'), ea = getInput('endAngle'); return new Geo.Arc3(c instanceof Geo.Point3?c:new Geo.Point3(0,0,0), r||5, (sa||0)*Math.PI/180, (ea||360)*Math.PI/180); }



      // ── Patterns ──

      case 'pat-voronoi-outlines': { var sites = getInput('sites'); if (sites && Array.isArray(sites)) return Geo.voronoiOutlines(sites, null, 0.5); return undefined; }

      case 'pat-voronoi-mesh': { var sites = getInput('sites'), h = getInput('height'), gap = getInput('gap'); if (sites && Array.isArray(sites)) return Geo.voronoiMesh(sites, null, h||3, gap||0.1); return undefined; }

      case 'pat-hex-grid': { var o = getInput('origin'); if (o) return Geo.hexGrid(o, getInput('radius')||2, getInput('rows')||5, getInput('cols')||5); return undefined; }

      case 'pat-perlin2': { var x = getInput('x'), y = getInput('y'); return (x !== undefined && y !== undefined) ? Geo.perlin2(x, y) : undefined; }

      case 'pat-perlin3': { var x = getInput('x'), y = getInput('y'), z = getInput('z'); return (x !== undefined) ? Geo.perlin3(x||0, y||0, z||0) : undefined; }

      case 'pat-fbm': { return Geo.fbm(getInput('x')||0, getInput('y')||0, getInput('z')||0, getInput('octaves')||4); }

      case 'pat-point-attractor': { var pt = getInput('point'), attr = getInput('attractor'); if (pt && attr) return Geo.pointAttractor(pt, attr, getInput('radius')||10, getInput('falloff')||2); return undefined; }

      case 'pat-noise-deform': { var mesh = getInput('mesh'); if (mesh) return Geo.noiseDeform(mesh, getInput('amplitude')||1, getInput('frequency')||0.1); return undefined; }

      case 'pat-phyllotaxis': return Geo.phyllotaxis(getInput('count')||100, getInput('radius')||10);

      case 'pat-fibonacci-sphere': return Geo.fibonacciSphere(getInput('count')||100, getInput('radius')||10);

      case 'nurbs-curve': { var pts = getInput('points'); if (pts && Array.isArray(pts)) return Geo.createNurbsCurve(pts, getInput('degree')||3); return undefined; }

      case 'nurbs-surface': { var grid = getInput('grid'); if (grid && Array.isArray(grid)) return Geo.createNurbsSurface(grid, getInput('degreeU')||3, getInput('degreeV')||3); return undefined; }



      // ── Profiles ──

      case 'prof-circle': { var c = getInput('center')||new Geo.Point3(0,0,0), r = getInput('radius')||5, res = Math.max(8, parseInt(getInput('resolution'))||32); var pts = []; for (var j = 0; j < res; j++) { var a = 2*Math.PI*j/res; pts.push(new Geo.Point3(c.x+r*Math.cos(a), c.y+r*Math.sin(a), c.z)); } return pts; }

      case 'prof-ellipse': { var c = getInput('center')||new Geo.Point3(0,0,0), w = (getInput('width')||10)/2, d = (getInput('depth')||6)/2, rot = (getInput('rotation')||0)*Math.PI/180, res = Math.max(8, parseInt(getInput('resolution'))||32); var cosR = Math.cos(rot), sinR = Math.sin(rot); var pts = []; for (var j = 0; j < res; j++) { var a = 2*Math.PI*j/res; var x = w*Math.cos(a), y = d*Math.sin(a); pts.push(new Geo.Point3(c.x+x*cosR-y*sinR, c.y+x*sinR+y*cosR, c.z)); } return pts; }

      case 'prof-rect': { var c = getInput('center')||new Geo.Point3(0,0,0), hw = (getInput('width')||10)/2, hd = (getInput('depth')||6)/2; return [new Geo.Point3(c.x-hw,c.y-hd,c.z), new Geo.Point3(c.x+hw,c.y-hd,c.z), new Geo.Point3(c.x+hw,c.y+hd,c.z), new Geo.Point3(c.x-hw,c.y+hd,c.z)]; }

      // ── Revit typed element nodes ──
      case 'host-get-elements': {
        var hostId = ctrl.host || 'revit';
        var queryText = getInput('query') || ctrl.category || '';
        var query = hostId === 'rhino' ? { layer: queryText } : { category: queryText };
        var hostStarted = Date.now();
        var hostElems = getHostAdapter(hostId).getElements(query);
        var hostLog = app._recordHostRequest({ nodeId: nd.id, host: hostId, operation: 'getElements', query: query, durationMs: Date.now() - hostStarted, ok: true, count: hostElems && hostElems.length || 0 });
        nd._debug = Object.assign({}, nd._debug || {}, { hostLog: hostLog });
        nd._portValues = { elements: hostElems, count: hostElems.length || 0, host: hostId };
        return nd._portValues;
      }
      case 'host-get-geometry': {
        var geoHostId = ctrl.host || 'revit';
        var refs = getInput('refs');
        if (!refs) { nd._portValues = { geometry: [], count: 0 }; return nd._portValues; }
        var geoStarted = Date.now();
        var hostGeo = getHostAdapter(geoHostId).getGeometry(Array.isArray(refs) ? refs : [refs], { level: ctrl.level || 'Bounds' });
        if (hostGeo && typeof hostGeo.then === 'function') {
          return hostGeo.then(function(result) {
            var geoLog = app._recordHostRequest({ nodeId: nd.id, host: geoHostId, operation: 'getGeometry', level: ctrl.level || 'Bounds', durationMs: Date.now() - geoStarted, ok: true, count: result && result.length || 0 });
            nd._debug = Object.assign({}, nd._debug || {}, { hostLog: geoLog });
            nd._portValues = { geometry: result || [], count: result && result.length || 0 };
            return nd._portValues;
          });
        }
        var geoLogSync = app._recordHostRequest({ nodeId: nd.id, host: geoHostId, operation: 'getGeometry', level: ctrl.level || 'Bounds', durationMs: Date.now() - geoStarted, ok: true, count: hostGeo && hostGeo.length || 0 });
        nd._debug = Object.assign({}, nd._debug || {}, { hostLog: geoLogSync });
        nd._portValues = { geometry: hostGeo || [], count: hostGeo && hostGeo.length || 0 };
        return nd._portValues;
      }
      case 'host-get-parameter-values': {
        var paramHostId = ctrl.host || 'revit';
        var paramRefs = getInput('refs');
        var paramNames = getInput('names') || ctrl.names || '';
        if (!paramRefs || !paramNames) { nd._portValues = { values: [], count: 0 }; return nd._portValues; }
        var names = String(paramNames).split(',').map(function(name) { return name.trim(); }).filter(Boolean);
        var paramStarted = Date.now();
        var hostValues = getHostAdapter(paramHostId).getParameterValues(Array.isArray(paramRefs) ? paramRefs : [paramRefs], names);
        var paramLog = app._recordHostRequest({ nodeId: nd.id, host: paramHostId, operation: 'getParameterValues', names: names, durationMs: Date.now() - paramStarted, ok: true });
        nd._debug = Object.assign({}, nd._debug || {}, { hostLog: paramLog });
        nd._portValues = { values: hostValues, count: Array.isArray(hostValues) ? hostValues.length : Object.keys(hostValues || {}).length };
        return nd._portValues;
      }
      case 'host-set-parameter-values': {
        var setHostId = ctrl.host || 'revit';
        var setRefs = getInput('refs');
        var setNamesRaw = getInput('names') || ctrl.names || '';
        var setValues = getInput('values');
        if (setValues === undefined) setValues = ctrl.values;
        if (!setRefs || !setNamesRaw) { nd._portValues = { results: [], count: 0, success: false }; return nd._portValues; }
        var setNames = String(setNamesRaw).split(',').map(function(name) { return name.trim(); }).filter(Boolean);
        var setStarted = Date.now();
        var setResult = getHostAdapter(setHostId).setParameterValues(Array.isArray(setRefs) ? setRefs : [setRefs], setNames, setValues);
        if (setResult && typeof setResult.then === 'function') {
          return setResult.then(function(results) {
            var setLog = app._recordHostRequest({ nodeId: nd.id, host: setHostId, operation: 'setParameterValues', names: setNames, durationMs: Date.now() - setStarted, ok: true, count: results && results.length || 0 });
            nd._debug = Object.assign({}, nd._debug || {}, { hostLog: setLog });
            nd._portValues = { results: results || [], count: results && results.length || 0, success: !!(results && results.length && results.every(function(item) { return item && item.ok; })) };
            return nd._portValues;
          });
        }
        var setLogSync = app._recordHostRequest({ nodeId: nd.id, host: setHostId, operation: 'setParameterValues', names: setNames, durationMs: Date.now() - setStarted, ok: true, count: setResult && setResult.length || 0 });
        nd._debug = Object.assign({}, nd._debug || {}, { hostLog: setLogSync });
        nd._portValues = { results: setResult || [], count: setResult && setResult.length || 0, success: !!(setResult && setResult.length && setResult.every(function(item) { return item && item.ok; })) };
        return nd._portValues;
      }
      case 'host-send-geometry': {
        var sendHostId = ctrl.host || 'revit';
        var hostGeometry = getInput('geometry');
        var hostOptions = getInput('options') || { name: ctrl.name || 'Nova Geometry', category: ctrl.category || 'Generic Models' };
        var sendStarted = Date.now();
        var sendResult = getHostAdapter(sendHostId).sendGeometry(hostGeometry, hostOptions || {});
        if (sendResult && typeof sendResult.then === 'function') {
          return sendResult.then(function(result) {
            var sendLog = app._recordHostRequest({ nodeId: nd.id, host: sendHostId, operation: 'sendGeometry', options: hostOptions, durationMs: Date.now() - sendStarted, ok: !!(result && result.ok) });
            nd._debug = Object.assign({}, nd._debug || {}, { hostLog: sendLog });
            nd._portValues = { result: result, success: !!(result && result.ok) };
            return nd._portValues;
          });
        }
        var sendLogSync = app._recordHostRequest({ nodeId: nd.id, host: sendHostId, operation: 'sendGeometry', options: hostOptions, durationMs: Date.now() - sendStarted, ok: !!(sendResult && sendResult.ok) });
        nd._debug = Object.assign({}, nd._debug || {}, { hostLog: sendLogSync });
        nd._portValues = { result: sendResult, success: !!(sendResult && sendResult.ok) };
        return nd._portValues;
      }
      case 'rhino-objects-by-layer': {
        var layer = getInput('layer') || ctrl.layer || 'Default';
        var objects = getHostAdapter('rhino').getElements({ layer: layer });
        nd._portValues = { objects: objects, count: objects.length || 0 };
        return nd._portValues;
      }

      case 'revit-all-elements-view': {
        var allElems = RevitBridge.getAllElements();
        nd._portValues = { elements: allElems, count: allElems.length };
        return nd._portValues;
      }
      case 'revit-all-of-category': {
        var aocName = ctrl.category || 'Walls';
        var aocElems = RevitBridge.getElements(aocName);
        nd._portValues = { elements: aocElems, count: aocElems.length };
        return nd._portValues;
      }
      case 'revit-element-geometries': {
        var inputElems = getInput('elements');
        if (!inputElems) { nd._portValues = { meshes: [], count: 0 }; return nd._portValues; }
        if (!Array.isArray(inputElems)) inputElems = [inputElems];
        if (nd._liveGeometryResult) {
          nd._portValues = nd._liveGeometryResult;
          return nd._portValues;
        }
        var geoMeshes = RevitBridge.getGeometries(inputElems);
        nd._portValues = { meshes: geoMeshes, count: geoMeshes.length };
        return nd._portValues;
      }
      case 'revit-get-parameter-values': {
        if (nd._liveParameterGetResult) {
          nd._portValues = nd._liveParameterGetResult;
          return nd._portValues;
        }
        var getParamElems = getInput('elements');
        var getParamName = getInput('parameterName') || ctrl.parameterName || '';
        if (!getParamElems || !getParamName) { nd._portValues = { values: [], count: 0 }; return nd._portValues; }
        if (!Array.isArray(getParamElems)) getParamElems = [getParamElems];
        var paramValues = RevitBridge.getParameterValues(getParamElems, String(getParamName));
        nd._portValues = { values: paramValues, count: paramValues.length };
        return nd._portValues;
      }
      case 'revit-set-parameter-values': {
        if (nd._liveParameterSetResult) {
          nd._portValues = nd._liveParameterSetResult;
          return nd._portValues;
        }
        nd._portValues = { results: [], count: 0, success: false };
        return nd._portValues;
      }
      case 'revit-send-geometry': {
        if (nd._liveSendGeometryResult) {
          nd._portValues = nd._liveSendGeometryResult;
          return nd._portValues;
        }
        nd._portValues = {
          result: { ok: false, message: 'Run the graph with a live Revit connection to create geometry.' },
          elementId: '',
          success: false
        };
        return nd._portValues;
      }



      // ── Output ──

      case 'output-watch': case 'output-display': case 'output-log':

        return getInput('value');



      // ── Slow Compute (test cancellation) ──
      case 'slow-compute': {
        var delayMs = parseInt(ctrl.delayMs) || 5000;
        var inputVal = getInput('value');
        // Return a Promise that resolves after delayMs, giving the event loop
        // time to process the Cancel button click and abort the operation.
        return new Promise(function(resolve) {
          var checkInterval = setInterval(function() {
            if (nd._cancelled) {
              clearInterval(checkInterval);
              resolve(undefined);
              return;
            }
            if (Date.now() - startTime >= delayMs) {
              clearInterval(checkInterval);
              resolve(inputVal !== undefined ? inputVal : parseFloat(ctrl.value) || 0);
            }
          }, 100);
          var startTime = Date.now();
        });
      }

      // ── Python / Code ──

      case 'custom-python': case 'custom-code': {

        if (nd._pyResults) {

          var keys = Object.keys(nd._pyResults).filter(function(k) { return !k.startsWith('_') && k !== 'i' && k !== 'j' && k !== 'k'; });

          if (keys.length === 1) return nd._pyResults[keys[0]];

          if (keys.length > 1) return nd._pyResults;

        }

        // Auto-execute

        try {

          var inputs = {};

          (nd._dynInputs || ['input0']).forEach(function(pid) {

            var wire = app.wires.find(function(w) { return w.toNode === nd.id && w.toPort === pid; });

            if (wire) { var srcNd = app.nodes.find(function(n) { return n.id === wire.fromNode; }); if (srcNd) inputs[pid] = app.computeNodeValue(srcNd); }

          });

          var result = PythonRunner.execute(nd.controlValues.code || '', inputs);

          if (!result.error) {

            nd._pyResults = result.outputs;

            var outKeys = Object.keys(result.outputs).filter(function(k) { return !k.startsWith('_') && k !== 'i' && k !== 'j' && k !== 'k'; });

            if (outKeys.length > 0) nd._dynOutputs = outKeys;

            if (outKeys.length === 1) return result.outputs[outKeys[0]];

            if (outKeys.length > 1) return result.outputs;

          }

        } catch(e) {}

        return undefined;

      }



      default: return undefined;

    }

  }



  // ═══════════════════════════════════════

  // FORMAT VALUE — display any value nicely in Data Inspector

  // ═══════════════════════════════════════



  // Universal list display — collapsible, indexed, nested

  var _uListId = 0;

  app._fmtListUniversal = function(arr, depth) {

    depth = depth || 0;

    var tid = '_ul' + (++_uListId);

    var collapsed = depth > 0;

    var h = '<div class="data-list-view">';

    h += '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:1px 0" onclick="var b=document.getElementById(\'' + tid + '\');if(b){b.style.display=b.style.display===\'none\'?\'block\':\'none\';this.querySelector(\'.lc\').textContent=b.style.display===\'none\'?\'▸\':\'▾\'}">';

    h += '<span style="display:flex;align-items:center;gap:3px"><span class="lc" style="font-size:7px;color:var(--text-muted);width:8px">' + (collapsed ? '▸' : '▾') + '</span>';

    h += '<span style="font-size:8px;color:var(--text-muted)">List</span></span>';

    h += '<span style="font-size:8px;color:var(--accent-peach)">(' + arr.length + ')</span>';

    h += '</div>';

    h += '<div id="' + tid + '" class="data-list-body" style="display:' + (collapsed ? 'none' : 'block') + '">';

    var maxShow = arr.length;

    var showCount = Math.min(arr.length, maxShow);

    for (var i = 0; i < showCount; i++) {

      var item = arr[i];

      h += '<div style="display:flex;gap:4px;padding:1px 0;border-bottom:1px solid rgba(49,50,68,0.15)">';

      h += '<span style="color:var(--text-disabled);font-size:8px;min-width:16px;text-align:left;flex-shrink:0">' + i + '</span>';

      if (Array.isArray(item)) {

        h += '<div class="data-list-item">' + app._fmtListUniversal(item, depth + 1) + '</div>';

      } else {

        var disp, col;

        if (item === undefined || item === null) { disp = '—'; col = 'var(--text-muted)'; }

        else if (typeof item === 'number') { disp = Number.isInteger(item) ? String(item) : item.toFixed(3); col = 'var(--accent-green)'; }

        else if (typeof item === 'boolean') { disp = String(item); col = 'var(--accent-red)'; }

        else if (typeof item === 'string') { disp = '"' + item + '"'; col = 'var(--accent-yellow)'; }

        else if (item && item._type === 'RevitElement') { disp = '🏗 ' + item.category + ' [' + item.id + ']'; col = '#89dceb'; }
        else if (item && item._type) { disp = item.toString().substring(0, 24); col = 'var(--accent-blue)'; }

        else { disp = String(item).substring(0, 24); col = 'var(--accent-peach)'; }

        h += '<span class="data-list-item" style="color:' + col + ';font-size:9px">' + disp + '</span>';

      }

      h += '</div>';

    }

    if (arr.length > maxShow) h += '<div style="font-size:8px;color:var(--text-muted);padding:2px 0;text-align:center">… ' + (arr.length - maxShow) + ' more</div>';

    h += '</div></div>';

    return h;

  };

  app._fmtTreeValue = function(value, depth, label) {
    depth = depth || 0;
    var esc = app._escapeHTML || function(v) { return String(v); };
    var muted = 'var(--text-muted)';
    var pad = Math.min(depth * 10, 40);

    if (value === undefined) return '<span style="color:' + muted + '">-</span>';
    if (value === null) return '<span style="color:' + muted + '">null</span>';
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return app.formatValue(value);
    if (value && value.type === 'ErrorValue') {
      return '<details class="debug-tree error-value" open style="margin-left:' + pad + 'px;color:var(--accent-red)"><summary>Error: ' + esc(value.message) + '</summary>' +
        (value.nodeId ? '<div style="margin-left:12px;color:' + muted + '">Node: ' + esc(value.nodeId) + '</div>' : '') +
        (value.stack ? '<pre style="white-space:pre-wrap;margin:4px 0 0 12px;color:' + muted + ';font-size:10px">' + esc(value.stack.split('\n').slice(0, 4).join('\n')) + '</pre>' : '') +
        '</details>';
    }
    if (value && (value._type === 'RevitElement' || value.type === 'ElementRef' || value.type === 'GeometryRef')) {
      var elementLabel = value.name || value.category || value.type || value._type || 'Element';
      var elementId = value.id !== undefined ? ' [' + value.id + ']' : '';
      var params = value.parameters || value.params || value.metadata || {};
      var rows = Object.keys(params || {}).slice(0, 40).map(function(k) {
        return '<div style="margin-left:' + (pad + 12) + 'px"><span style="color:' + muted + '">' + esc(k) + ':</span> ' + app._fmtTreeValue(params[k], depth + 1) + '</div>';
      }).join('');
      return '<details class="debug-tree" open style="margin-left:' + pad + 'px"><summary><span style="color:#89dceb">' + esc(elementLabel) + esc(elementId) + '</span></summary>' + rows + '</details>';
    }
    if (Array.isArray(value)) {
      var maxItems = 30;
      var items = value.slice(0, maxItems).map(function(item, index) {
        return '<div style="margin-left:' + (pad + 12) + 'px"><span style="color:' + muted + '">[' + index + ']</span> ' + app._fmtTreeValue(item, depth + 1) + '</div>';
      }).join('');
      if (value.length > maxItems) items += '<div style="margin-left:' + (pad + 12) + 'px;color:' + muted + '">... ' + (value.length - maxItems) + ' more</div>';
      return '<details class="debug-tree data-list-view" ' + (depth < 1 ? 'open' : '') + ' style="margin-left:' + pad + 'px"><summary>List (' + value.length + ')</summary><div class="data-list-body">' + items + '</div></details>';
    }
    if (typeof value === 'object') {
      var objectKeys = Object.keys(value).filter(function(k) { return typeof value[k] !== 'function'; }).slice(0, 40);
      var title = label || value.type || value._type || 'Object';
      var body = objectKeys.map(function(k) {
        return '<div style="margin-left:' + (pad + 12) + 'px"><span style="color:' + muted + '">' + esc(k) + ':</span> ' + app._fmtTreeValue(value[k], depth + 1) + '</div>';
      }).join('');
      return '<details class="debug-tree" ' + (depth < 1 ? 'open' : '') + ' style="margin-left:' + pad + 'px"><summary>' + esc(title) + '</summary>' + body + '</details>';
    }
    return '<span style="color:var(--text-secondary)">' + esc(String(value)) + '</span>';
  };



  app.formatValue = function(val) {

    if (val === undefined) return '<span style="color:var(--text-muted)">—</span>';

    if (val === null) return '<span style="color:var(--text-muted)">null</span>';

    if (val && (val.type === 'ErrorValue' || val.type === 'ElementRef' || val.type === 'GeometryRef' || val._type === 'RevitElement')) return app._fmtTreeValue(val);

    if (val && val._type === 'RevitElement') return '<span style="color:#89dceb" title="' + val.name + ' | ' + val.typeName + '">🏗 ' + val.category + ' [' + val.id + ']</span>';
    if (val && val._type) return '<span style="color:var(--accent-teal)">' + val.toString() + '</span>';

    if (typeof val === 'boolean') return '<span style="color:var(--accent-red)">' + val + '</span>';

    if (typeof val === 'number') { var d = Number.isInteger(val) ? val : val.toFixed(4).replace(/\.?0+$/, ''); return '<span style="color:var(--accent-green)">' + d + '</span>'; }

    if (typeof val === 'string') return '<span style="color:var(--accent-yellow)">"' + val + '"</span>';

    if (Array.isArray(val)) return app._fmtTreeValue(val);

    if (val && typeof val === 'object') return app._fmtTreeValue(val);

    return '<span style="color:var(--text-secondary)">' + String(val) + '</span>';

  };



  // ═══════════════════════════════════════

  // NODE DATA HTML — Legacy, kept for backward compat only

  // The universal buildInspectorHTML in node-render-v2.js replaces this

  // ═══════════════════════════════════════



  app.nodeDataHTML = function(nd) {

    // Always delegate to universal inspector

    if (app._universalInspector) return app._universalInspector(nd);

    var r = '';

    this.beginCompute();

    var computed = this.computeNodeValue(nd);

    var controlIds = nd.def.controls ? nd.def.controls.map(function(c) { return c.id; }) : [];



    // Inputs

    nd.def.inputs.forEach(function(inp) {

      var wire = app.wires.find(function(w) { return w.toNode === nd.id && w.toPort === inp.id; });

      if (wire) {

        var srcNd = app.nodes.find(function(n) { return n.id === wire.fromNode; });

        app.computeNodeValue(srcNd);

        var srcVal;

        if (srcNd && srcNd._portValues && srcNd._portValues[wire.fromPort] !== undefined) srcVal = srcNd._portValues[wire.fromPort];

        else srcVal = srcNd ? app.computeNodeValue(srcNd) : undefined;

        r += '<div class="data-row"><span class="data-label">⊙ ' + inp.name + '</span>' + app.formatValue(srcVal) + '</div>';

      } else if (controlIds.indexOf(inp.id) >= 0) {

        var ctrl = nd.def.controls.find(function(c) { return c.id === inp.id; });

        var val = nd.controlValues[ctrl.id]; if (val === undefined || val === null) val = ctrl.default;

        r += '<div class="data-row"><span class="data-label">⚙ ' + ctrl.label + '</span><span style="color:var(--accent-green)">' + val + '</span></div>';

      } else {

        r += '<div class="data-row"><span class="data-label">⊙ ' + inp.name + '</span><span style="color:var(--text-muted)">—</span></div>';

      }

    });



    // Outputs

    if (nd.def.outputs.length > 0) {

      r += '<div style="border-top:1px solid rgba(49,50,68,0.8);margin-top:2px;padding-top:4px">';

      r += '<div style="font-size:9px;font-weight:600;color:var(--text-primary);margin-bottom:2px">▸ Output</div>';

      if (nd.def.outputs.length === 1) {

        r += '<div class="data-row">' + app.formatValue(computed) + '</div>';

      } else {

        nd.def.outputs.forEach(function(out) {

          var portVal = (nd._portValues && nd._portValues[out.id] !== undefined) ? nd._portValues[out.id] : (computed && computed[out.id] !== undefined ? computed[out.id] : undefined);

          r += '<div class="data-row"><span class="data-label" style="color:var(--text-secondary)">' + out.name + '</span>' + app.formatValue(portVal) + '</div>';

        });

      }

      r += '</div>';

    }



    this.endCompute();

    return r || '<span style="color:var(--text-muted)">No data</span>';

  };



  // ═══════════════════════════════════════

  // 3D RENDERING — code-based

  // ═══════════════════════════════════════



  app._renderFromCode = function() {

    if (!Viewer3D.isInitialized) {

      var vp = document.getElementById('viewport-3d');

      if (vp) Viewer3D.init(vp); else return;

    }

    Viewer3D.clearGeometry();



    var codeEl = document.getElementById('cv-code');

    var code = codeEl ? codeEl.value : '';

    if (!code || code.trim().length < 10) code = this.generateFullScript();

    if (!code || code.trim().length < 5) return;



    var result = PythonRunner.execute(code, {});

    if (result.error) { if (typeof NFLogger !== 'undefined') NFLogger.error('3d-render', 'Failed', { error: result.error }); return; }



    var rendered = 0;

    app._sceneItems = [];

    var keys = Object.keys(result.outputs);

    for (var i = 0; i < keys.length; i++) {

      var varName = keys[i];

      var val = result.outputs[varName];

      var nodeId = null;

      app.nodes.forEach(function(nd) { nd.def.outputs.forEach(function(out) { if (app.varName(nd.id, out.id) === varName) nodeId = nd.id; }); });

      var nd = nodeId ? app.nodes.find(function(n) { return n.id === nodeId; }) : null;

      if (nd && nd._preview3d === false) continue;



      if (val && val._type) {

        Geo.addToScene(Viewer3D.geometryGroup, val);

        app._sceneItems.push({ varName: varName, nodeId: nodeId, type: val._solidType || val._type, visible: true, idx: Viewer3D.geometryGroup.children.length - 1 });

        rendered++;

      } else if (Array.isArray(val)) {

        var startIdx = Viewer3D.geometryGroup.children.length;

        val.forEach(function(v) { if (v && (v._type || v instanceof Geo.Point3)) { Geo.addToScene(Viewer3D.geometryGroup, v); rendered++; } });

        if (Viewer3D.geometryGroup.children.length > startIdx) {

          app._sceneItems.push({ varName: varName, nodeId: nodeId, type: 'Array[' + (Viewer3D.geometryGroup.children.length - startIdx) + ']', visible: true, idxStart: startIdx, idxEnd: Viewer3D.geometryGroup.children.length - 1 });

        }

      }

    }

    if (rendered > 0) Viewer3D.fitAll();

    app._updateSceneTree();

  };



  // ═══════════════════════════════════════

  // RENDER FROM COMPUTE — uses node compute pipeline directly

  // Works with v2 nodes that pass Geo objects between ports

  // ═══════════════════════════════════════



  app._renderFromCompute = function() {

    if (!Viewer3D.isInitialized) {

      var vp = document.getElementById('viewport-3d');

      if (vp) Viewer3D.init(vp); else return;

    }

    Viewer3D.clearGeometry();



    this.beginCompute();

    var rendered = 0;

    app._sceneItems = [];

    var self = this;



    this.nodes.forEach(function(nd) {

      if (nd._preview3d === false) return;

      var val = self.computeNodeValue(nd);
      nd._lastComputedValue = val;



      // Single geometry value

      if (val && val._type) {

        Geo.addToScene(Viewer3D.geometryGroup, val);

        var startIdx = Viewer3D.geometryGroup.children.length - 1;

        app._sceneItems.push({ varName: nd.def.name, nodeId: nd.id, type: val._solidType || val._type, visible: true, idx: startIdx });

        rendered++;

      }

      // Array of geometry

      else if (Array.isArray(val)) {

        var startIdx = Viewer3D.geometryGroup.children.length;

        val.forEach(function(v) {

          if (v && (v._type || v instanceof Geo.Point3)) {

            Geo.addToScene(Viewer3D.geometryGroup, v);

            rendered++;

          }

        });

        if (Viewer3D.geometryGroup.children.length > startIdx) {

          app._sceneItems.push({ varName: nd.def.name, nodeId: nd.id, type: 'Array[' + (Viewer3D.geometryGroup.children.length - startIdx) + ']', visible: true, idxStart: startIdx, idxEnd: Viewer3D.geometryGroup.children.length - 1 });

        }

      }

      // Multi-output: check _portValues - iterate arrays of geometry objects

      if (nd._portValues) {

        Object.keys(nd._portValues).forEach(function(key) {

          if (key === 'count' || key === 'length' || key === 'index') return; // skip metadata

          var pv = nd._portValues[key];

          if (pv && pv._type) {

            Geo.addToScene(Viewer3D.geometryGroup, pv);

            rendered++;

          } else if (Array.isArray(pv)) {

            var arrStart = Viewer3D.geometryGroup.children.length;

            pv.forEach(function(v) {

              if (v && (v._type || v instanceof Geo.Point3)) {

                Geo.addToScene(Viewer3D.geometryGroup, v);

                rendered++;

              }

            });

            if (Viewer3D.geometryGroup.children.length > arrStart) {

              app._sceneItems.push({ varName: nd.def.name + '.' + key, nodeId: nd.id, type: 'Array[' + (Viewer3D.geometryGroup.children.length - arrStart) + ']', visible: true, idxStart: arrStart, idxEnd: Viewer3D.geometryGroup.children.length - 1 });

            }

          }

        });

      }

    });



    this.endCompute();



    if (rendered > 0) Viewer3D.fitAll();

    this._updateSceneTree();

    if (typeof NFLogger !== 'undefined') NFLogger.info('3d-render', 'Compute-based render', { objects: rendered });

  };



  // ═══════════════════════════════════════

  // SCENE TREE PANEL

  // ═══════════════════════════════════════



  app._updateSceneTree = function() {

    var panel = document.getElementById('scene-tree-panel');

    if (!panel) {

      panel = document.createElement('div');

      panel.id = 'scene-tree-panel';

      panel.style.cssText = 'position:absolute;top:8px;left:8px;z-index:10;background:rgba(24,24,37,0.92);backdrop-filter:blur(12px);border:1px solid rgba(69,71,90,0.5);border-radius:10px;max-width:280px;max-height:400px;overflow-y:auto;font-family:var(--font-sans);display:none;';

      var vp = document.getElementById('viewport-3d');

      if (vp) vp.appendChild(panel);

    }



    var items = app._sceneItems || [];

    if (items.length === 0) { panel.style.display = 'none'; return; }



    panel.style.display = 'block';

    var h = '<div style="padding:8px 12px;border-bottom:1px solid rgba(69,71,90,0.4);display:flex;align-items:center;gap:6px">';

    h += '<span style="font-size:11px;font-weight:700;color:var(--text-primary)">Scene</span>';

    h += '<span style="font-size:10px;color:var(--text-muted);margin-left:auto">' + items.length + ' objects</span>';

    h += '</div>';



    items.forEach(function(item, idx) {

      var nodeName = '';

      if (item.nodeId) {

        var nd = app.nodes.find(function(n) { return n.id === item.nodeId; });

        if (nd) nodeName = nd.def.name;

      }

      var displayName = nodeName || item.varName || 'Object';

      var bg = idx % 2 === 0 ? 'transparent' : 'rgba(49,50,68,0.25)';

      var eyeIcon = item.visible ? '<span style="color:#a6e3a1;font-size:14px">●</span>' : '<span style="color:#585b70;font-size:14px">○</span>';

      var opacity = item.visible ? '1' : '0.4';



      h += '<div style="display:flex;align-items:center;gap:6px;padding:4px 12px;background:' + bg + ';opacity:' + opacity + '">';

      h += '<button onclick="app._toggleSceneItem(' + idx + ')" style="background:none;border:none;cursor:pointer;font-size:12px;padding:0;line-height:1">' + eyeIcon + '</button>';

      h += '<span style="font-size:10px;font-weight:600;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + displayName + '</span>';

      h += '<span style="font-size:9px;color:var(--text-muted);white-space:nowrap">' + item.type + '</span>';

      h += '</div>';

    });



    panel.innerHTML = h;

  };



  // Toggle visibility of a scene item — syncs with node canvas

  app._toggleSceneItem = function(idx) {

    var items = app._sceneItems;

    if (!items || idx >= items.length) return;

    var item = items[idx];

    item.visible = !item.visible;



    // Toggle Three.js objects

    var group = Viewer3D.geometryGroup;

    if (item.idx !== undefined) {

      var obj = group.children[item.idx];

      if (obj) obj.visible = item.visible;

    } else if (item.idxStart !== undefined) {

      for (var i = item.idxStart; i <= item.idxEnd && i < group.children.length; i++) {

        group.children[i].visible = item.visible;

      }

    }



    // Sync with node — mark node as hidden/shown

    if (item.nodeId) {

      var nd = app.nodes.find(function(n) { return n.id === item.nodeId; });

      if (nd) {

        nd._preview3d = item.visible;

        // Visual feedback on node canvas — use class instead of inline opacity

        var el = document.getElementById(nd.id);

        if (el) el.classList.toggle('node-3d-hidden', !item.visible);

      }

    }



    app._updateSceneTree();

  };



  // ═══════════════════════════════════════

  // RUN PIPELINE — the single trigger

  // ═══════════════════════════════════════



  app._lastRunWires = [];

  app._graphDirty = true;



  // ── Cancel button helpers — canvas toolbar only ──
  app._showCancelButton = function() {
    var runBtn = document.getElementById('toolbar-run');
    if (runBtn) { runBtn.textContent = '■'; runBtn.style.color = 'var(--accent-red)'; runBtn.title = 'Cancel'; runBtn.onclick = app.cancelExecution; }
  };
  app._hideCancelButton = function() {
    var runBtn = document.getElementById('toolbar-run');
    if (runBtn) { runBtn.textContent = '▶'; runBtn.style.color = 'var(--accent-green)'; runBtn.title = 'Run Graph'; runBtn.onclick = function() { app.runGraph(); }; }
  };
  app._showCancelButton = function() {
    var runBtn = document.getElementById('toolbar-run');
    if (runBtn) {
      runBtn.textContent = '■';
      runBtn.style.color = 'var(--accent-red)';
      runBtn.style.background = 'rgba(243,139,168,0.16)';
      runBtn.title = 'Cancel';
      runBtn.onclick = app.cancelExecution;
    }
  };
  app._hideCancelButton = function() {
    var runBtn = document.getElementById('toolbar-run');
    if (runBtn) {
      runBtn.textContent = '▶';
      runBtn.style.color = 'var(--accent-green)';
      runBtn.style.background = '';
      runBtn.title = 'Run Graph';
      runBtn.onclick = function() { app.runGraph(); };
    }
  };
  app.cancelExecution = function() {
    // Cancel V2 engine if available
    var v2 = app._executionEngineV2;
    if (v2 && typeof v2.cancel === 'function') {
      v2.cancel();
    }
    app._hideCancelButton();
    if (typeof app.addAIMessage === 'function') {
      app.addAIMessage('workspace', '⏹ **Execution cancelled** by user.');
    }
  };

  app.runGraph = async function() {
    this._isRunningGraph = true;

    try {

    // Show cancel button
    app._showCancelButton();

    // 0. Refresh Revit data on Run if connected to a live session

    var runtimeGlobal = typeof globalThis !== 'undefined' ? globalThis : {};
    var revitClient = runtimeGlobal.NovaConnect || (runtimeGlobal.NodeFlow && runtimeGlobal.NodeFlow.NovaConnect) || null;
    if (revitClient && revitClient.status === 'connected') {
      var revitBridge = typeof RevitBridge !== 'undefined' ? RevitBridge : null;
      if (revitBridge && typeof revitBridge.refreshProject === 'function') {
        try {
          await revitBridge.refreshProject();
        } catch (err) {
          console.warn('[Revit] Could not refresh Revit data on Run:', err.message);
        }
      }
    }

    this._graphDirty = false;

    // 1. Generate code from graph, or use existing code viewer content

    var codeEl = document.getElementById('cv-code');

    var code = codeEl && codeEl.value && codeEl.value.trim().length > 20 ? codeEl.value : this.generateFullScript();

    this.showCodeViewer(code);



    // 2. Snapshot wires for animation

    this._lastRunWires = this.wires.map(function(w) { return w.fromNode + ':' + w.fromPort + '>' + w.toNode + ':' + w.toPort; });



    // 3. Execute and render 3D — use compute pipeline for v2 nodes

    await this._prepareLiveRevitGeometries();

    this._renderFromCompute();

    this.beginCompute();
    this.nodes.forEach(function(nd) {
      nd._lastComputedValue = app.computeNodeValue(nd);
      if (nd._portValues) nd._lastRunPortValues = Object.assign({}, nd._portValues);
    });
    this.endCompute();
    this._commitRunSnapshot();



    // 4. Refresh all Data Inspectors

    this.invalidateCompute();

    this.beginCompute();

    this.nodes.forEach(function(nd) {

      // Refresh inspector if open

      if (nd._inspOpen || nd.inspectorOpen) {

        var content = document.getElementById(nd.id + '-insp-content');

        if (content && app._universalInspector) {

          content.innerHTML = app._universalInspector(nd);

        }

      } else {

        // Nodes without open inspector: open data panel

        if (!nd.dataPanelOpen) {

          nd.dataPanelOpen = true;

          var p = document.getElementById(nd.id + '-data'); if (p) p.classList.add('open');

          var a = document.getElementById(nd.id + '-arrow'); if (a) a.textContent = '▾';

        }

        var dc = document.getElementById(nd.id + '-dc');

        if (dc) dc.innerHTML = app.nodeDataHTML(nd);

      }

      // Reset any opacity overrides from scene tree toggling

      var el = document.getElementById(nd.id);

      if (el) el.style.opacity = '';

    });

    this.endCompute();



    // 5. Re-render wires with animation (reset dirty after invalidateCompute set it)

    this._graphDirty = false;

    this.renderWires();
    if (this.refreshNodeWarningBadges) this.refreshNodeWarningBadges();



    // Log full graph state for debugging

    if (typeof NFLogger !== 'undefined') {

      var nodeList = this.nodes.map(function(n) { return { id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y) }; });

      var wireList = this.wires.map(function(w) { return w.fromNode + ':' + w.fromPort + '>' + w.toNode + ':' + w.toPort; });

      var nodeIdSet = {};

      this.nodes.forEach(function(n) { nodeIdSet[n.id] = true; });

      var orphans = wireList.filter(function(wk) {

        var parts = wk.split('>');

        return !nodeIdSet[parts[0].split(':')[0]] || !nodeIdSet[parts[1].split(':')[0]];

      });

      NFLogger.info('graph-state', 'After Run', { nodes: nodeList, wires: wireList, orphanWires: orphans });

    }



    this.addAIMessage('workspace', '▶️ **Executed!** ' + this.nodes.length + ' nodes → 3D updated.');

    app._hideCancelButton();

    } finally {
      this._isRunningGraph = false;
    }

  };



  // ═══════════════════════════════════════

  // VIEW SWITCHING — just show/hide, no re-execute

  // ═══════════════════════════════════════



  app.setView = function(mode) {

    this.currentView = mode;

    var nc = document.getElementById('node-canvas'), ws = document.getElementById('wire-svg'), gs = document.getElementById('canvas-grid-svg'), vp = document.getElementById('viewport-3d');

    var b2d = document.getElementById('btn-view-nodes'), b3d = document.getElementById('btn-view-3d');



    if (mode === '3d') {

      if (nc) nc.style.display = 'none'; if (ws) ws.style.display = 'none'; if (gs) gs.style.display = 'none';

      if (vp) vp.style.display = 'block';

      if (b2d) { b2d.style.color = ''; b2d.style.fontWeight = ''; }

      if (b3d) { b3d.style.color = 'var(--accent-blue)'; b3d.style.fontWeight = '700'; }

      if (!Viewer3D.isInitialized && vp) Viewer3D.init(vp);

      Viewer3D.show();

      var sp = document.getElementById('scene-tree-panel');

      if (sp && Viewer3D.geometryGroup && Viewer3D.geometryGroup.children.length > 0) sp.style.display = 'block';

    } else {

      if (nc) nc.style.display = ''; if (ws) ws.style.display = ''; if (gs) gs.style.display = '';

      if (vp) vp.style.display = 'none';

      if (b2d) { b2d.style.color = 'var(--accent-blue)'; b2d.style.fontWeight = '700'; }

      if (b3d) { b3d.style.color = ''; b3d.style.fontWeight = ''; }

      Viewer3D.hide();

      setTimeout(function() { app.renderWires(); }, 50);

    }

  };



  // ═══════════════════════════════════════

  // WIRE RENDERING — animate only after Run

  // ═══════════════════════════════════════



  app.renderWires = function() {

    var svg = document.getElementById('wire-svg');

    var area = document.getElementById('canvas-area');

    if (!svg || !area) return;

    var ar = area.getBoundingClientRect();

    var s = '';



    // Pre-clean: remove wires to non-existent nodes

    var existingNodes = {};

    this.nodes.forEach(function(n) { existingNodes[n.id] = true; });

    this.wires = this.wires.filter(function(w) { return existingNodes[w.fromNode] && existingNodes[w.toNode]; });



    this.wires.forEach(function(w, i) {

      if (!document.getElementById(w.fromNode) || !document.getElementById(w.toNode)) return;

      var fd = document.querySelector('#' + w.fromNode + ' .port-dot[data-port="' + w.fromPort + '"][data-dir="output"]');

      var td = document.querySelector('#' + w.toNode + ' .port-dot[data-port="' + w.toPort + '"][data-dir="input"]');

      if (!fd || !td) {

        if (typeof NFLogger !== 'undefined') NFLogger.warn('wire-render', 'Port dot missing', { from: w.fromNode + ':' + w.fromPort, to: w.toNode + ':' + w.toPort, fromFound: !!fd, toFound: !!td });

        return;

      }

      // Skip wires to hidden port dots (e.g. in collapsed v2 Properties panel)

      var fdRect = fd.getBoundingClientRect();

      var tdRect = td.getBoundingClientRect();

      if ((fdRect.width === 0 && fdRect.height === 0) || (tdRect.width === 0 && tdRect.height === 0)) {

        // Port is hidden — auto-open the Properties panel

        var hiddenNode = (fdRect.width === 0) ? w.fromNode : w.toNode;

        var nd = app.nodes.find(function(n) { return n.id === hiddenNode; });

        if (nd && !nd._propsOpen) {

          nd._propsOpen = true;

          var section = document.getElementById(hiddenNode + '-props-section');

          if (section) section.classList.add('open');

          // Re-get the rects after opening

          fdRect = fd.getBoundingClientRect();

          tdRect = td.getBoundingClientRect();

        }

        // If still hidden, skip

        if ((fdRect.width === 0 && fdRect.height === 0) || (tdRect.width === 0 && tdRect.height === 0)) return;

      }

      var fr = fdRect, tr = tdRect;

      var x1 = fr.left+fr.width/2-ar.left, y1 = fr.top+fr.height/2-ar.top;

      var x2 = tr.left+tr.width/2-ar.left, y2 = tr.top+tr.height/2-ar.top;

      var dx = Math.max(Math.abs(x2-x1)*0.5, 50);

      var c = app.getWireColor(w);

      var d = 'M'+x1+','+y1+' C'+(x1+dx)+','+y1+' '+(x2-dx)+','+y2+' '+x2+','+y2;

      s += '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="2.5" opacity="0.7"/>';



      var key = w.fromNode+':'+w.fromPort+'>'+w.toNode+':'+w.toPort;

      if (app._lastRunWires.indexOf(key) >= 0 && !app._graphDirty) {

        var dur = (2.5+i*0.4).toFixed(1);

        s += '<circle r="3" fill="'+c+'" opacity="0"><animateMotion dur="'+dur+'s" repeatCount="indefinite" path="'+d+'"/><animate attributeName="opacity" values="0;0;0.9;0.9;0.9;0;0" keyTimes="0;0.05;0.15;0.5;0.85;0.95;1" dur="'+dur+'s" repeatCount="indefinite"/></circle>';

      }

    });



    if (this.connectingWire) {

      var cw = this.connectingWire, cdx = Math.max(Math.abs(cw.endX-cw.startX)*0.5, 40);

      if (cw.fromDir === 'output') s += '<path class="wire-connecting" d="M'+cw.startX+','+cw.startY+' C'+(cw.startX+cdx)+','+cw.startY+' '+(cw.endX-cdx)+','+cw.endY+' '+cw.endX+','+cw.endY+'" fill="none" stroke="#89b4fa" stroke-width="2"/>';

      else s += '<path class="wire-connecting" d="M'+cw.endX+','+cw.endY+' C'+(cw.endX+cdx)+','+cw.endY+' '+(cw.startX-cdx)+','+cw.startY+' '+cw.startX+','+cw.startY+'" fill="none" stroke="#89b4fa" stroke-width="2"/>';

    }



    svg.innerHTML = '<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' + s;

  };



  // ═══════════════════════════════════════

  // ZOOM ISOLATION — 3D and node canvas independent

  // ═══════════════════════════════════════



  setTimeout(function() {

    var vp = document.getElementById('viewport-3d');

    if (vp) {

      vp.addEventListener('wheel', function(e) { e.stopPropagation(); }, false);

      vp.addEventListener('mousedown', function(e) { e.stopPropagation(); }, false);

    }

    var area = document.getElementById('canvas-area');

    if (area) {

      area.addEventListener('wheel', function(e) {

        if (app.currentView === '3d') return;

        e.preventDefault(); e.stopImmediatePropagation();

        var rect = area.getBoundingClientRect();

        var mx = e.clientX - rect.left, my = e.clientY - rect.top;

        var oldZ = app.zoom, newZ = Math.max(0.25, Math.min(3, oldZ + (e.deltaY > 0 ? -0.08 : 0.08)));

        var scale = newZ / oldZ;

        app.panX = mx - scale * (mx - app.panX);

        app.panY = my - scale * (my - app.panY);

        app.zoom = newZ;

        app.applyTransform();

        var zi = document.getElementById('zoom-indicator'); if (zi) zi.textContent = Math.round(app.zoom * 100) + '%';

      }, { passive: false, capture: true });

    }

  }, 500);



  // ═══════════════════════════════════════

  // APPROVE CODE — triggers Run after building graph

  // ═══════════════════════════════════════



  // ═══════════════════════════════════════

  // RUN EDITED CODE — parse code → build node graph

  // ═══════════════════════════════════════
  app.runEditedCode = function() {
    var codeEl = document.getElementById('cv-code');
    if (!codeEl) return;
    try {
      var graph = CodeParser.parseToGraph(codeEl.value);
      if (graph.nodes.length === 0) { this.addAIMessage('workspace', '⚠️ No operations found.'); return; }
      this.nodes.forEach(function(nd) { var el = document.getElementById(nd.id); if (el) el.remove(); });
      this.nodes = []; this.wires = []; this.selectedNodes = []; this.nextNodeId = graph.nextId;
      document.getElementById('wire-svg').innerHTML = '';
      var created = [], self = this;
      graph.nodes.forEach(function(gn) {
        var def = NODE_TYPE_MAP[gn.type]; if (!def) return;
        self.nodeZCounter++;
        var nd = { id: gn.id, type: gn.type, x: gn.x, y: gn.y, def: Object.assign({}, def), controlValues: {}, dataPanelOpen: false, zIndex: self.nodeZCounter };
        def.controls.forEach(function(c) { nd.controlValues[c.id] = c.default; });
        Object.keys(gn.controls).forEach(function(k) { if (k !== '_dynInputs') nd.controlValues[k] = gn.controls[k]; });
        if (gn.type === 'custom-python' && gn.rawCode) nd.controlValues.code = gn.rawCode;
        if (gn.type === 'custom-python' && gn.controls._dynInputs) nd._dynInputs = gn.controls._dynInputs;
        if (gn.outputVars && gn.outputVars.length > 0) nd._dynOutputs = gn.outputVars;
        self.nodes.push(nd); self.renderNode(nd); created.push(nd.def.name);
      });
      graph.wires.forEach(function(w) { self.wires.push(w); });
      this.updatePortDots(); setTimeout(function() { self.renderWires(); }, 50); this.updateMenuState();
      // Log parsed graph state
      if (typeof NFLogger !== 'undefined') {
        var nids = {}; self.nodes.forEach(function(n) { nids[n.id] = true; });
        var wkeys = self.wires.map(function(w) { return w.fromNode + ':' + w.fromPort + '>' + w.toNode + ':' + w.toPort; });
        var orphans = wkeys.filter(function(wk) { var p = wk.split('>'); return !nids[p[0].split(':')[0]] || !nids[p[1].split(':')[0]]; });
        NFLogger.info('code-to-node', 'Parsed graph', { nodes: self.nodes.map(function(n) { return { id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y) }; }), wires: wkeys, orphanWires: orphans });
      }
      this.addAIMessage('workspace', '✅ **Built graph!** ' + created.length + ' nodes, ' + graph.wires.length + ' wires.');
    } catch(err) { this.addAIMessage('workspace', '❌ Parse error: ' + err.message); }
  };

  var origApprove = app.approveCode.bind(app);
  app.approveCode = function() {
    origApprove();
    setTimeout(function() { app.runGraph(); }, 300);
  };

  // ═══════════════════════════════════════
  // RUN EDITED CODE — code viewer → parse → build graph
  // ═══════════════════════════════════════
  app.runEditedCode = function() {
    var codeEl = document.getElementById('cv-code');
    if (!codeEl) return;
    var code = codeEl.value;
    try {
      var graph = CodeParser.parseToGraph(code);
      if (graph.nodes.length === 0) { this.addAIMessage('workspace', '⚠️ Could not parse any operations.'); return; }
      this.nodes.forEach(function(nd) { var el = document.getElementById(nd.id); if (el) el.remove(); });
      this.nodes = []; this.wires = []; this.selectedNodes = []; this.nextNodeId = graph.nextId;
      document.getElementById('wire-svg').innerHTML = '';
      var created = [];
      var self = this;
      graph.nodes.forEach(function(gn) {
        var def = NODE_TYPE_MAP[gn.type]; if (!def) return;
        self.nodeZCounter++;
        var nd = { id: gn.id, type: gn.type, x: gn.x, y: gn.y, def: Object.assign({}, def), controlValues: {}, dataPanelOpen: false, zIndex: self.nodeZCounter };
        def.controls.forEach(function(c) { nd.controlValues[c.id] = c.default; });
        Object.keys(gn.controls).forEach(function(k) { if (k !== '_dynInputs') nd.controlValues[k] = gn.controls[k]; });
        if (gn.type === 'custom-python' && gn.rawCode) nd.controlValues.code = gn.rawCode;
        if (gn.type === 'custom-python' && gn.controls._dynInputs) nd._dynInputs = gn.controls._dynInputs;
        if (gn.outputVars && gn.outputVars.length > 0) nd._dynOutputs = gn.outputVars;
        self.nodes.push(nd); self.renderNode(nd); created.push(nd.def.name);
      });
      graph.wires.forEach(function(w) { self.wires.push(w); });
      this.updatePortDots();
      setTimeout(function() { self.renderWires(); }, 50);
      this.updateMenuState();
      var typeCount = {};
      created.forEach(function(n) { typeCount[n] = (typeCount[n] || 0) + 1; });
      var summary = Object.keys(typeCount).map(function(k) { return '**' + k + '** ×' + typeCount[k]; }).join(', ');
      this.addAIMessage('workspace', '✅ **Built graph!** ' + created.length + ' nodes: ' + summary);
    } catch(err) {
      this.addAIMessage('workspace', '❌ Parse error: ' + err.message);
    }
  };

  // ═══════════════════════════════════════
  // AUTO LAYOUT — arrange nodes in clean columns
  // ═══════════════════════════════════════
  app.autoLayout = function() {
    if (this.nodes.length === 0) return;
    var MARGIN_X = 60;
    var MARGIN_Y = 15;
    var self = this;
    // 1. Build adjacency: which nodes feed into which
    var incoming = {}; // nodeId → [sourceNodeIds]
    var outgoing = {}; // nodeId → [targetNodeIds]
    this.nodes.forEach(function(n) { incoming[n.id] = []; outgoing[n.id] = []; });
    this.wires.forEach(function(w) {
      if (incoming[w.toNode] && outgoing[w.fromNode]) {
        incoming[w.toNode].push(w.fromNode);
        outgoing[w.fromNode].push(w.toNode);
      }
    });
    // 2. Assign depth (column) via topological sort
    var depth = {};
    var visited = {};
    function assignDepth(nodeId) {
      if (visited[nodeId]) return depth[nodeId] || 0;
      visited[nodeId] = true;
      var maxParentDepth = -1;
      incoming[nodeId].forEach(function(srcId) {
        var d = assignDepth(srcId);
        if (d > maxParentDepth) maxParentDepth = d;
      });
      depth[nodeId] = maxParentDepth + 1;
      return depth[nodeId];
    }
    this.nodes.forEach(function(n) { assignDepth(n.id); });
    // 3. Group by column
    var columns = {};
    var maxCol = 0;
    this.nodes.forEach(function(n) {
      var col = depth[n.id] || 0;
      if (!columns[col]) columns[col] = [];
      columns[col].push(n);
      if (col > maxCol) maxCol = col;
    });
    // 4. Measure node heights (from DOM)
    var nodeHeights = {};
    this.nodes.forEach(function(n) {
      var el = document.getElementById(n.id);
      nodeHeights[n.id] = el ? el.offsetHeight || 100 : 100;
    });
    // 5. Position nodes column by column
    var startX = 60;
    var maxColWidth = 0;
    var currentX = startX;
    for (var col = 0; col <= maxCol; col++) {
      var colNodes = columns[col] || [];
      if (colNodes.length === 0) continue;
      // Find widest node in column
      var colWidth = 0;
      colNodes.forEach(function(n) {
        var el = document.getElementById(n.id);
        var w = el ? el.offsetWidth || 180 : 180;
        if (w > colWidth) colWidth = w;
      });
      // Sort vertically: try to keep nodes near their connected sources
      colNodes.sort(function(a, b) {
        var aAvg = 0, bAvg = 0, aCnt = 0, bCnt = 0;
        incoming[a.id].forEach(function(src) {
          var srcNd = self.nodes.find(function(n) { return n.id === src; });
          if (srcNd) { aAvg += srcNd.y; aCnt++; }
        });
        incoming[b.id].forEach(function(src) {
          var srcNd = self.nodes.find(function(n) { return n.id === src; });
          if (srcNd) { bAvg += srcNd.y; bCnt++; }
        });
        aAvg = aCnt > 0 ? aAvg / aCnt : a.y;
        bAvg = bCnt > 0 ? bAvg / bCnt : b.y;
        return aAvg - bAvg;
      });
      // Place vertically with no overlap
      var currentY = 60;
      colNodes.forEach(function(n) {
        n.x = currentX;
        n.y = currentY;
        var el = document.getElementById(n.id);
        if (el) {
          el.style.left = n.x + 'px';
          el.style.top = n.y + 'px';
        }
        currentY += (nodeHeights[n.id] || 100) + MARGIN_Y;
      });
      currentX += colWidth + MARGIN_X;
    }
    // 6. Remove orphan wires pointing to non-existent nodes
    var nodeIds = {};
    this.nodes.forEach(function(n) { nodeIds[n.id] = true; });
    var before = this.wires.length;
    this.wires = this.wires.filter(function(w) { return nodeIds[w.fromNode] && nodeIds[w.toNode]; });
    if (this.wires.length < before && typeof NFLogger !== 'undefined') NFLogger.warn('layout', 'Removed ' + (before - this.wires.length) + ' orphan wires');
    this.updatePortDots();
    // 7. De-overlap nodes
    var posMap = {};
    this.nodes.forEach(function(n) {
      var key = Math.round(n.x / 20) + ',' + Math.round(n.y / 20);
      while (posMap[key]) {
        n.y += (nodeHeights[n.id] || 100) + MARGIN_Y;
        key = Math.round(n.x / 20) + ',' + Math.round(n.y / 20);
      }
      posMap[key] = n.id;
      var el = document.getElementById(n.id);
      if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
    });
    // 8. Ensure no node is off-screen
    var minX = Infinity, minY = Infinity;
    this.nodes.forEach(function(n) { if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y; });
    if (minX < 60 || minY < 60) {
      var ox = minX < 60 ? 60 - minX : 0;
      var oy = minY < 60 ? 60 - minY : 0;
      this.nodes.forEach(function(n) {
        n.x += ox; n.y += oy;
        var el = document.getElementById(n.id);
        if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
      });
    }
    // 7. Re-render wires and zoom to fit all nodes
    setTimeout(function() { self.renderWires(); }, 50);
    // Calculate bounding box of all nodes
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.nodes.forEach(function(n) {
      var el = document.getElementById(n.id);
      var w = el ? el.offsetWidth || 180 : 180;
      var h = el ? el.offsetHeight || 100 : 100;
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + w > maxX) maxX = n.x + w;
      if (n.y + h > maxY) maxY = n.y + h;
    });
    var area = document.getElementById('canvas-area');
    if (area && maxX > minX && maxY > minY) {
      var areaW = area.clientWidth - 300; // leave room for chat panel
      var areaH = area.clientHeight - 100;
      var graphW = maxX - minX + 80;
      var graphH = maxY - minY + 80;
      var zoomX = areaW / graphW;
      var zoomY = areaH / graphH;
      var newZoom = Math.min(zoomX, zoomY, 1); // don't zoom in past 100%
      newZoom = Math.max(0.25, Math.min(1, newZoom));
      this.zoom = newZoom;
      this.panX = (areaW / 2) - ((minX + maxX) / 2) * newZoom;
      this.panY = (areaH / 2) - ((minY + maxY) / 2) * newZoom + 40;
      this.applyTransform();
      var zi = document.getElementById('zoom-indicator');
      if (zi) zi.textContent = Math.round(this.zoom * 100) + '%';
    }
  };
  // Call auto-layout after runEditedCode builds the graph
  var origRunEditedForLayout = app.runEditedCode.bind(app);
  app.runEditedCode = function() {
    origRunEditedForLayout();
    setTimeout(function() { app.autoLayout(); app.fitAll(); }, 100);
  };
  // Add Auto Layout to right-click context menu
  var origCtxAction = app.ctxAction.bind(app);
  app.ctxAction = function(a) {
    if (a === 'layout') { this.hideContextMenu(); this.autoLayout(); return; }
    origCtxAction(a);
  };
  // Patch context menu to include Auto Layout option
  var origShowContextMenu = app.showContextMenu.bind(app);
  app.showContextMenu = function(x, y) {
    var m = document.getElementById('context-menu');
    m.innerHTML = '<button class="context-menu-item" onclick="app.ctxAction(\'add\')"><span class="cmi-icon">+</span> Add Node…</button>' +
      '<div class="menu-separator"></div>' +
      '<button class="context-menu-item" onclick="app.ctxAction(\'fit\')"><span class="cmi-icon">⊞</span> Zoom to Fit</button>' +
      '<button class="context-menu-item" onclick="app.ctxAction(\'layout\')"><span class="cmi-icon">⊞</span> Auto Layout</button>';
    m.style.left = x + 'px'; m.style.top = y + 'px'; m.classList.add('visible');
  };

  if (typeof NFLogger !== 'undefined') NFLogger.info('engine', 'Engine v1 loaded');

  return true;
}

// Note: auto-install is intentionally removed — main.js handles
// initialization order (installEngine → initializeApp → ExecutionEngine.attach)
// A second auto-run here would overwrite V2 engine patches.

export default installEngine;
