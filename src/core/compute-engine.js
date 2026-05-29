export const CACHE_UNDEFINED = Symbol('CACHE_UNDEFINED');
export const CACHE_COMPUTING = Symbol('CACHE_COMPUTING');

export function createComputeContext(nodes, wires, options = {}) {
  return {
    nodes: nodes || [],
    wires: wires || [],
    cache: new Map(),
    formulaEval: options.formulaEval,
    computeInner: options.computeInner
  };
}

export function getInput(ctx, nd, portId) {
  const wire = ctx.wires.find(w => w.toNode === nd.id && w.toPort === portId);
  if (!wire) return undefined;
  const srcNd = ctx.nodes.find(n => n.id === wire.fromNode);
  if (!srcNd) return undefined;

  const srcValue = computeNodeValue(ctx, srcNd);

  if (srcNd._portValues && srcNd._portValues[wire.fromPort] !== undefined) {
    return srcNd._portValues[wire.fromPort];
  }

  if ((srcNd.type === 'custom-python' || srcNd.type === 'custom-code' || srcNd.type === 'Custom.Python') && srcNd._pyResults) {
    if (srcNd._pyResults[wire.fromPort] !== undefined) return srcNd._pyResults[wire.fromPort];
    const keys = Object.keys(srcNd._pyResults).filter(k => !k.startsWith('_') && k.length > 1);
    if (keys.length > 0) return srcNd._pyResults[keys[0]];
  }

  return srcValue;
}

export function getVal(ctx, nd, id, def) {
  const inputValue = getInput(ctx, nd, id);
  if (inputValue !== undefined) return inputValue;

  const evalKey = '_eval_' + id;
  if (nd.controlValues && nd.controlValues[evalKey] !== undefined && !isNaN(nd.controlValues[evalKey])) {
    const num = Number(nd.controlValues[evalKey]);
    return isNaN(num) ? def : num;
  }

  const cv = nd.controlValues ? nd.controlValues[id] : undefined;
  if (cv !== undefined && cv !== null) {
    if (ctx.formulaEval && typeof cv === 'string' && cv.length > 0) {
      const result = ctx.formulaEval.eval(cv);
      if (result && result.error === null) {
        const num = Number(result.value);
        return isNaN(num) ? def : num;
      }
    }
    const num = parseFloat(cv);
    return isNaN(num) ? def : num;
  }

  return def;
}

export function computeNodeValue(ctx, nd) {
  const cache = ctx.cache;
  if (cache) {
    const cached = cache.get(nd.id);
    if (cached === CACHE_COMPUTING) return undefined;
    if (cached !== undefined) return cached === CACHE_UNDEFINED ? undefined : cached;
    cache.set(nd.id, CACHE_COMPUTING);
  }

  let result = undefined;
  try {
    result = ctx.computeInner(nd, portId => getInput(ctx, nd, portId), (id, def) => getVal(ctx, nd, id, def));
  } catch (e) {
    result = undefined;
  }

  if (cache) cache.set(nd.id, result !== undefined ? result : CACHE_UNDEFINED);
  return result;
}
