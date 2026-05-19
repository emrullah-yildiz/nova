export const listCategory = {
  id: 'list',
  name: 'List',
  color: '#fab387',
  icon: '[]'
};

const listInput = [{ id: 'list', name: 'List', type: 'list' }];
const listOutput = [{ id: 'list', name: 'List', type: 'list' }];
const resultListOutput = [{ id: 'result', name: 'Result', type: 'list' }];
const resultNumberOutput = [{ id: 'result', name: 'Result', type: 'number' }];

function toList(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isNaN(number) ? fallback : number;
}

function toInteger(value, fallback = 0) {
  return Math.round(toNumber(value, fallback));
}

function isTruthy(value) {
  return !!value && value !== 'false' && value !== 'False' && value !== 0;
}

function numericItems(list) {
  return toList(list).filter(value => typeof value === 'number' && !Number.isNaN(value));
}

function createRange(start, end, step) {
  const values = [];
  const safeStep = step || 1;

  for (let value = start; safeStep > 0 ? value < end : value > end; value += safeStep) {
    values.push(value);
    if (values.length > 10000) break;
  }

  return values;
}

function compileExpression(expression, fallback) {
  try {
    return new Function('x', `return (${expression || fallback});`);
  } catch {
    return () => undefined;
  }
}

function listTransformNode({ type, name, icon, output = resultListOutput, controls = [], execute, python }) {
  return {
    type,
    name,
    category: 'list',
    icon,
    inputs: listInput,
    outputs: output,
    controls,
    execute,
    codegen: {
      python,
      csharp: ''
    }
  };
}

