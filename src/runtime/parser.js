import { NODE_TYPE_MAP } from '../core/nodes.js';

/* eslint-disable no-unused-vars */

// ============================================
// NODEFLOW AI — Universal Code Parser v6
// PRINCIPLE:
// - Maximize use of visual nodes (Number, Point, Box, etc.)
// - Geo.* calls → map to matching visual nodes when possible
// - Only use Python nodes for blocks that have NO visual equivalent
//   (loops with .append, complex functions, etc.)
// - Variables flow between nodes via auto-wiring
// ============================================

const CodeParser = {

  CONSTANTS: {
    'math.pi': '3.14159265', 'math.e': '2.71828183', 'math.tau': '6.28318530',
    'math.inf': 'Infinity'
  },

  BIN_OPS: {
    '+': 'math-add', '-': 'math-subtract', '*': 'math-multiply',
    '/': 'math-divide', '**': 'math-power'
  },

  // ── MAIN ENTRY ──
  parseToGraph(code) {
    const blocks = this.splitIntoBlocks(code);
    const graphNodes = [];
    const varToNode = {};
    let nextId = 1;
    const sp = { x: 200, y: 120 };
    let col = 0;

    blocks.forEach(block => {
      if (block.type === 'skip') return;

      let nodeType = null, controls = {}, inputRefs = {}, outputVars = [];

      if (block.type === 'assign') {
        const result = this.analyzeExpr(block.expression);
        if (result.type === 'reference') {
          varToNode[block.variable] = varToNode[result.name] || null;
          return;
        }
        nodeType = result.type;
        controls = result.controls || {};
        inputRefs = result.inputs || {};
        outputVars = [block.variable];
      }
      else if (block.type === 'call') {
        const result = this.analyzeExpr(block.code);
        nodeType = result.type;
        controls = result.controls || {};
        inputRefs = result.inputs || {};
      }
      else if (block.type === 'multiline') {
        const analysis = this._analyzeBlock(block.code, Object.keys(varToNode));
        nodeType = 'custom-python';
        // Use variable names as port IDs so wires match and code reads naturally
        inputRefs = {};
        const dynInputNames = [];
        analysis.reads.forEach(v => {
          if (varToNode[v]) {
            inputRefs[v] = v;  // port ID = variable name
            dynInputNames.push(v);
          }
        });
        // Store dynInputs so renderNode creates matching ports
        controls = { code: block.code, _dynInputs: dynInputNames };
        outputVars = analysis.writes;
      }

      if (!nodeType) {
        nodeType = 'custom-python';
        controls = { code: block.code || block.expression || '' };
      }

      const nodeId = 'node-' + nextId++;

      // Position based on dependencies
      const depCols = Object.values(inputRefs)
        .map(ref => {
          if (typeof ref !== 'string') return -1;
          const src = varToNode[ref];
          if (!src) return -1;
          const srcNode = graphNodes.find(n => n.id === src.nodeId);
          return srcNode ? Math.floor((srcNode.x - 80) / sp.x) : -1;
        }).filter(c => c >= 0);

      if (depCols.length > 0) col = Math.max(...depCols) + 1;
      const row = graphNodes.filter(n => Math.abs(n.x - (80 + col * sp.x)) < 50).length;

      const gn = {
        id: nodeId, type: nodeType, variable: outputVars[0] || null,
        controls, inputRefs, rawCode: block.code || block.expression || '',
        outputVars,
        x: 80 + col * sp.x, y: 80 + row * sp.y
      };
      graphNodes.push(gn);

      outputVars.forEach(v => {
        if (nodeType === 'custom-python' || nodeType === 'custom-code') {
          // Python nodes: use variable name as port ID so _getNodeOutput can find it
          varToNode[v] = { nodeId, portId: v };
        } else {
          const def = NODE_TYPE_MAP[nodeType];
          const firstOut = def && def.outputs.length > 0 ? def.outputs[0].id : 'output0';
          varToNode[v] = { nodeId, portId: firstOut };
        }
      });
      if (outputVars.length === 0 && block.variable) {
        const def = NODE_TYPE_MAP[nodeType];
        const firstOut = def && def.outputs.length > 0 ? def.outputs[0].id : 'value';
        varToNode[block.variable] = { nodeId, portId: firstOut };
      }
    });

    // Resolve wires
    const wires = [];
    graphNodes.forEach(gn => {
      const def = NODE_TYPE_MAP[gn.type];
      if (!def) return;

      Object.keys(gn.inputRefs).forEach(portId => {
        const ref = gn.inputRefs[portId];
        if (!ref || ref === '_') return;

        const src = varToNode[ref];
        if (src && src.nodeId) {
          wires.push({ fromNode: src.nodeId, fromPort: src.portId, toNode: gn.id, toPort: portId });
          return;
        }

        if (this.CONSTANTS[ref]) {
          const litId = 'node-' + nextId++;
          graphNodes.push({ id: litId, type: 'number-input', variable: null, controls: { val: this.CONSTANTS[ref] }, inputRefs: {}, rawCode: ref, outputVars: [], x: gn.x - sp.x, y: gn.y });
          wires.push({ fromNode: litId, fromPort: 'value', toNode: gn.id, toPort: portId });
          return;
        }
        if (/^-?[\d.]+$/.test(ref)) {
          const litId = 'node-' + nextId++;
          graphNodes.push({ id: litId, type: 'number-input', variable: null, controls: { val: ref }, inputRefs: {}, rawCode: ref, outputVars: [], x: gn.x - sp.x, y: gn.y });
          wires.push({ fromNode: litId, fromPort: 'value', toNode: gn.id, toPort: portId });
          return;
        }
        if (/^["'].*["']$/.test(ref)) {
          const litId = 'node-' + nextId++;
          graphNodes.push({ id: litId, type: 'text-input', variable: null, controls: { val: ref.slice(1, -1) }, inputRefs: {}, rawCode: ref, outputVars: [], x: gn.x - sp.x, y: gn.y });
          wires.push({ fromNode: litId, fromPort: 'value', toNode: gn.id, toPort: portId });
        }
      });
    });

    return { nodes: graphNodes, wires, nextId };
  },

  // ══════════════════════════════════════
  // BLOCK SPLITTER — smarter grouping
  // var = [] + for loop → merged into one multiline block
  // Everything else → per-line
  // ══════════════════════════════════════
  splitIntoBlocks(code) {
    const lines = code.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') ||
          trimmed.startsWith('import ') || trimmed.startsWith('from ') ||
          trimmed.startsWith('using ') || /^-+$/.test(trimmed)) {
        blocks.push({ type: 'skip' });
        i++; continue;
      }

      // Check for "var = []" followed by a for-loop that appends to var → merge
      const emptyListMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\[\s*\]$/);
      if (emptyListMatch) {
        const listVar = emptyListMatch[1];
        // Peek ahead: is the next non-empty line a for/while loop?
        let peekIdx = i + 1;
        while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
        if (peekIdx < lines.length && /^(for |while )/.test(lines[peekIdx].trim())) {
          // Merge: start with the empty list init, then the loop block
          const blockLines = [raw];
          i++;
          // skip blanks
          while (i < lines.length && !lines[i].trim()) { blockLines.push(''); i++; }
          // collect loop + body
          if (i < lines.length) {
            const loopRaw = lines[i];
            blockLines.push(loopRaw);
            const baseIndent = loopRaw.search(/\S/);
            i++;
            while (i < lines.length) {
              const nextRaw = lines[i];
              const nextTrimmed = nextRaw.trim();
              if (!nextTrimmed) { blockLines.push(''); i++; continue; }
              const nextIndent = nextRaw.search(/\S/);
              if (nextIndent > baseIndent || /^(elif |else:|except|finally:)/.test(nextTrimmed)) {
                blockLines.push(nextRaw); i++;
              } else break;
            }
          }
          blocks.push({ type: 'multiline', code: blockLines.join('\n').trimEnd() });
          continue;
        }
      }

      // Indented block starters → collect as multiline
      const blockStarters = /^(for |while |if |elif |else:|def |class |with |try:|except|finally:)/;
      if (blockStarters.test(trimmed)) {
        const blockLines = [raw];
        const baseIndent = raw.search(/\S/);
        i++;
        while (i < lines.length) {
          const nextRaw = lines[i];
          const nextTrimmed = nextRaw.trim();
          if (!nextTrimmed) { blockLines.push(''); i++; continue; }
          const nextIndent = nextRaw.search(/\S/);
          if (nextIndent > baseIndent || /^(elif |else:|except|finally:)/.test(nextTrimmed)) {
            blockLines.push(nextRaw); i++;
          } else break;
        }
        blocks.push({ type: 'multiline', code: blockLines.join('\n').trimEnd() });
        continue;
      }

      // Augmented assignment
      const augMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+=|-=|\*=|\/=)\s*(.+)$/);
      if (augMatch) {
        const opMap = {'+=':'+','-=':'-','*=':'*','/=':'/'};
        blocks.push({ type: 'assign', variable: augMatch[1], expression: augMatch[1] + ' ' + opMap[augMatch[2]] + ' ' + augMatch[3].trim(), code: trimmed });
        i++; continue;
      }

      // Normal assignment — strip inline comments before extracting expression
      const assignMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
      if (assignMatch) {
        var rawExpr = assignMatch[2].trim();
        // Strip inline # comments (but not inside strings)
        var stripped = this._stripComment(rawExpr);
        blocks.push({ type: 'assign', variable: assignMatch[1], expression: stripped, code: trimmed });
        i++; continue;
      }

      // Standalone .append() call → skip as node (handled inside Python block or silently)
      if (/^[a-zA-Z_][a-zA-Z0-9_]*\.append\(.+\)\s*$/.test(trimmed)) {
        // append() is part of list building — it doesn't map to a visual node
        // It should have been merged into a multiline block with the list init + for loop
        // If we get here as a standalone line, skip it (the list is already tracked)
        blocks.push({ type: 'skip' });
        i++; continue;
      }

      // Standalone call
      if (/^[a-zA-Z_][a-zA-Z0-9_.]*\(.*\)\s*$/.test(trimmed)) {
        blocks.push({ type: 'call', code: trimmed });
        i++; continue;
      }

      blocks.push({ type: 'multiline', code: trimmed });
      i++;
    }

    return blocks;
  },

  // Analyze a block for reads/writes
  _analyzeBlock(code, knownVars) {
    const reads = new Set();
    const writes = new Set();
    const knownSet = new Set(knownVars);

    code.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('import ')) return;

      const assignM = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
      if (assignM && !trimmed.startsWith('==')) writes.add(assignM[1]);
      const forM = trimmed.match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in/);
      if (forM) writes.add(forM[1]);
      const appendM = trimmed.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.append/);
      if (appendM) { writes.add(appendM[1]); }

      knownSet.forEach(v => {
        const re = new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
        if (re.test(trimmed)) reads.add(v);
      });
    });

    // Keep reads that are from outside (known vars), remove internal ones
    const internalWrites = new Set(writes);
    // But if a variable is both read from outside AND written inside, it's still a read
    // Filter writes: exclude loop vars, single-letter temps, and internal vars
    const loopVars = new Set();
    code.split('\n').forEach(line => {
      const fm = line.trim().match(/^for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in/);
      if (fm) loopVars.add(fm[1]);
    });

    return {
      reads: Array.from(reads).filter(r => knownSet.has(r)),
      writes: Array.from(writes).filter(w =>
        w !== '_' && !w.startsWith('__') && !loopVars.has(w) &&
        !(w.length === 1 && /[a-z]/.test(w))  // exclude single-letter vars like x, y, z, i, j, k
      )
    };
  },

  // ══════════════════════════════════════
  // EXPRESSION ANALYZER
  // Maps expressions to visual node types
  // ══════════════════════════════════════
  analyzeExpr(expr) {
    expr = expr.trim();

    // Literals
    if (/^-?[\d.]+$/.test(expr)) return { type: 'number-input', controls: { val: expr } };
    if (/^["'](.*)["']$/.test(expr)) return { type: 'text-input', controls: { val: expr.slice(1, -1) } };
    if (expr === 'True' || expr === 'False') return { type: 'boolean-input', controls: { val: expr } };
    if (this.CONSTANTS[expr]) return { type: 'number-input', controls: { val: this.CONSTANTS[expr] } };
    // Empty list → Create List node with no inputs (dynamic)
    if (expr === '[]') return { type: 'list-create', inputs: {}, controls: { _isEmpty: true } };

    // Ternary
    const ternary = expr.match(/^(.+?)\s+if\s+(.+?)\s+else\s+(.+)$/);
    if (ternary) return { type: 'logic-if', inputs: { ifTrue: ternary[1].trim(), condition: ternary[2].trim(), ifFalse: ternary[3].trim() } };

    // Logic
    if (/\band\b/.test(expr)) { const p = expr.split(/\s+and\s+/); if (p.length === 2) return { type: 'logic-and', inputs: { a: p[0].trim(), b: p[1].trim() } }; }
    if (/\bor\b/.test(expr)) { const p = expr.split(/\s+or\s+/); if (p.length === 2) return { type: 'logic-or', inputs: { a: p[0].trim(), b: p[1].trim() } }; }
    if (expr.startsWith('not ')) return { type: 'logic-not', inputs: { value: expr.substring(4).trim() } };

    // Comparisons
    for (const op of ['==', '!=', '<=', '>=', '<', '>']) {
      const idx = this.findTopOp(expr, ' ' + op + ' ');
      if (idx >= 0) {
        const l = expr.substring(0, idx).trim(), r = expr.substring(idx + op.length + 2).trim();
        if (l && r) return { type: 'logic-compare', controls: { op }, inputs: { a: l, b: r } };
      }
    }

    // Function calls
    const funcMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\((.*)?\)$/);
    if (funcMatch) {
      const fn = funcMatch[1];
      const argsStr = (funcMatch[2] || '').trim();
      const args = argsStr ? this.splitArgs(argsStr) : [];

      // ── GEO LIBRARY → VISUAL NODES ──
      if (fn === 'Geo.Point3') return { type: 'geo-point', inputs: { x: args[0]||'0', y: args[1]||'0', z: args[2]||'0' } };
      if (fn === 'Geo.Vector3') return { type: 'geo-vector', inputs: { x: args[0]||'0', y: args[1]||'0', z: args[2]||'0' } };
      if (fn === 'Geo.Line3') return { type: 'geo-line', inputs: { start: args[0]||'_', end: args[1]||'_' } };
      if (fn === 'Geo.Circle3') return { type: 'geo-circle', inputs: { center: args[0]||'_', radius: args[1]||'5' } };
      if (fn === 'Geo.Polyline3') return { type: 'surf-polyline', inputs: { points: args[0]||'_', closed: args.length > 1 ? args[1] : 'False' } };
      if (fn === 'Geo.Arc3') return { type: 'surf-arc', inputs: { center: args[0]||'_', radius: args[1]||'5', startAngle: args[2]||'0', endAngle: args[3]||'360' } };
      if (fn === 'Geo.Plane') return { type: 'surf-plane', inputs: { origin: args[0]||'_', normal: args[1]||'_' } };
      if (fn === 'Geo.createBox') return { type: 'solid-box', inputs: { center: args[0]||'_', width: args[1]||'10', depth: args[2]||'10', height: args[3]||'10' } };
      if (fn === 'Geo.createSphere') return { type: 'solid-sphere', inputs: { center: args[0]||'_', radius: args[1]||'5' } };
      if (fn === 'Geo.createCylinder') return { type: 'solid-cylinder', inputs: { base: args[0]||'_', radius: args[1]||'5', height: args[2]||'10' } };
      if (fn === 'Geo.createCone') return { type: 'solid-cone', inputs: { base: args[0]||'_', radius: args[1]||'5', height: args[2]||'10' } };
      if (fn === 'Geo.createTorus') return { type: 'solid-torus', inputs: { center: args[0]||'_', majorR: args[1]||'5', minorR: args[2]||'1.5' } };
      if (fn === 'Geo.extrude') return { type: 'op-extrude', inputs: { curve: args[0]||'_', vector: args[1]||'_' } };
      if (fn === 'Geo.revolve') return { type: 'op-revolve', inputs: { curve: args[0]||'_', axisOrigin: args[1]||'_', axisDir: args[2]||'_', angle: args[3]||'360' } };
      if (fn === 'Geo.loft') return { type: 'op-loft', inputs: { profiles: args[0]||'_' } };
      if (fn === 'Geo.booleanUnion') return { type: 'op-boolean-union', inputs: { a: args[0]||'_', b: args[1]||'_' } };
      if (fn === 'Geo.booleanIntersect') return { type: 'op-boolean-intersect', inputs: { a: args[0]||'_', b: args[1]||'_' } };
      if (fn === 'Geo.booleanSubtract') return { type: 'op-boolean-subtract', inputs: { a: args[0]||'_', b: args[1]||'_' } };
      if (fn === 'Geo.move') return { type: 'op-move', inputs: { geometry: args[0]||'_', vector: args[1]||'_' } };
      if (fn === 'Geo.scaleGeo') return { type: 'op-scale', inputs: { geometry: args[0]||'_', factor: args[1]||'1', origin: args[2]||'_' } };
      if (fn === 'Geo.offsetCurve') return { type: 'op-offset', inputs: { curve: args[0]||'_', distance: args[1]||'1' } };
      if (fn === 'Geo.trimLine') return { type: 'op-trim', inputs: { line: args[0]||'_', t0: args[1]||'0', t1: args[2]||'1' } };
      if (fn === 'Geo.surfaceFromGrid') return { type: 'surf-from-grid', inputs: { points: args[0]||'_', uCount: args[1]||'5', vCount: args[2]||'5' } };
      if (fn === 'Geo.pointGrid') return { type: 'op-point-grid', inputs: { origin: args[0]||'_', uCount: args[3]||'5', vCount: args[4]||'5', spacing: args[5]||'1' } };
      // Advanced ops
      if (fn === 'Geo.sweep') return { type: 'op-sweep', inputs: { profile: args[0]||'_', path: args[1]||'_' } };
      if (fn === 'Geo.pipe') return { type: 'op-pipe', inputs: { curve: args[0]||'_', radius: args[1]||'0.5' } };
      if (fn === 'Geo.thicken') return { type: 'op-thicken', inputs: { mesh: args[0]||'_', thickness: args[1]||'1' } };
      if (fn === 'Geo.subdivide') return { type: 'op-subdivide', inputs: { mesh: args[0]||'_', iterations: args[1]||'1' } };
      if (fn === 'Geo.smooth') return { type: 'op-smooth', inputs: { mesh: args[0]||'_', iterations: args[1]||'1' } };
      if (fn === 'Geo.rotate') return { type: 'op-rotate', inputs: { geometry: args[0]||'_', axisOrigin: args[1]||'_', axisDir: args[2]||'_', angle: args[3]||'0' } };
      if (fn === 'Geo.mirror') return { type: 'op-mirror', inputs: { geometry: args[0]||'_', planeOrigin: args[1]||'_', planeNormal: args[2]||'_' } };
      if (fn === 'Geo.arrayLinear') return { type: 'op-array-linear', inputs: { geometry: args[0]||'_', direction: args[1]||'_', count: args[2]||'3', spacing: args[3]||'1' } };
      if (fn === 'Geo.arrayPolar') return { type: 'op-array-polar', inputs: { geometry: args[0]||'_', center: args[1]||'_', axis: args[2]||'_', count: args[3]||'6' } };
      if (fn === 'Geo.arrayAlongCurve') return this.pyNode(expr, args[0]);
      if (fn === 'Geo.trimCurve') return { type: 'op-trim', inputs: { line: args[0]||'_', t0: args[1]||'0', t1: args[2]||'1' } };
      if (fn === 'Geo.combineAll') return { type: 'op-combine-all', inputs: { meshes: args[0]||'_' } };
      if (fn === 'Geo.bezier') return { type: 'op-bezier', inputs: { points: args[0]||'_' } };
      if (fn === 'Geo.interpolate') return { type: 'op-interpolate', inputs: { points: args[0]||'_' } };
      if (fn === 'Geo.ruledSurface') return { type: 'op-ruled-surface', inputs: { curve1: args[0]||'_', curve2: args[1]||'_' } };
      if (fn === 'Geo.coonsPatch') return this.pyNode(expr, args[0]);
      if (fn === 'Geo.fillet') return this.pyNode(expr, args[0]);
      if (fn === 'Geo.evaluateSurface') return this.pyNode(expr, args[0]);
      if (fn === 'Geo.createSurface') return this.pyNode(expr, args[0]);
      if (fn === 'Geo.getIsolinesU') return { type: 'op-isolines', inputs: { mesh: args[0]||'_', count: args[1]||'10' } };
      if (fn === 'Geo.getIsolinesV') return { type: 'op-isolines', inputs: { mesh: args[0]||'_', count: args[1]||'10' } };
      if (fn === 'Geo.extrudeSurface') return { type: 'op-thicken', inputs: { mesh: args[0]||'_', thickness: args[1]||'_' } };
      // Pattern & Noise nodes
      if (fn === 'Geo.voronoiOutlines') return { type: 'pat-voronoi-outlines', inputs: { sites: args[0]||'_' } };
      if (fn === 'Geo.voronoiMesh') return { type: 'pat-voronoi-mesh', inputs: { sites: args[0]||'_', height: args[2]||'3', gap: args[3]||'0.1' } };
      if (fn === 'Geo.hexGrid') return { type: 'pat-hex-grid', inputs: { origin: args[0]||'_', radius: args[1]||'2', rows: args[2]||'5', cols: args[3]||'5' } };
      if (fn === 'Geo.diamondGrid') return { type: 'pat-diamond-grid', inputs: { origin: args[0]||'_', width: args[1]||'10', height: args[2]||'10', rows: args[3]||'5', cols: args[4]||'5' } };
      if (fn === 'Geo.phyllotaxis') return { type: 'pat-phyllotaxis', inputs: { count: args[0]||'100', radius: args[1]||'10' } };
      if (fn === 'Geo.fibonacciSphere') return { type: 'pat-fibonacci-sphere', inputs: { count: args[0]||'100', radius: args[1]||'10' } };
      if (fn === 'Geo.perlin2') return { type: 'pat-perlin2', inputs: { x: args[0]||'0', y: args[1]||'0' } };
      if (fn === 'Geo.perlin3') return { type: 'pat-perlin3', inputs: { x: args[0]||'0', y: args[1]||'0', z: args[2]||'0' } };
      if (fn === 'Geo.fbm') return { type: 'pat-fbm', inputs: { x: args[0]||'0', y: args[1]||'0', z: args[2]||'0', octaves: args[3]||'4' } };
      if (fn === 'Geo.pointAttractor') return { type: 'pat-point-attractor', inputs: { point: args[0]||'_', attractor: args[1]||'_', radius: args[2]||'10', falloff: args[3]||'2' } };
      if (fn === 'Geo.noiseDeform') return { type: 'pat-noise-deform', inputs: { mesh: args[0]||'_', amplitude: args[1]||'1', frequency: args[2]||'0.1' } };
      // NURBS nodes
      if (fn === 'Geo.createNurbsCurve') return { type: 'nurbs-curve', inputs: { points: args[0]||'_', degree: args[1]||'3' } };
      if (fn === 'Geo.createNurbsSurface') return { type: 'nurbs-surface', inputs: { grid: args[0]||'_', degreeU: args[1]||'3', degreeV: args[2]||'3' } };

      // ── Original geometry ──
      if (fn === 'Point' || fn === 'XYZ') return { type: 'geo-point', inputs: { x: args[0]||'0', y: args[1]||'0', z: args[2]||'0' } };
      if (fn === 'Vector') return { type: 'geo-vector', inputs: { x: args[0]||'0', y: args[1]||'0', z: args[2]||'0' } };
      if (fn === 'Line') return { type: 'geo-line', inputs: { start: args[0]||'_', end: args[1]||'_' } };
      if (fn === 'Circle') return { type: 'geo-circle', inputs: { center: args[0]||'_', radius: args[1]||'5' } };

      // ── Math ──
      if (fn === 'math.pow' || fn === 'pow') return { type: 'math-power', inputs: { base: args[0]||'0', exp: args[1]||'2' } };
      if (fn === 'math.sqrt') return { type: 'math-power', inputs: { base: args[0]||'0', exp: '0.5' } };
      if (fn === 'math.dist') return { type: 'geo-distance', inputs: { a: args[0]||'_', b: args[1]||'_' } };
      // Math functions that have no visual node → pass through as value (not Python block)
      if (fn === 'math.radians' || fn === 'math.degrees' || fn === 'math.sin' || fn === 'math.cos' ||
          fn === 'math.tan' || fn === 'math.atan2' || fn === 'math.acos' || fn === 'math.asin' ||
          fn === 'math.log' || fn === 'math.abs' || fn === 'math.floor' || fn === 'math.ceil' ||
          fn === 'abs' || fn === 'min' || fn === 'max') {
        return { type: 'custom-formula', controls: { expr: expr }, inputs: {} };
      }

      // ── List ──
      if (fn === 'len') return { type: 'list-length', inputs: { list: args[0]||'_' } };
      if (fn === 'range') return { type: 'list-range', inputs: { start: args[0]||'0', end: args[1]||'10', step: args[2]||'1' } };
      if (fn === 'reversed') return { type: 'list-reverse', inputs: { list: args[0]||'_' } };
      if (fn === 'zip') return this.pyNode(expr);
      if (fn === 'enumerate') return this.pyNode(expr);

      // ── Output ──
      if (fn === 'print') return { type: 'output-watch', inputs: { value: args[0]||'_' } };

      // ── Type ──
      if (fn === 'int') return { type: 'integer-input', controls: { val: args[0]||'0' } };
      if (fn === 'float') return { type: 'number-input', controls: { val: args[0]||'0' } };
      if (fn === 'str') return { type: 'text-input', controls: { val: args[0]||'' } };

      // Unknown → Python node
      return this.pyNode(expr, args[0]);
    }

    // Tuple → Point
    const tuple = expr.match(/^\(([^)]+)\)$/);
    if (tuple) {
      const parts = this.splitArgs(tuple[1]);
      if (parts.length === 3) return { type: 'geo-point', inputs: { x: parts[0], y: parts[1], z: parts[2] } };
      if (parts.length === 2) return { type: 'geo-point', inputs: { x: parts[0], y: parts[1], z: '0' } };
    }

    // Subscript
    const sub = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(.+)\]$/);
    if (sub) return { type: 'list-get', inputs: { list: sub[1], index: sub[2] } };

    // List literal
    const listLit = expr.match(/^\[(.+)\]$/);
    if (listLit) {
      const items = this.splitArgs(listLit[1]);
      return { type: 'list-create', inputs: { item0: items[0]||'None', item1: items[1]||'None', item2: items[2]||'None' } };
    }

    // Binary arithmetic
    for (const op of ['**', '+', '-', '*', '/']) {
      const idx = this.findTopOp(expr, op);
      if (idx >= 0) {
        const left = expr.substring(0, idx).trim();
        const right = expr.substring(idx + op.length).trim();
        if (left && right) {
          if (this.isSimple(left) && this.isSimple(right)) {
            if (op === '**') return { type: this.BIN_OPS[op], inputs: { base: left, exp: right } };
            return { type: this.BIN_OPS[op], inputs: { a: left, b: right } };
          }
          return this.pyNode(expr);
        }
      }
    }

    // Variable reference
    if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr)) return { type: 'reference', name: expr };

    // Parenthesized
    const parenWrap = expr.match(/^\((.+)\)$/);
    if (parenWrap && this.findTopOp(parenWrap[1], ',') < 0) return this.analyzeExpr(parenWrap[1]);

    return this.pyNode(expr);
  },

  // ── HELPERS ──
  isSimple(expr) {
    expr = expr.trim();
    return /^-?[\d.]+$/.test(expr) || /^["'].*["']$/.test(expr) ||
           /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr) || expr === 'True' || expr === 'False';
  },

  pyNode(code, firstInput) {
    // Log WHY this expression couldn't be mapped to a visual node
    var reason = 'Unknown expression pattern';
    if (code && code.indexOf('(') >= 0) {
      var fnName = code.substring(0, code.indexOf('(')).trim();
      if (fnName.indexOf('.') >= 0) reason = 'Unrecognized function: ' + fnName;
      else reason = 'Unmapped function call: ' + fnName + '()';
    } else if (code && code.indexOf('[') >= 0) {
      reason = 'Complex subscript or list comprehension';
    } else if (code && (code.indexOf(' + ') >= 0 || code.indexOf(' - ') >= 0 || code.indexOf(' * ') >= 0)) {
      reason = 'Complex expression with nested operations (cannot decompose)';
    } else {
      reason = 'No matching visual node pattern for: ' + (code || '').substring(0, 60);
    }
    if (typeof NFLogger !== 'undefined') {
      NFLogger.warn('parser', 'Fallback to Python node', { reason: reason, code: (code || '').substring(0, 200) });
    }
    const result = { type: 'custom-python', controls: { code: code } };
    if (firstInput && firstInput !== '_') result.inputs = { input0: firstInput };
    else result.inputs = {};
    return result;
  },

  findTopOp(expr, op) {
    let depth = 0, inStr = false, strChar = '';
    const rtl = op !== '**';
    const check = (i) => {
      if (depth === 0 && !inStr && expr.substring(i, i + op.length) === op) {
        if (op === '*' && (expr[i + 1] === '*' || (i > 0 && expr[i - 1] === '*'))) return false;
        return true;
      }
      return false;
    };
    if (rtl) {
      for (let i = expr.length - 1; i >= 0; i--) {
        if ((expr[i] === '"' || expr[i] === "'") && !inStr) { inStr = true; strChar = expr[i]; } else if (inStr && expr[i] === strChar) inStr = false;
        if (!inStr) { if (expr[i] === ')' || expr[i] === ']') depth++; if (expr[i] === '(' || expr[i] === '[') depth--; }
        if (check(i)) return i;
      }
    } else {
      for (let i = 0; i <= expr.length - op.length; i++) {
        if ((expr[i] === '"' || expr[i] === "'") && !inStr) { inStr = true; strChar = expr[i]; } else if (inStr && expr[i] === strChar) inStr = false;
        if (!inStr) { if (expr[i] === '(' || expr[i] === '[') depth++; if (expr[i] === ')' || expr[i] === ']') depth--; }
        if (check(i)) return i;
      }
    }
    return -1;
  },

  _stripComment(str) {
    var inStr = false, strCh = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (inStr) { if (ch === '\\' && i + 1 < str.length) { i++; continue; } if (ch === strCh) inStr = false; }
      else { if (ch === '"' || ch === "'") { inStr = true; strCh = ch; } else if (ch === '#') { return str.substring(0, i).trimEnd(); } }
    }
    return str;
  },

  splitArgs(str) {
    const args = []; let depth = 0; let current = ''; let inStr = false; let strChar = '';
    for (const ch of str) {
      if ((ch === '"' || ch === "'") && !inStr) { inStr = true; strChar = ch; } else if (inStr && ch === strChar) inStr = false;
      if (!inStr) {
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        if (ch === ')' || ch === ']' || ch === '}') depth--;
        if (ch === ',' && depth === 0) { args.push(current.trim()); current = ''; continue; }
      }
      current += ch;
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }
};

if (typeof window !== 'undefined') {
  window.CodeParser = CodeParser;
}

export { CodeParser };
export default CodeParser;