export const listNodes = [
  {
    type: 'list.create',
    name: 'List.Create',
    category: 'list',
    icon: '[ ]',
    inputs: [
      { id: 'item0', name: 'Item 0', type: 'any' },
      { id: 'item1', name: 'Item 1', type: 'any' }
    ],
    outputs: listOutput,
    dynamicInputs: true,
    execute(context, inputs, controls, nodeInstance) {
      const inputIds = nodeInstance && Array.isArray(nodeInstance._dynInputIds)
        ? nodeInstance._dynInputIds
        : Object.keys(inputs).sort();

      return {
        list: inputIds
          .map(id => inputs[id])
          .filter(value => value !== undefined)
      };
    },
    codegen: {
      python: '{{list}} = []',
      csharp: ''
    }
  },
  listTransformNode({
    type: 'list.count',
    name: 'List.Count',
    icon: '#',
    output: [{ id: 'count', name: 'Count', type: 'number' }],
    execute(context, inputs) {
      return { count: Array.isArray(inputs.list) ? inputs.list.length : 0 };
    },
    python: '{{count}} = len({{list}})'
  }),
  listTransformNode({
    type: 'list.first',
    name: 'List.First',
    icon: '1st',
    output: [{ id: 'item', name: 'Item', type: 'any' }],
    execute(context, inputs) {
      const list = toList(inputs.list);
      return { item: list.length ? list[0] : undefined };
    },
    python: '{{item}} = {{list}}[0]'
  }),
  listTransformNode({
    type: 'list.last',
    name: 'List.Last',
    icon: 'last',
    output: [{ id: 'item', name: 'Item', type: 'any' }],
    execute(context, inputs) {
      const list = toList(inputs.list);
      return { item: list.length ? list[list.length - 1] : undefined };
    },
    python: '{{item}} = {{list}}[-1]'
  }),
  {
    type: 'list.getItem',
    name: 'List.GetItem',
    category: 'list',
    icon: '[i]',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'index', name: 'Index', type: 'number' }
    ],
    outputs: [{ id: 'item', name: 'Item', type: 'any' }],
    controls: [{ id: 'index', type: 'formula', default: '0', label: 'Index' }],
    execute(context, inputs) {
      const list = toList(inputs.list);
      const index = Math.max(0, Math.floor(toNumber(inputs.index)));
      return { item: list[index] };
    },
    codegen: {
      python: '{{item}} = {{list}}[int({{index}})]',
      csharp: ''
    }
  },
  {
    type: 'list.range',
    name: 'List.Range',
    category: 'list',
    icon: '..',
    inputs: [
      { id: 'start', name: 'Start', type: 'number' },
      { id: 'end', name: 'End', type: 'number' },
      { id: 'step', name: 'Step', type: 'number' }
    ],
    outputs: listOutput,
    controls: [
      { id: 'start', type: 'formula', default: '0', label: 'Start' },
      { id: 'end', type: 'formula', default: '10', label: 'End' },
      { id: 'step', type: 'formula', default: '1', label: 'Step' }
    ],
    execute(context, inputs) {
      return { list: createRange(toNumber(inputs.start), toNumber(inputs.end, 10), toNumber(inputs.step, 1)) };
    },
    codegen: {
      python: '{{list}} = list(range(int({{start}}), int({{end}}), int({{step}})))',
      csharp: ''
    }
  },
  {
    type: 'list.sequence',
    name: 'List.Sequence',
    category: 'list',
    icon: 'seq',
    inputs: [
      { id: 'start', name: 'Start', type: 'number' },
      { id: 'step', name: 'Step', type: 'number' },
      { id: 'count', name: 'Count', type: 'number' }
    ],
    outputs: listOutput,
    controls: [
      { id: 'start', type: 'formula', default: '0', label: 'Start' },
      { id: 'step', type: 'formula', default: '1', label: 'Step' },
      { id: 'count', type: 'formula', default: '10', label: 'Count' }
    ],
    execute(context, inputs) {
      const start = toNumber(inputs.start);
      const step = toNumber(inputs.step, 1);
      const count = Math.max(0, Math.min(10000, toInteger(inputs.count, 10)));
      return { list: Array.from({ length: count }, (item, index) => start + step * index) };
    },
    codegen: {
      python: '{{list}} = [{{start}} + {{step}} * i for i in range(int({{count}}))]',
      csharp: ''
    }
  },
  {
    type: 'list.repeat',
    name: 'List.Repeat',
    category: 'list',
    icon: 'rep',
    inputs: [
      { id: 'item', name: 'Item', type: 'any' },
      { id: 'count', name: 'Count', type: 'number' }
    ],
    outputs: listOutput,
    controls: [{ id: 'count', type: 'formula', default: '5', label: 'Count' }],
    execute(context, inputs) {
      const count = Math.max(0, Math.min(10000, toInteger(inputs.count, 5)));
      return { list: Array.from({ length: count }, () => inputs.item) };
    },
    codegen: {
      python: '{{list}} = [{{item}}] * int({{count}})',
      csharp: ''
    }
  },
  listTransformNode({
    type: 'list.reverse',
    name: 'List.Reverse',
    icon: 'rev',
    execute(context, inputs) {
      return { result: toList(inputs.list).slice().reverse() };
    },
    python: '{{result}} = list(reversed({{list}}))'
  }),
  listTransformNode({
    type: 'list.flatten',
    name: 'List.Flatten',
    icon: 'flat',
    execute(context, inputs) {
      return { result: toList(inputs.list).flat() };
    },
    python: '{{result}} = [item for sub in {{list}} for item in (sub if isinstance(sub, list) else [sub])]'
  }),
  {
    type: 'list.take',
    name: 'List.Take',
    category: 'list',
    icon: 'take',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'count', name: 'Count', type: 'number' }
    ],
    outputs: resultListOutput,
    controls: [{ id: 'count', type: 'formula', default: '5', label: 'Count' }],
    execute(context, inputs) {
      return { result: toList(inputs.list).slice(0, Math.max(0, toInteger(inputs.count, 5))) };
    },
    codegen: {
      python: '{{result}} = {{list}}[:int({{count}})]',
      csharp: ''
    }
  },
  {
    type: 'list.skip',
    name: 'List.Skip',
    category: 'list',
    icon: 'skip',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'count', name: 'Count', type: 'number' }
    ],
    outputs: resultListOutput,
    controls: [{ id: 'count', type: 'formula', default: '1', label: 'Count' }],
    execute(context, inputs) {
      return { result: toList(inputs.list).slice(Math.max(0, toInteger(inputs.count, 1))) };
    },
    codegen: {
      python: '{{result}} = {{list}}[int({{count}}):]',
      csharp: ''
    }
  },
  {
    type: 'list.slice',
    name: 'List.Slice',
    category: 'list',
    icon: '[:]',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'from', name: 'From', type: 'number' },
      { id: 'to', name: 'To', type: 'number' }
    ],
    outputs: resultListOutput,
    controls: [
      { id: 'from', type: 'formula', default: '0', label: 'From' },
      { id: 'to', type: 'formula', default: '5', label: 'To' }
    ],
    execute(context, inputs) {
      return { result: toList(inputs.list).slice(Math.max(0, toInteger(inputs.from)), toInteger(inputs.to, 5)) };
    },
    codegen: {
      python: '{{result}} = {{list}}[int({{from}}):int({{to}})]',
      csharp: ''
    }
  },
  {
    type: 'list.insert',
    name: 'List.Insert',
    category: 'list',
    icon: '+i',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'item', name: 'Item', type: 'any' },
      { id: 'index', name: 'Index', type: 'number' }
    ],
    outputs: resultListOutput,
    controls: [{ id: 'index', type: 'formula', default: '0', label: 'Index' }],
    execute(context, inputs) {
      const result = toList(inputs.list).slice();
      result.splice(toInteger(inputs.index), 0, inputs.item);
      return { result };
    },
    codegen: {
      python: '{{result}} = list({{list}})\n{{result}}.insert(int({{index}}), {{item}})',
      csharp: ''
    }
  },
  {
    type: 'list.remove',
    name: 'List.Remove',
    category: 'list',
    icon: '-i',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'index', name: 'Index', type: 'number' }
    ],
    outputs: [
      { id: 'result', name: 'Result', type: 'list' },
      { id: 'removed', name: 'Removed', type: 'any' }
    ],
    controls: [{ id: 'index', type: 'formula', default: '0', label: 'Index' }],
    execute(context, inputs) {
      const list = toList(inputs.list);
      if (!list.length) return { result: [], removed: undefined };
      const index = Math.max(0, Math.min(list.length - 1, toInteger(inputs.index)));
      return {
        result: list.slice(0, index).concat(list.slice(index + 1)),
        removed: list[index]
      };
    },
    codegen: {
      python: '{{result}} = list({{list}})\n{{removed}} = {{result}}.pop(int({{index}}))',
      csharp: ''
    }
  },
  {
    type: 'list.join',
    name: 'List.Join',
    category: 'list',
    icon: 'join',
    inputs: [
      { id: 'listA', name: 'List A', type: 'list' },
      { id: 'listB', name: 'List B', type: 'list' }
    ],
    outputs: resultListOutput,
    execute(context, inputs) {
      return { result: toList(inputs.listA).concat(toList(inputs.listB)) };
    },
    codegen: {
      python: '{{result}} = {{listA}} + {{listB}}',
      csharp: ''
    }
  },
  {
    type: 'list.zip',
    name: 'List.Zip',
    category: 'list',
    icon: 'zip',
    inputs: [
      { id: 'listA', name: 'List A', type: 'list' },
      { id: 'listB', name: 'List B', type: 'list' }
    ],
    outputs: resultListOutput,
    execute(context, inputs) {
      const listA = toList(inputs.listA);
      const listB = toList(inputs.listB);
      return { result: Array.from({ length: Math.min(listA.length, listB.length) }, (item, index) => [listA[index], listB[index]]) };
    },
    codegen: {
      python: '{{result}} = list(zip({{listA}}, {{listB}}))',
      csharp: ''
    }
  },
  {
    type: 'list.crossReference',
    name: 'List.CrossReference',
    category: 'list',
    icon: 'x',
    inputs: [
      { id: 'listA', name: 'List A', type: 'list' },
      { id: 'listB', name: 'List B', type: 'list' }
    ],
    outputs: [
      { id: 'pairsA', name: 'A Values', type: 'list' },
      { id: 'pairsB', name: 'B Values', type: 'list' }
    ],
    execute(context, inputs) {
      const pairsA = [];
      const pairsB = [];
      toList(inputs.listA).forEach(a => {
        toList(inputs.listB).forEach(b => {
          pairsA.push(a);
          pairsB.push(b);
        });
      });
      return { pairsA, pairsB };
    },
    codegen: {
      python: '{{pairsA}} = [a for a in {{listA}} for b in {{listB}}]\n{{pairsB}} = [b for a in {{listA}} for b in {{listB}}]',
      csharp: ''
    }
  },
  {
    type: 'list.filterByBoolean',
    name: 'List.FilterByBoolean',
    category: 'list',
    icon: 'bool',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'mask', name: 'Booleans', type: 'list' }
    ],
    outputs: [
      { id: 'inList', name: 'In (True)', type: 'list' },
      { id: 'outList', name: 'Out (False)', type: 'list' }
    ],
    execute(context, inputs) {
      const inList = [];
      const outList = [];
      const mask = toList(inputs.mask);
      toList(inputs.list).forEach((item, index) => {
        if (isTruthy(mask[index])) inList.push(item);
        else outList.push(item);
      });
      return { inList, outList };
    },
    codegen: {
      python: '{{inList}} = [v for v,m in zip({{list}},{{mask}}) if m]\n{{outList}} = [v for v,m in zip({{list}},{{mask}}) if not m]',
      csharp: ''
    }
  },
  listTransformNode({
    type: 'list.sum',
    name: 'List.Sum',
    icon: 'sum',
    output: resultNumberOutput,
    execute(context, inputs) {
      return { result: numericItems(inputs.list).reduce((sum, value) => sum + value, 0) };
    },
    python: '{{result}} = sum({{list}})'
  }),
  listTransformNode({
    type: 'list.average',
    name: 'List.Average',
    icon: 'avg',
    output: resultNumberOutput,
    execute(context, inputs) {
      const numbers = numericItems(inputs.list);
      return { result: numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0 };
    },
    python: '{{result}} = sum({{list}}) / len({{list}})'
  }),
  listTransformNode({
    type: 'list.min',
    name: 'List.Min',
    icon: 'min',
    output: resultNumberOutput,
    execute(context, inputs) {
      const numbers = numericItems(inputs.list);
      return { result: numbers.length ? Math.min(...numbers) : undefined };
    },
    python: '{{result}} = min({{list}})'
  }),
  listTransformNode({
    type: 'list.max',
    name: 'List.Max',
    icon: 'max',
    output: resultNumberOutput,
    execute(context, inputs) {
      const numbers = numericItems(inputs.list);
      return { result: numbers.length ? Math.max(...numbers) : undefined };
    },
    python: '{{result}} = max({{list}})'
  }),
  {
    type: 'list.sort',
    name: 'List.Sort',
    category: 'list',
    icon: 'sort',
    inputs: listInput,
    outputs: resultListOutput,
    controls: [{ id: 'desc', type: 'dropdown', options: ['Ascending', 'Descending'], default: 'Ascending', label: 'Order' }],
    execute(context, inputs, controls) {
      const result = toList(inputs.list).slice().sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a).localeCompare(String(b));
      });
      return { result: controls.desc === 'Descending' ? result.reverse() : result };
    },
    codegen: {
      python: '{{result}} = sorted({{list}}, reverse={{desc}})',
      csharp: ''
    }
  },
  {
    type: 'list.shuffle',
    name: 'List.Shuffle',
    category: 'list',
    icon: 'mix',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'seed', name: 'Seed', type: 'number' }
    ],
    outputs: resultListOutput,
    controls: [{ id: 'seed', type: 'formula', default: '0', label: 'Seed' }],
    execute(context, inputs) {
      const result = toList(inputs.list).slice();
      let seed = toInteger(inputs.seed);
      const random = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let index = result.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
      }
      return { result };
    },
    codegen: {
      python: 'import random\n_rng=random.Random(int({{seed}}))\n{{result}}=list({{list}})\n_rng.shuffle({{result}})',
      csharp: ''
    }
  },
  listTransformNode({
    type: 'list.unique',
    name: 'List.Unique',
    icon: 'uniq',
    execute(context, inputs) {
      return { result: Array.from(new Set(toList(inputs.list))) };
    },
    python: '{{result}} = list(dict.fromkeys({{list}}))'
  }),
  {
    type: 'list.chunk',
    name: 'List.Chunk',
    category: 'list',
    icon: 'chunk',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'size', name: 'Size', type: 'number' }
    ],
    outputs: resultListOutput,
    controls: [{ id: 'size', type: 'formula', default: '3', label: 'Size' }],
    execute(context, inputs) {
      const list = toList(inputs.list);
      const size = Math.max(1, toInteger(inputs.size, 3));
      const result = [];
      for (let index = 0; index < list.length; index += size) {
        result.push(list.slice(index, index + size));
      }
      return { result };
    },
    codegen: {
      python: '{{result}} = [{{list}}[i:i+int({{size}})] for i in range(0, len({{list}}), int({{size}}))]',
      csharp: ''
    }
  },
  listTransformNode({
    type: 'list.transpose',
    name: 'List.Transpose',
    icon: 'T',
    execute(context, inputs) {
      const rows = toList(inputs.list);
      const maxLength = rows.reduce((max, row) => Array.isArray(row) ? Math.max(max, row.length) : max, 0);
      return {
        result: Array.from({ length: maxLength }, (item, index) => rows.map(row => Array.isArray(row) ? row[index] : undefined))
      };
    },
    python: '{{result}} = list(map(list, zip(*{{list}})))'
  }),
  listTransformNode({
    type: 'list.pairs',
    name: 'List.Pairs',
    icon: 'pair',
    execute(context, inputs) {
      const list = toList(inputs.list);
      return { result: list.slice(0, -1).map((item, index) => [item, list[index + 1]]) };
    },
    python: '{{result}} = list(zip({{list}}[:-1], {{list}}[1:]))'
  }),
  {
    type: 'list.indexOf',
    name: 'List.IndexOf',
    category: 'list',
    icon: '#i',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'item', name: 'Item', type: 'any' }
    ],
    outputs: [{ id: 'index', name: 'Index', type: 'number' }],
    controls: [{ id: 'item', type: 'formula', default: '0', label: 'Item' }],
    execute(context, inputs) {
      return { index: toList(inputs.list).indexOf(inputs.item) };
    },
    codegen: {
      python: '{{index}} = {{list}}.index({{item}}) if {{item}} in {{list}} else -1',
      csharp: ''
    }
  },
  {
    type: 'list.contains',
    name: 'List.Contains',
    category: 'list',
    icon: 'has',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'item', name: 'Item', type: 'any' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'boolean' }],
    controls: [{ id: 'item', type: 'formula', default: '0', label: 'Item' }],
    execute(context, inputs) {
      return { result: toList(inputs.list).includes(inputs.item) };
    },
    codegen: {
      python: '{{result}} = {{item}} in {{list}}',
      csharp: ''
    }
  },
  {
    type: 'list.map',
    name: 'List.Map',
    category: 'list',
    icon: 'map',
    inputs: listInput,
    outputs: resultListOutput,
    controls: [{ id: 'code', type: 'formula', default: 'x * 2', label: 'f(x)' }],
    execute(context, inputs, controls) {
      const mapper = compileExpression(controls.code, 'x');
      return { result: toList(inputs.list).map(item => mapper(item)) };
    },
    codegen: {
      python: '{{result}} = [{{code}} for x in {{list}}]',
      csharp: ''
    }
  },
  {
    type: 'list.groupBy',
    name: 'List.GroupBy',
    category: 'list',
    icon: 'grp',
    inputs: [
      { id: 'list', name: 'List', type: 'list' },
      { id: 'keys', name: 'Keys', type: 'list' }
    ],
    outputs: [
      { id: 'groups', name: 'Groups', type: 'list' },
      { id: 'groupKeys', name: 'Keys', type: 'list' }
    ],
    controls: [{ id: 'expr', type: 'formula', default: 'x % 3', label: 'Key f(x)' }],
    execute(context, inputs, controls) {
      const list = toList(inputs.list);
      const keys = toList(inputs.keys);
      const keyFunction = compileExpression(controls.expr, 'x');
      const grouped = new Map();

      list.forEach((item, index) => {
        const key = index < keys.length ? keys[index] : keyFunction(item);
        const mapKey = String(key);
        if (!grouped.has(mapKey)) grouped.set(mapKey, { key, items: [] });
        grouped.get(mapKey).items.push(item);
      });

      return {
        groups: Array.from(grouped.values()).map(group => group.items),
        groupKeys: Array.from(grouped.values()).map(group => group.key)
      };
    },
    codegen: {
      python: '_gd={}\nfor x in {{list}}:\n _k={{expr}}\n if _k not in _gd:_gd[_k]=[]\n _gd[_k].append(x)\n{{groupKeys}}=list(_gd.keys())\n{{groups}}=list(_gd.values())',
      csharp: ''
    }
  }
];
