export const listCategory = {
  id: 'list',
  name: 'List',
  color: '#fab387',
  icon: '☰'
};

const numberOutput = (description) => [{ id: 'result', name: 'Result', type: 'number', description }];
const listOutput = (description) => [{ id: 'result', name: 'Result', type: 'list', description }];
const passthroughListOutput = [{ id: 'list', name: 'List', type: 'list', description: 'The assembled list' }];
const listInputs = (description = 'The list to operate on') => [
  { id: 'list', name: 'List', type: 'list', description }
];

function toList(value) {
  return Array.isArray(value) ? value : [];
}
function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}
function toInteger(value, fallback = 0) {
  return Math.round(toNumber(value, fallback));
}
function isTruthy(value) {
  return !!value && value !== 'false' && value !== 'False' && value !== 0;
}
function numericItems(list) {
  return toList(list).filter((v) => typeof v === 'number' && !Number.isNaN(v));
}
function createRange(start, end, step) {
  const out = [];
  const s = step || 1;
  for (let v = start; s > 0 ? v < end : v > end; v += s) {
    out.push(v);
    if (out.length > 10000) break;
  }
  return out;
}
function compileExpression(expression, fallback) {
  try {
    return new Function('x', `return (${expression || fallback});`);
  } catch {
    return () => undefined;
  }
}

export const listNodes = [
  {
    type: 'List.Create',
    name: 'List.Create',
    category: 'list',
    subGroup: 'List',
    icon: '⊞',
    aliases: ['list-create'],
    description: 'Assembles a list from a variable number of item inputs. Add or remove ports dynamically to control list length; values flow in order from Item 0 onward.',
    inputs: [
      { id: 'item0', name: 'Item 0', type: 'any', description: 'First item' },
      { id: 'item1', name: 'Item 1', type: 'any', description: 'Second item' }
    ],
    outputs: passthroughListOutput,
    controls: [],
    dynamicInputs: true,
    execute(context, inputs, controls, nodeInstance) {
      const ids = nodeInstance && Array.isArray(nodeInstance._dynInputIds)
        ? nodeInstance._dynInputIds
        : Object.keys(inputs).sort();
      return { list: ids.map((id) => inputs[id]).filter((v) => v !== undefined) };
    },
    codegen: {
      python: '{{list}} = [{{item0}}, {{item1}}]',
      csharp: 'var {{list}} = new List<object> { {{item0}}, {{item1}} };'
    },
    help: {
      description: 'Shopping-cart workflow: gather three line-item prices into a single list and watch the assembled list as the cart total breakdown.',
      inputs: [
        { name: 'Item 0', description: 'First item value' },
        { name: 'Item 1', description: 'Second item value' }
      ],
      outputs: [{ name: 'List', description: 'The assembled list of items' }],
      example: {
        title: 'Build a 3-item price list',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 20 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 30 } },
          { type: 'List.Create', x: 220, y: 60 },
          { type: 'output-watch', x: 460, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'item0'],
          [1, 'value', 3, 'item1'],
          [2, 'value', 3, 'item2'],
          [3, 'list', 4, 'value']
        ]
      },
      sampleCode: '{{list}} = [{{item0}}, {{item1}}, {{item2}}]'
    }
  },
  {
    type: 'List.Count',
    name: 'List.Count',
    category: 'list',
    subGroup: 'List',
    icon: '#',
    aliases: ['list-count', 'list-length'],
    description: 'Returns the number of items in a list. Equivalent to len() in Python or .Count in C#; pairs with List.Range and List.Filter* nodes for size reporting.',
    inputs: listInputs(),
    outputs: [{ id: 'count', name: 'Count', type: 'number', description: 'Number of items in the list' }],
    controls: [],
    execute(context, inputs) {
      return { count: toList(inputs.list).length };
    },
    codegen: {
      python: '{{count}} = len({{list}})',
      csharp: 'int {{count}} = {{list}}.Count;'
    },
    help: {
      description: 'Inventory workflow: build a range of sample bay numbers and report how many bays the schedule covers.',
      inputs: [{ name: 'List', description: 'List to measure' }],
      outputs: [{ name: 'Count', description: 'Number of items' }],
      example: {
        title: 'Count bays in a schedule (1..6)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 7 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Count', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'count', 5, 'value']
        ]
      },
      sampleCode: '{{count}} = len({{list}})'
    }
  },
  {
    type: 'List.First',
    name: 'List.First',
    category: 'list',
    subGroup: 'List',
    icon: '⊢',
    aliases: ['list-first'],
    description: 'Returns the first item of a list (index 0). Returns undefined for empty lists; useful for picking the head of a queue or the lowest value after List.Sort.',
    inputs: listInputs(),
    outputs: [{ id: 'item', name: 'Item', type: 'any', description: 'First item in the list (undefined if empty)' }],
    controls: [],
    execute(context, inputs) {
      const list = toList(inputs.list);
      return { item: list.length ? list[0] : undefined };
    },
    codegen: {
      python: '{{item}} = {{list}}[0] if {{list}} else None',
      csharp: 'var {{item}} = {{list}}.FirstOrDefault();'
    },
    help: {
      description: 'Queue workflow: get the head of a numbered queue (1..5) and forward it to the next stage of the pipeline.',
      inputs: [{ name: 'List', description: 'List to read from' }],
      outputs: [{ name: 'Item', description: 'First item' }],
      example: {
        title: 'Take head of queue 1..5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.First', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'item', 5, 'value']
        ]
      },
      sampleCode: '{{item}} = {{list}}[0]'
    }
  },
  {
    type: 'List.Last',
    name: 'List.Last',
    category: 'list',
    subGroup: 'List',
    icon: '⊣',
    aliases: ['list-last'],
    description: 'Returns the last item of a list. Returns undefined for empty lists; useful for picking the most recent entry or the largest value after List.Sort ascending.',
    inputs: listInputs(),
    outputs: [{ id: 'item', name: 'Item', type: 'any', description: 'Last item in the list (undefined if empty)' }],
    controls: [],
    execute(context, inputs) {
      const list = toList(inputs.list);
      return { item: list.length ? list[list.length - 1] : undefined };
    },
    codegen: {
      python: '{{item}} = {{list}}[-1] if {{list}} else None',
      csharp: 'var {{item}} = {{list}}.LastOrDefault();'
    },
    help: {
      description: 'History workflow: take the final entry from a recorded series (1..10) and surface it as the latest reading.',
      inputs: [{ name: 'List', description: 'List to read from' }],
      outputs: [{ name: 'Item', description: 'Last item' }],
      example: {
        title: 'Latest reading from a 1..10 history',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 11 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Last', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'item', 5, 'value']
        ]
      },
      sampleCode: '{{item}} = {{list}}[-1]'
    }
  },
  {
    type: 'List.GetItem',
    name: 'List.GetItem',
    category: 'list',
    subGroup: 'List',
    icon: '◉',
    aliases: ['list-get'],
    description: 'Returns the item at a given zero-based index. Negative indices and out-of-range values yield undefined; pair with List.Count to compute safe indices.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to read from' },
      { id: 'index', name: 'Index', type: 'number', description: 'Zero-based index of the item to return' }
    ],
    outputs: [{ id: 'item', name: 'Item', type: 'any', description: 'Item at the given index' }],
    controls: [{ id: 'index', type: 'formula', default: '0', label: 'Index' }],
    execute(context, inputs) {
      const list = toList(inputs.list);
      const index = Math.max(0, Math.floor(toNumber(inputs.index)));
      return { item: list[index] };
    },
    codegen: {
      python: '{{item}} = {{list}}[int({{index}})]',
      csharp: 'var {{item}} = {{list}}[(int){{index}}];'
    },
    help: {
      description: 'Waypoint workflow: pick the third waypoint (index 2) from a planned route and forward its value to the next stage.',
      inputs: [
        { name: 'List', description: 'List to read from' },
        { name: 'Index', description: 'Zero-based position' }
      ],
      outputs: [{ name: 'Item', description: 'Item at the index' }],
      example: {
        title: 'Get waypoint #3 from a route 1..10',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 11 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 150, controls: { val: 2 } },
          { type: 'List.GetItem', x: 440, y: 90 },
          { type: 'output-watch', x: 640, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'list'],
          [4, 'value', 5, 'index'],
          [5, 'item', 6, 'value']
        ]
      },
      sampleCode: '{{item}} = {{list}}[int({{index}})]'
    }
  },
  {
    type: 'List.Range',
    name: 'List.Range',
    category: 'list',
    subGroup: 'List',
    icon: '…',
    aliases: ['list-range'],
    description: 'Builds a list of numbers from start (inclusive) to end (exclusive) with a given step. Equivalent to range() in Python; capped at 10 000 items for safety.',
    inputs: [
      { id: 'start', name: 'Start', type: 'number', description: 'Inclusive start value' },
      { id: 'end', name: 'End', type: 'number', description: 'Exclusive end value' },
      { id: 'step', name: 'Step', type: 'number', description: 'Increment between consecutive values' }
    ],
    outputs: passthroughListOutput,
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
      csharp: 'var {{list}} = Enumerable.Range((int){{start}}, (int)(({{end}} - {{start}}) / {{step}})).Select(i => {{start}} + i * {{step}}).ToList();'
    },
    help: {
      description: 'Scheduling workflow: generate odd bay numbers from 1 to 9 (1, 3, 5, 7, 9) and total them as the placement count baseline.',
      inputs: [
        { name: 'Start', description: 'Inclusive start' },
        { name: 'End', description: 'Exclusive end' },
        { name: 'Step', description: 'Increment' }
      ],
      outputs: [{ name: 'List', description: 'Resulting list of numbers' }],
      example: {
        title: 'Odd bays 1..9 and their total',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 2 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Sum', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{list}} = list(range(int({{start}}), int({{end}}), int({{step}})))'
    }
  },
  {
    type: 'List.Sequence',
    name: 'List.Sequence',
    category: 'list',
    subGroup: 'List',
    icon: '⋯',
    aliases: ['list-sequence'],
    description: 'Builds a list of count items starting at start, increasing by step each time. Unlike List.Range this is length-driven (not end-driven); ideal for generating N samples.',
    inputs: [
      { id: 'start', name: 'Start', type: 'number', description: 'Value of the first item' },
      { id: 'step', name: 'Step', type: 'number', description: 'Increment between items' },
      { id: 'count', name: 'Count', type: 'number', description: 'Number of items to produce' }
    ],
    outputs: passthroughListOutput,
    controls: [
      { id: 'start', type: 'formula', default: '0', label: 'Start' },
      { id: 'step', type: 'formula', default: '1', label: 'Step' },
      { id: 'count', type: 'formula', default: '10', label: 'Count' }
    ],
    execute(context, inputs) {
      const start = toNumber(inputs.start);
      const step = toNumber(inputs.step, 1);
      const count = Math.max(0, Math.min(10000, toInteger(inputs.count, 10)));
      return { list: Array.from({ length: count }, (_, i) => start + step * i) };
    },
    codegen: {
      python: '{{list}} = [{{start}} + {{step}} * i for i in range(int({{count}}))]',
      csharp: 'var {{list}} = Enumerable.Range(0, (int){{count}}).Select(i => {{start}} + i * {{step}}).ToList();'
    },
    help: {
      description: 'Sampling workflow: produce 5 evenly spaced sample times (0, 2, 4, 6, 8) and sum them as the total elapsed sampling duration.',
      inputs: [
        { name: 'Start', description: 'First value' },
        { name: 'Step', description: 'Increment' },
        { name: 'Count', description: 'How many items' }
      ],
      outputs: [{ name: 'List', description: 'Resulting sequence' }],
      example: {
        title: '5 sample times every 2 minutes',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 2 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 5 } },
          { type: 'List.Sequence', x: 220, y: 60 },
          { type: 'List.Sum', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'step'],
          [2, 'value', 3, 'count'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{list}} = [{{start}} + {{step}} * i for i in range(int({{count}}))]'
    }
  },
  {
    type: 'List.Repeat',
    name: 'List.Repeat',
    category: 'list',
    subGroup: 'List',
    icon: '⟳',
    aliases: ['list-repeat'],
    description: 'Produces a list by repeating a single item N times. Useful for filling defaults, building constant-value masks, or initializing accumulator arrays.',
    inputs: [
      { id: 'item', name: 'Item', type: 'any', description: 'Item to repeat' },
      { id: 'count', name: 'Count', type: 'number', description: 'How many copies to produce' }
    ],
    outputs: passthroughListOutput,
    controls: [{ id: 'count', type: 'formula', default: '5', label: 'Count' }],
    execute(context, inputs) {
      const count = Math.max(0, Math.min(10000, toInteger(inputs.count, 5)));
      return { list: Array.from({ length: count }, () => inputs.item) };
    },
    codegen: {
      python: '{{list}} = [{{item}}] * int({{count}})',
      csharp: 'var {{list}} = Enumerable.Repeat({{item}}, (int){{count}}).ToList();'
    },
    help: {
      description: 'Defaults workflow: initialise a 5-row table with the placeholder value 100 and confirm the row count downstream.',
      inputs: [
        { name: 'Item', description: 'Value to repeat' },
        { name: 'Count', description: 'Number of copies' }
      ],
      outputs: [{ name: 'List', description: 'List of repeated items' }],
      example: {
        title: 'Initialise 5 rows with default 100',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 100 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'List.Repeat', x: 220, y: 30 },
          { type: 'List.Count', x: 440, y: 30 },
          { type: 'output-watch', x: 640, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'item'],
          [1, 'value', 2, 'count'],
          [2, 'list', 3, 'list'],
          [3, 'count', 4, 'value']
        ]
      },
      sampleCode: '{{list}} = [{{item}}] * int({{count}})'
    }
  },
  {
    type: 'List.Reverse',
    name: 'List.Reverse',
    category: 'list',
    subGroup: 'List',
    icon: '⇆',
    aliases: ['list-reverse'],
    description: 'Returns a new list with the items in reverse order. Useful for flipping a sequence, reading a stack top-down, or iterating from the end.',
    inputs: listInputs(),
    outputs: listOutput('Items in reversed order'),
    controls: [],
    execute(context, inputs) {
      return { result: toList(inputs.list).slice().reverse() };
    },
    codegen: {
      python: '{{result}} = list(reversed({{list}}))',
      csharp: 'var {{result}} = {{list}}.AsEnumerable().Reverse().ToList();'
    },
    help: {
      description: 'Newest-first workflow: take a chronologically ordered range (1..6), reverse it so the latest entry comes first, and pick that newest entry as the headline reading.',
      inputs: [{ name: 'List', description: 'List to reverse' }],
      outputs: [{ name: 'Result', description: 'Reversed list' }],
      example: {
        title: 'Newest reading first (reverse 1..5, take first)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Reverse', x: 440, y: 60 },
          { type: 'List.First', x: 640, y: 60 },
          { type: 'output-watch', x: 840, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'list'],
          [5, 'item', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = list(reversed({{list}}))'
    }
  },
  {
    type: 'List.Flatten',
    name: 'List.Flatten',
    category: 'list',
    subGroup: 'List',
    icon: '▤',
    aliases: ['list-flatten'],
    description: 'Flattens a list of lists into a single one-level list. Non-list items are passed through unchanged; only one level is flattened per call (apply twice for deeper nesting).',
    inputs: listInputs('Nested list to flatten one level'),
    outputs: listOutput('Single-level list'),
    controls: [],
    execute(context, inputs) {
      return { result: toList(inputs.list).flat() };
    },
    codegen: {
      python: '{{result}} = [item for sub in {{list}} for item in (sub if isinstance(sub, list) else [sub])]',
      csharp: 'var {{result}} = {{list}}.SelectMany(x => x is IEnumerable<object> e ? e : new[] { x }).ToList();'
    },
    help: {
      description: 'Multi-floor totals workflow: combine two per-floor room lists into a list of lists, flatten to all rooms, then count the building-wide total.',
      inputs: [{ name: 'List', description: 'Nested list to flatten' }],
      outputs: [{ name: 'Result', description: 'Flattened single-level list' }],
      example: {
        title: 'Combine two floor lists and count total rooms',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 30 },
          { type: 'List.Range', x: 220, y: 140 },
          { type: 'List.Create', x: 440, y: 90 },
          { type: 'List.Flatten', x: 660, y: 90 },
          { type: 'List.Count', x: 860, y: 90 },
          { type: 'output-watch', x: 1060, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [0, 'value', 4, 'start'],
          [1, 'value', 4, 'end'],
          [2, 'value', 4, 'step'],
          [3, 'list', 5, 'item0'],
          [4, 'list', 5, 'item1'],
          [5, 'list', 6, 'list'],
          [6, 'result', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = [item for sub in {{list}} for item in (sub if isinstance(sub, list) else [sub])]'
    }
  },
  {
    type: 'List.Take',
    name: 'List.Take',
    category: 'list',
    subGroup: 'List',
    icon: '⊰',
    aliases: ['list-take'],
    description: 'Returns the first Count items of a list. Equivalent to slice [:N] in Python or .Take(N) in LINQ; negative counts return an empty list.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to slice' },
      { id: 'count', name: 'Count', type: 'number', description: 'How many items to keep from the start' }
    ],
    outputs: listOutput('First Count items'),
    controls: [{ id: 'count', type: 'formula', default: '5', label: 'Count' }],
    execute(context, inputs) {
      return { result: toList(inputs.list).slice(0, Math.max(0, toInteger(inputs.count, 5))) };
    },
    codegen: {
      python: '{{result}} = {{list}}[:int({{count}})]',
      csharp: 'var {{result}} = {{list}}.Take((int){{count}}).ToList();'
    },
    help: {
      description: 'Top-3 workflow: take the first three readings from a 1..10 sample series and total them as the early-window sum.',
      inputs: [
        { name: 'List', description: 'List to slice' },
        { name: 'Count', description: 'How many items to keep' }
      ],
      outputs: [{ name: 'Result', description: 'First N items' }],
      example: {
        title: 'First 3 readings of 1..10, summed',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 11 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 3 } },
          { type: 'List.Take', x: 440, y: 90 },
          { type: 'List.Sum', x: 640, y: 90 },
          { type: 'output-watch', x: 840, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'list'],
          [4, 'value', 5, 'count'],
          [5, 'result', 6, 'list'],
          [6, 'result', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = {{list}}[:int({{count}})]'
    }
  },
  {
    type: 'List.Skip',
    name: 'List.Skip',
    category: 'list',
    subGroup: 'List',
    icon: '⊱',
    aliases: ['list-skip'],
    description: 'Drops the first Count items and returns the rest. Mirror of List.Take; useful for ignoring header rows or warmup samples before processing.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to slice' },
      { id: 'count', name: 'Count', type: 'number', description: 'How many leading items to discard' }
    ],
    outputs: listOutput('Items after the skipped prefix'),
    controls: [{ id: 'count', type: 'formula', default: '1', label: 'Count' }],
    execute(context, inputs) {
      return { result: toList(inputs.list).slice(Math.max(0, toInteger(inputs.count, 1))) };
    },
    codegen: {
      python: '{{result}} = {{list}}[int({{count}}):]',
      csharp: 'var {{result}} = {{list}}.Skip((int){{count}}).ToList();'
    },
    help: {
      description: 'Warmup-skip workflow: discard the first two warm-up readings from a 1..6 series and sum only the steady-state samples.',
      inputs: [
        { name: 'List', description: 'List to slice' },
        { name: 'Count', description: 'Items to discard from the start' }
      ],
      outputs: [{ name: 'Result', description: 'Tail items' }],
      example: {
        title: 'Skip 2 warm-up readings, sum the rest (1..5)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 2 } },
          { type: 'List.Skip', x: 440, y: 90 },
          { type: 'List.Sum', x: 640, y: 90 },
          { type: 'output-watch', x: 840, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'list'],
          [4, 'value', 5, 'count'],
          [5, 'result', 6, 'list'],
          [6, 'result', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = {{list}}[int({{count}}):]'
    }
  },
  {
    type: 'List.Slice',
    name: 'List.Slice',
    category: 'list',
    subGroup: 'List',
    icon: '[:]',
    aliases: ['list-slice'],
    description: 'Returns the items between From (inclusive) and To (exclusive) indices. Equivalent to list[a:b] in Python; useful for cutting out a middle window of a series.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to slice' },
      { id: 'from', name: 'From', type: 'number', description: 'Inclusive start index' },
      { id: 'to', name: 'To', type: 'number', description: 'Exclusive end index' }
    ],
    outputs: listOutput('The sliced sub-list'),
    controls: [
      { id: 'from', type: 'formula', default: '0', label: 'From' },
      { id: 'to', type: 'formula', default: '5', label: 'To' }
    ],
    execute(context, inputs) {
      return { result: toList(inputs.list).slice(Math.max(0, toInteger(inputs.from)), toInteger(inputs.to, 5)) };
    },
    codegen: {
      python: '{{result}} = {{list}}[int({{from}}):int({{to}})]',
      csharp: 'var {{result}} = {{list}}.Skip((int){{from}}).Take((int){{to}} - (int){{from}}).ToList();'
    },
    help: {
      description: 'Middle-window workflow: take indices 2..5 from a 1..10 series (the values 3, 4, 5) and report their total.',
      inputs: [
        { name: 'List', description: 'List to slice' },
        { name: 'From', description: 'Inclusive start index' },
        { name: 'To', description: 'Exclusive end index' }
      ],
      outputs: [{ name: 'Result', description: 'Slice from From to To' }],
      example: {
        title: 'Middle window [2:5] of 1..10, summed',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 11 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 2 } },
          { type: 'Input.Number', x: 220, y: 230, controls: { val: 5 } },
          { type: 'List.Slice', x: 440, y: 120 },
          { type: 'List.Sum', x: 640, y: 120 },
          { type: 'output-watch', x: 840, y: 120 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 6, 'list'],
          [4, 'value', 6, 'from'],
          [5, 'value', 6, 'to'],
          [6, 'result', 7, 'list'],
          [7, 'result', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = {{list}}[int({{from}}):int({{to}})]'
    }
  },
  {
    type: 'List.Insert',
    name: 'List.Insert',
    category: 'list',
    subGroup: 'List',
    icon: '↪',
    aliases: ['list-insert'],
    description: 'Returns a new list with Item inserted at the given Index (existing items shift right). Index 0 prepends; an index past the end appends.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to insert into' },
      { id: 'item', name: 'Item', type: 'any', description: 'Value to insert' },
      { id: 'index', name: 'Index', type: 'number', description: 'Zero-based insertion index' }
    ],
    outputs: listOutput('List with the item inserted'),
    controls: [{ id: 'index', type: 'formula', default: '0', label: 'Index' }],
    execute(context, inputs) {
      const result = toList(inputs.list).slice();
      result.splice(toInteger(inputs.index), 0, inputs.item);
      return { result };
    },
    codegen: {
      python: '{{result}} = list({{list}})\n{{result}}.insert(int({{index}}), {{item}})',
      csharp: 'var {{result}} = new List<object>({{list}}); {{result}}.Insert((int){{index}}, {{item}});'
    },
    help: {
      description: 'Prepend-checkpoint workflow: insert a starting checkpoint value (99) at the head of a route 1..4 and confirm the new first stop.',
      inputs: [
        { name: 'List', description: 'List to insert into' },
        { name: 'Item', description: 'Value to insert' },
        { name: 'Index', description: 'Position' }
      ],
      outputs: [{ name: 'Result', description: 'Updated list' }],
      example: {
        title: 'Insert checkpoint 99 at start of 1..4',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 99 } },
          { type: 'Input.Number', x: 220, y: 230, controls: { val: 0 } },
          { type: 'List.Insert', x: 440, y: 120 },
          { type: 'List.First', x: 640, y: 120 },
          { type: 'output-watch', x: 840, y: 120 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 6, 'list'],
          [4, 'value', 6, 'item'],
          [5, 'value', 6, 'index'],
          [6, 'result', 7, 'list'],
          [7, 'item', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = list({{list}})\n{{result}}.insert(int({{index}}), {{item}})'
    }
  },
  {
    type: 'List.Remove',
    name: 'List.Remove',
    category: 'list',
    subGroup: 'List',
    icon: '⊖',
    aliases: ['list-remove'],
    description: 'Removes the item at a given Index and returns the resulting list along with the removed value. Out-of-range indices are clamped to the valid window.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to modify' },
      { id: 'index', name: 'Index', type: 'number', description: 'Zero-based index of the item to drop' }
    ],
    outputs: [
      { id: 'result', name: 'Result', type: 'list', description: 'Updated list without the removed item' },
      { id: 'removed', name: 'Removed', type: 'any', description: 'The value that was dropped' }
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
      csharp: 'var {{result}} = new List<object>({{list}}); var {{removed}} = {{result}}[(int){{index}}]; {{result}}.RemoveAt((int){{index}});'
    },
    help: {
      description: 'Cancelled-order workflow: drop the item at index 2 from an order list 1..6 and surface the cancelled value for the audit log.',
      inputs: [
        { name: 'List', description: 'List to modify' },
        { name: 'Index', description: 'Position to drop' }
      ],
      outputs: [
        { name: 'Result', description: 'Updated list' },
        { name: 'Removed', description: 'Dropped value' }
      ],
      example: {
        title: 'Drop index 2 from order 1..5, log the value',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 2 } },
          { type: 'List.Remove', x: 440, y: 90 },
          { type: 'output-watch', x: 640, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'list'],
          [4, 'value', 5, 'index'],
          [5, 'removed', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = list({{list}})\n{{removed}} = {{result}}.pop(int({{index}}))'
    }
  },
  {
    type: 'List.Join',
    name: 'List.Join',
    category: 'list',
    subGroup: 'List',
    icon: '⊕',
    aliases: ['list-join'],
    description: 'Concatenates two lists end-to-end into a single list. Equivalent to A + B in Python or A.Concat(B) in LINQ; preserves the order of both inputs.',
    inputs: [
      { id: 'listA', name: 'List A', type: 'list', description: 'Items placed first' },
      { id: 'listB', name: 'List B', type: 'list', description: 'Items appended after A' }
    ],
    outputs: listOutput('Concatenated list (A followed by B)'),
    controls: [],
    execute(context, inputs) {
      return { result: toList(inputs.listA).concat(toList(inputs.listB)) };
    },
    codegen: {
      python: '{{result}} = {{listA}} + {{listB}}',
      csharp: 'var {{result}} = {{listA}}.Concat({{listB}}).ToList();'
    },
    help: {
      description: 'Manifest workflow: combine two flight passenger lists (1..3 and 1..4) into a unified manifest and report the total head-count.',
      inputs: [
        { name: 'List A', description: 'First list' },
        { name: 'List B', description: 'Second list' }
      ],
      outputs: [{ name: 'Result', description: 'Combined list' }],
      example: {
        title: 'Combine two passenger manifests, count heads',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 30 },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 290, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 360, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 260 },
          { type: 'List.Join', x: 460, y: 150 },
          { type: 'List.Count', x: 680, y: 150 },
          { type: 'output-watch', x: 880, y: 150 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [4, 'value', 7, 'start'],
          [5, 'value', 7, 'end'],
          [6, 'value', 7, 'step'],
          [3, 'list', 8, 'listA'],
          [7, 'list', 8, 'listB'],
          [8, 'result', 9, 'list'],
          [9, 'count', 10, 'value']
        ]
      },
      sampleCode: '{{result}} = {{listA}} + {{listB}}'
    }
  },
  {
    type: 'List.Zip',
    name: 'List.Zip',
    category: 'list',
    subGroup: 'List',
    icon: '⫶',
    aliases: ['list-zip'],
    description: 'Pairs up corresponding items from two lists into a list of [a, b] tuples. Result length equals the shorter input; extra items in the longer list are dropped.',
    inputs: [
      { id: 'listA', name: 'List A', type: 'list', description: 'First list' },
      { id: 'listB', name: 'List B', type: 'list', description: 'Second list' }
    ],
    outputs: listOutput('List of [A, B] pairs'),
    controls: [],
    execute(context, inputs) {
      const listA = toList(inputs.listA);
      const listB = toList(inputs.listB);
      return {
        result: Array.from(
          { length: Math.min(listA.length, listB.length) },
          (_, i) => [listA[i], listB[i]]
        )
      };
    },
    codegen: {
      python: '{{result}} = list(zip({{listA}}, {{listB}}))',
      csharp: 'var {{result}} = {{listA}}.Zip({{listB}}, (a, b) => new[] { a, b }).ToList();'
    },
    help: {
      description: 'Seat-assignment workflow: pair students (1..4) with assigned seat numbers (10..14) and report how many seats were assigned.',
      inputs: [
        { name: 'List A', description: 'First list' },
        { name: 'List B', description: 'Second list' }
      ],
      outputs: [{ name: 'Result', description: 'List of pairs' }],
      example: {
        title: 'Pair students with seats, count assignments',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 30 },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 290, controls: { val: 14 } },
          { type: 'Input.Number', x: 0, y: 360, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 260 },
          { type: 'List.Zip', x: 460, y: 150 },
          { type: 'List.Count', x: 680, y: 150 },
          { type: 'output-watch', x: 880, y: 150 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [4, 'value', 7, 'start'],
          [5, 'value', 7, 'end'],
          [6, 'value', 7, 'step'],
          [3, 'list', 8, 'listA'],
          [7, 'list', 8, 'listB'],
          [8, 'result', 9, 'list'],
          [9, 'count', 10, 'value']
        ]
      },
      sampleCode: '{{result}} = list(zip({{listA}}, {{listB}}))'
    }
  },
  {
    type: 'List.CrossReference',
    name: 'List.CrossReference',
    category: 'list',
    subGroup: 'List',
    icon: '✚',
    aliases: ['list-cross-ref'],
    description: 'Produces every combination of items from two lists as parallel A/B arrays. For lists of length M and N you get M×N pairs — useful for building grids of host × guest combinations.',
    inputs: [
      { id: 'listA', name: 'List A', type: 'list', description: 'First list (outer loop)' },
      { id: 'listB', name: 'List B', type: 'list', description: 'Second list (inner loop)' }
    ],
    outputs: [
      { id: 'pairsA', name: 'A Values', type: 'list', description: 'A element of each pair' },
      { id: 'pairsB', name: 'B Values', type: 'list', description: 'B element of each pair' }
    ],
    controls: [],
    execute(context, inputs) {
      const pairsA = [];
      const pairsB = [];
      toList(inputs.listA).forEach((a) => {
        toList(inputs.listB).forEach((b) => {
          pairsA.push(a);
          pairsB.push(b);
        });
      });
      return { pairsA, pairsB };
    },
    codegen: {
      python: '{{pairsA}} = [a for a in {{listA}} for b in {{listB}}]\n{{pairsB}} = [b for a in {{listA}} for b in {{listB}}]',
      csharp: 'var {{pairsA}} = {{listA}}.SelectMany(a => {{listB}}.Select(b => a)).ToList();\nvar {{pairsB}} = {{listA}}.SelectMany(a => {{listB}}.Select(b => b)).ToList();'
    },
    help: {
      description: 'Tournament workflow: generate every host × guest pairing from 3 hosts (1..3) and 4 guests (1..4) and report the total schedule size (12 matches).',
      inputs: [
        { name: 'List A', description: 'Outer list' },
        { name: 'List B', description: 'Inner list' }
      ],
      outputs: [
        { name: 'A Values', description: 'Parallel A array' },
        { name: 'B Values', description: 'Parallel B array' }
      ],
      example: {
        title: 'Every host × guest pairing, total matches',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 30 },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 290, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 360, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 260 },
          { type: 'List.CrossReference', x: 460, y: 150 },
          { type: 'List.Count', x: 680, y: 150 },
          { type: 'output-watch', x: 880, y: 150 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [4, 'value', 7, 'start'],
          [5, 'value', 7, 'end'],
          [6, 'value', 7, 'step'],
          [3, 'list', 8, 'listA'],
          [7, 'list', 8, 'listB'],
          [8, 'pairsA', 9, 'list'],
          [9, 'count', 10, 'value']
        ]
      },
      sampleCode: '{{pairsA}} = [a for a in {{listA}} for b in {{listB}}]'
    }
  },
  {
    type: 'List.FilterByBoolean',
    name: 'List.FilterByBoolean',
    category: 'list',
    subGroup: 'List',
    icon: '⊘',
    aliases: ['list-filterbool'],
    description: 'Splits a list into two by a parallel boolean mask: items kept where the mask is true go to In, the rest go to Out. The mask should be the same length as the input list.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'Values to filter' },
      { id: 'mask', name: 'Booleans', type: 'list', description: 'Parallel boolean mask (same length)' }
    ],
    outputs: [
      { id: 'inList', name: 'In (True)', type: 'list', description: 'Items where the mask is true' },
      { id: 'outList', name: 'Out (False)', type: 'list', description: 'Items where the mask is false' }
    ],
    controls: [],
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
      python: '{{inList}} = [v for v, m in zip({{list}}, {{mask}}) if m]\n{{outList}} = [v for v, m in zip({{list}}, {{mask}}) if not m]',
      csharp: 'var {{inList}} = {{list}}.Zip({{mask}}, (v, m) => new { v, m }).Where(x => (bool)x.m).Select(x => x.v).ToList();'
    },
    help: {
      description: 'Active-room workflow: keep only the items where the boolean mask is true (active rooms) from a list of room numbers and report how many remain.',
      inputs: [
        { name: 'List', description: 'Values to filter' },
        { name: 'Booleans', description: 'Parallel mask' }
      ],
      outputs: [
        { name: 'In (True)', description: 'Kept items' },
        { name: 'Out (False)', description: 'Rejected items' }
      ],
      example: {
        title: 'Keep active rooms (T, F, T) from a 3-room list',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 101 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 102 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 103 } },
          { type: 'List.Create', x: 220, y: 60 },
          { type: 'Input.Boolean', x: 0, y: 220, controls: { val: 'True' } },
          { type: 'Input.Boolean', x: 0, y: 290, controls: { val: 'False' } },
          { type: 'Input.Boolean', x: 0, y: 360, controls: { val: 'True' } },
          { type: 'List.Create', x: 220, y: 280 },
          { type: 'List.FilterByBoolean', x: 460, y: 170 },
          { type: 'List.Count', x: 680, y: 170 },
          { type: 'output-watch', x: 880, y: 170 }
        ],
        wires: [
          [0, 'value', 3, 'item0'],
          [1, 'value', 3, 'item1'],
          [2, 'value', 3, 'item2'],
          [4, 'value', 7, 'item0'],
          [5, 'value', 7, 'item1'],
          [6, 'value', 7, 'item2'],
          [3, 'list', 8, 'list'],
          [7, 'list', 8, 'mask'],
          [8, 'inList', 9, 'list'],
          [9, 'count', 10, 'value']
        ]
      },
      sampleCode: '{{inList}} = [v for v, m in zip({{list}}, {{mask}}) if m]'
    }
  },
  {
    type: 'List.Sum',
    name: 'List.Sum',
    category: 'list',
    subGroup: 'List',
    icon: 'Σ',
    aliases: ['list-sum'],
    description: 'Adds every numeric item in a list and returns the total. Non-numeric values are skipped silently; empty lists return 0.',
    inputs: listInputs('Numeric list to total'),
    outputs: numberOutput('Sum of all numeric items'),
    controls: [],
    execute(context, inputs) {
      return { result: numericItems(inputs.list).reduce((s, v) => s + v, 0) };
    },
    codegen: {
      python: '{{result}} = sum({{list}})',
      csharp: 'double {{result}} = {{list}}.OfType<double>().Sum();'
    },
    help: {
      description: 'Total-area workflow: sum the per-room areas of a 1..5 sample to report the floor-wide total area downstream.',
      inputs: [{ name: 'List', description: 'Numeric list' }],
      outputs: [{ name: 'Result', description: 'Sum total' }],
      example: {
        title: 'Total floor area (sum of 1..4)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Sum', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{result}} = sum({{list}})'
    }
  },
  {
    type: 'List.Average',
    name: 'List.Average',
    category: 'list',
    subGroup: 'List',
    icon: 'μ',
    aliases: ['list-average'],
    description: 'Returns the arithmetic mean of the numeric items in a list. Non-numeric values are skipped silently; empty lists return 0.',
    inputs: listInputs('Numeric list to average'),
    outputs: numberOutput('Arithmetic mean of numeric items'),
    controls: [],
    execute(context, inputs) {
      const nums = numericItems(inputs.list);
      return { result: nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0 };
    },
    codegen: {
      python: '{{result}} = sum({{list}}) / len({{list}})',
      csharp: 'double {{result}} = {{list}}.OfType<double>().Average();'
    },
    help: {
      description: 'Mean-thickness workflow: average the four wall-thickness samples (1..4) to report the typical thickness for the assembly.',
      inputs: [{ name: 'List', description: 'Numeric list' }],
      outputs: [{ name: 'Result', description: 'Mean value' }],
      example: {
        title: 'Mean of wall thicknesses 1..4',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Average', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{result}} = sum({{list}}) / len({{list}})'
    }
  },
  {
    type: 'List.Min',
    name: 'List.Min',
    category: 'list',
    subGroup: 'List',
    icon: '↓',
    aliases: ['list-minval'],
    description: 'Returns the smallest numeric item in a list. Non-numeric values are skipped; empty lists return undefined.',
    inputs: listInputs('Numeric list to scan'),
    outputs: numberOutput('Smallest numeric item'),
    controls: [],
    execute(context, inputs) {
      const nums = numericItems(inputs.list);
      return { result: nums.length ? Math.min(...nums) : undefined };
    },
    codegen: {
      python: '{{result}} = min({{list}})',
      csharp: 'double {{result}} = {{list}}.OfType<double>().Min();'
    },
    help: {
      description: 'Lightest-load workflow: scan column loads (1..6) and surface the lightest load value for the foundation sizing report.',
      inputs: [{ name: 'List', description: 'Numeric list' }],
      outputs: [{ name: 'Result', description: 'Smallest value' }],
      example: {
        title: 'Smallest column load from 1..5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Min', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{result}} = min({{list}})'
    }
  },
  {
    type: 'List.Max',
    name: 'List.Max',
    category: 'list',
    subGroup: 'List',
    icon: '↑',
    aliases: ['list-maxval'],
    description: 'Returns the largest numeric item in a list. Non-numeric values are skipped; empty lists return undefined.',
    inputs: listInputs('Numeric list to scan'),
    outputs: numberOutput('Largest numeric item'),
    controls: [],
    execute(context, inputs) {
      const nums = numericItems(inputs.list);
      return { result: nums.length ? Math.max(...nums) : undefined };
    },
    codegen: {
      python: '{{result}} = max({{list}})',
      csharp: 'double {{result}} = {{list}}.OfType<double>().Max();'
    },
    help: {
      description: 'Heaviest-load workflow: scan column loads (1..6) and surface the largest load value for structural sizing.',
      inputs: [{ name: 'List', description: 'Numeric list' }],
      outputs: [{ name: 'Result', description: 'Largest value' }],
      example: {
        title: 'Largest column load from 1..5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Max', x: 440, y: 60 },
          { type: 'output-watch', x: 640, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{result}} = max({{list}})'
    }
  },
  {
    type: 'List.Sort',
    name: 'List.Sort',
    category: 'list',
    subGroup: 'List',
    icon: '↕',
    aliases: ['list-sort'],
    description: 'Returns a new list sorted ascending or descending. Numeric items are compared numerically; otherwise items are compared as strings via locale-aware ordering.',
    inputs: listInputs('List to sort'),
    outputs: listOutput('Sorted list'),
    controls: [
      { id: 'desc', type: 'dropdown', options: ['Ascending', 'Descending'], default: 'Ascending', label: 'Order' }
    ],
    execute(context, inputs, controls) {
      const result = toList(inputs.list).slice().sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a).localeCompare(String(b));
      });
      return { result: controls.desc === 'Descending' ? result.reverse() : result };
    },
    codegen: {
      python: '{{result}} = sorted({{list}})',
      csharp: 'var {{result}} = {{list}}.OrderBy(x => x).ToList();'
    },
    help: {
      description: 'Ranking workflow: sort a list of unsorted column loads, then pick the smallest as the baseline for downstream sizing.',
      inputs: [{ name: 'List', description: 'List to sort' }],
      outputs: [{ name: 'Result', description: 'Sorted list' }],
      example: {
        title: 'Sort 3 column loads, take smallest',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 12 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 8 } },
          { type: 'List.Create', x: 220, y: 60 },
          { type: 'List.Sort', x: 440, y: 60 },
          { type: 'List.First', x: 640, y: 60 },
          { type: 'output-watch', x: 840, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'item0'],
          [1, 'value', 3, 'item1'],
          [2, 'value', 3, 'item2'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'list'],
          [5, 'item', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = sorted({{list}})'
    }
  },
  {
    type: 'List.Shuffle',
    name: 'List.Shuffle',
    category: 'list',
    subGroup: 'List',
    icon: '⤮',
    aliases: ['list-shuffle'],
    description: 'Returns a randomly permuted copy of the input list, driven by an integer Seed for reproducible results. Changing the seed yields a different permutation.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to permute' },
      { id: 'seed', name: 'Seed', type: 'number', description: 'Integer seed for the pseudorandom generator' }
    ],
    outputs: listOutput('Randomly permuted list'),
    controls: [{ id: 'seed', type: 'formula', default: '0', label: 'Seed' }],
    execute(context, inputs) {
      const result = toList(inputs.list).slice();
      let seed = toInteger(inputs.seed);
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return { result };
    },
    codegen: {
      python: 'import random\n_r = random.Random(int({{seed}}))\n{{result}} = list({{list}})\n_r.shuffle({{result}})',
      csharp: 'var _r = new Random((int){{seed}}); var {{result}} = {{list}}.OrderBy(_ => _r.Next()).ToList();'
    },
    help: {
      description: 'Random-draw workflow: shuffle a participant list (1..6) with a fixed seed for reproducibility and surface the first drawn participant.',
      inputs: [
        { name: 'List', description: 'List to shuffle' },
        { name: 'Seed', description: 'Random seed' }
      ],
      outputs: [{ name: 'Result', description: 'Shuffled list' }],
      example: {
        title: 'Random first participant from 1..5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 42 } },
          { type: 'List.Shuffle', x: 440, y: 90 },
          { type: 'List.First', x: 640, y: 90 },
          { type: 'output-watch', x: 840, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'list'],
          [4, 'value', 5, 'seed'],
          [5, 'result', 6, 'list'],
          [6, 'item', 7, 'value']
        ]
      },
      sampleCode: 'import random; _r = random.Random({{seed}}); {{result}} = list({{list}}); _r.shuffle({{result}})'
    }
  },
  {
    type: 'List.Unique',
    name: 'List.Unique',
    category: 'list',
    subGroup: 'List',
    icon: '∪',
    aliases: ['list-unique'],
    description: 'Returns a list of distinct items in their original order of first appearance. Equivalent to dict.fromkeys() in Python or .Distinct() in LINQ.',
    inputs: listInputs('List to deduplicate'),
    outputs: listOutput('List with duplicates removed'),
    controls: [],
    execute(context, inputs) {
      return { result: Array.from(new Set(toList(inputs.list))) };
    },
    codegen: {
      python: '{{result}} = list(dict.fromkeys({{list}}))',
      csharp: 'var {{result}} = {{list}}.Distinct().ToList();'
    },
    help: {
      description: 'Distinct-materials workflow: deduplicate a list of repeated floor-material codes and report how many distinct materials appear.',
      inputs: [{ name: 'List', description: 'List to deduplicate' }],
      outputs: [{ name: 'Result', description: 'Distinct items' }],
      example: {
        title: 'Distinct material codes from [1,2,2,3,3]',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 2 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 2 } },
          { type: 'Input.Number', x: 0, y: 210, controls: { val: 3 } },
          { type: 'Input.Number', x: 0, y: 280, controls: { val: 3 } },
          { type: 'List.Create', x: 220, y: 140 },
          { type: 'List.Unique', x: 440, y: 140 },
          { type: 'List.Count', x: 640, y: 140 },
          { type: 'output-watch', x: 840, y: 140 }
        ],
        wires: [
          [0, 'value', 5, 'item0'],
          [1, 'value', 5, 'item1'],
          [2, 'value', 5, 'item2'],
          [3, 'value', 5, 'item3'],
          [4, 'value', 5, 'item4'],
          [5, 'list', 6, 'list'],
          [6, 'result', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = list(dict.fromkeys({{list}}))'
    }
  },
  {
    type: 'List.Chunk',
    name: 'List.Chunk',
    category: 'list',
    subGroup: 'List',
    icon: '▥',
    aliases: ['list-chunk'],
    description: 'Splits a list into contiguous sub-lists of length Size. The final chunk may be shorter if the list does not divide evenly; size must be at least 1.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to partition' },
      { id: 'size', name: 'Size', type: 'number', description: 'Items per chunk' }
    ],
    outputs: listOutput('List of chunks'),
    controls: [{ id: 'size', type: 'formula', default: '3', label: 'Size' }],
    execute(context, inputs) {
      const list = toList(inputs.list);
      const size = Math.max(1, toInteger(inputs.size, 3));
      const result = [];
      for (let i = 0; i < list.length; i += size) {
        result.push(list.slice(i, i + size));
      }
      return { result };
    },
    codegen: {
      python: '{{result}} = [{{list}}[i:i+int({{size}})] for i in range(0, len({{list}}), int({{size}}))]',
      csharp: 'var {{result}} = {{list}}.Select((x, i) => new { x, i }).GroupBy(g => g.i / (int){{size}}).Select(g => g.Select(x => x.x).ToList()).ToList();'
    },
    help: {
      description: 'Pagination workflow: partition 1..6 invoices into chunks of 2 per page and report the resulting page count.',
      inputs: [
        { name: 'List', description: 'List to partition' },
        { name: 'Size', description: 'Items per chunk' }
      ],
      outputs: [{ name: 'Result', description: 'List of chunks' }],
      example: {
        title: 'Paginate 1..6 invoices into pages of 2',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 7 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 2 } },
          { type: 'List.Chunk', x: 440, y: 90 },
          { type: 'List.Count', x: 640, y: 90 },
          { type: 'output-watch', x: 840, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'list'],
          [4, 'value', 5, 'size'],
          [5, 'result', 6, 'list'],
          [6, 'count', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = [{{list}}[i:i+int({{size}})] for i in range(0, len({{list}}), int({{size}}))]'
    }
  },
  {
    type: 'List.Transpose',
    name: 'List.Transpose',
    category: 'list',
    subGroup: 'List',
    icon: '⊤',
    aliases: ['list-transpose'],
    description: 'Transposes a list of lists (rows → columns). Equivalent to zip(*rows) in Python; the result length equals the longest row, with undefined filling short rows.',
    inputs: listInputs('List of rows (each row a list)'),
    outputs: listOutput('List of columns'),
    controls: [],
    execute(context, inputs) {
      const rows = toList(inputs.list);
      const maxLength = rows.reduce((m, r) => (Array.isArray(r) ? Math.max(m, r.length) : m), 0);
      return {
        result: Array.from({ length: maxLength }, (_, i) =>
          rows.map((r) => (Array.isArray(r) ? r[i] : undefined))
        )
      };
    },
    codegen: {
      python: '{{result}} = list(map(list, zip(*{{list}})))',
      csharp: 'var {{result}} = Enumerable.Range(0, {{list}}.Max(r => r.Count)).Select(i => {{list}}.Select(r => r.ElementAtOrDefault(i)).ToList()).ToList();'
    },
    help: {
      description: 'Rows-to-columns workflow: transpose a 2-row grid built from two 1..3 ranges and count how many resulting columns the operation produced.',
      inputs: [{ name: 'List', description: 'Rows to transpose' }],
      outputs: [{ name: 'Result', description: 'Columns' }],
      example: {
        title: 'Transpose 2 rows of length 3, count columns',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 30 },
          { type: 'List.Range', x: 220, y: 140 },
          { type: 'List.Create', x: 440, y: 90 },
          { type: 'List.Transpose', x: 660, y: 90 },
          { type: 'List.Count', x: 860, y: 90 },
          { type: 'output-watch', x: 1060, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [0, 'value', 4, 'start'],
          [1, 'value', 4, 'end'],
          [2, 'value', 4, 'step'],
          [3, 'list', 5, 'item0'],
          [4, 'list', 5, 'item1'],
          [5, 'list', 6, 'list'],
          [6, 'result', 7, 'list'],
          [7, 'count', 8, 'value']
        ]
      },
      sampleCode: '{{result}} = list(map(list, zip(*{{list}})))'
    }
  },
  {
    type: 'List.Pairs',
    name: 'List.Pairs',
    category: 'list',
    subGroup: 'List',
    icon: '⟷',
    aliases: ['list-pairs'],
    description: 'Returns the list of consecutive [i, i+1] pairs from the input list. A list of length N yields N-1 pairs; useful for building wall segments or adjacent-distance calculations.',
    inputs: listInputs('Source list'),
    outputs: listOutput('Consecutive [a, b] pairs'),
    controls: [],
    execute(context, inputs) {
      const list = toList(inputs.list);
      return { result: list.slice(0, -1).map((v, i) => [v, list[i + 1]]) };
    },
    codegen: {
      python: '{{result}} = list(zip({{list}}[:-1], {{list}}[1:]))',
      csharp: 'var {{result}} = {{list}}.Zip({{list}}.Skip(1), (a, b) => new[] { a, b }).ToList();'
    },
    help: {
      description: 'Adjacent-waypoint workflow: build consecutive waypoint pairs from a 1..5 route and report how many leg segments the route contains.',
      inputs: [{ name: 'List', description: 'Source list' }],
      outputs: [{ name: 'Result', description: 'List of [a, b] pairs' }],
      example: {
        title: 'Number of leg segments from a 5-waypoint route',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Pairs', x: 440, y: 60 },
          { type: 'List.Count', x: 640, y: 60 },
          { type: 'output-watch', x: 840, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'list'],
          [5, 'count', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = list(zip({{list}}[:-1], {{list}}[1:]))'
    }
  },
  {
    type: 'List.IndexOf',
    name: 'List.IndexOf',
    category: 'list',
    subGroup: 'List',
    icon: '⌖',
    aliases: ['list-indexof'],
    description: 'Returns the zero-based index of the first matching item, or -1 if the item is not found. Uses strict equality (===) for the comparison.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to search' },
      { id: 'item', name: 'Item', type: 'any', description: 'Value to find' }
    ],
    outputs: [{ id: 'index', name: 'Index', type: 'number', description: 'Position of the first match, or -1' }],
    controls: [{ id: 'item', type: 'formula', default: '0', label: 'Item' }],
    execute(context, inputs) {
      return { index: toList(inputs.list).indexOf(inputs.item) };
    },
    codegen: {
      python: '{{index}} = {{list}}.index({{item}}) if {{item}} in {{list}} else -1',
      csharp: 'int {{index}} = {{list}}.ToList().IndexOf({{item}});'
    },
    help: {
      description: 'Locate-target workflow: find the position of waypoint 3 in a 1..6 route so downstream nodes can branch from that exact index.',
      inputs: [
        { name: 'List', description: 'List to search' },
        { name: 'Item', description: 'Value to find' }
      ],
      outputs: [{ name: 'Index', description: 'Position or -1' }],
      example: {
        title: 'Find position of waypoint 3 in route 1..5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 3 } },
          { type: 'List.IndexOf', x: 440, y: 90 },
          { type: 'output-watch', x: 640, y: 90 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'list'],
          [4, 'value', 5, 'item'],
          [5, 'index', 6, 'value']
        ]
      },
      sampleCode: '{{index}} = {{list}}.index({{item}}) if {{item}} in {{list}} else -1'
    }
  },
  {
    type: 'List.Contains',
    name: 'List.Contains',
    category: 'list',
    subGroup: 'List',
    icon: '∈',
    aliases: ['list-contains'],
    description: 'Returns true when the list contains the given item (strict equality). Drives downstream Logic.If branches to select an action based on membership.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'List to test' },
      { id: 'item', name: 'Item', type: 'any', description: 'Value to look for' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'boolean', description: 'True when the list contains the item' }],
    controls: [{ id: 'item', type: 'formula', default: '0', label: 'Item' }],
    execute(context, inputs) {
      return { result: toList(inputs.list).includes(inputs.item) };
    },
    codegen: {
      python: '{{result}} = {{item}} in {{list}}',
      csharp: 'bool {{result}} = {{list}}.Contains({{item}});'
    },
    help: {
      description: 'Membership-gate workflow: check whether the target room number 3 appears in a list of active rooms (1..5) and pick the "active" label (1) or "missing" label (0) accordingly.',
      inputs: [
        { name: 'List', description: 'List to test' },
        { name: 'Item', description: 'Value to look for' }
      ],
      outputs: [{ name: 'Result', description: 'True if present' }],
      example: {
        title: 'Is room 3 in the active list 1..5?',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 6 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'Input.Number', x: 220, y: 160, controls: { val: 3 } },
          { type: 'List.Contains', x: 440, y: 90 },
          { type: 'Input.Number', x: 440, y: 200, controls: { val: 1 } },
          { type: 'Input.Number', x: 440, y: 270, controls: { val: 0 } },
          { type: 'Logic.If', x: 660, y: 150 },
          { type: 'output-watch', x: 860, y: 150 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 5, 'list'],
          [4, 'value', 5, 'item'],
          [5, 'result', 8, 'condition'],
          [6, 'value', 8, 'ifTrue'],
          [7, 'value', 8, 'ifFalse'],
          [8, 'result', 9, 'value']
        ]
      },
      sampleCode: '{{result}} = {{item}} in {{list}}'
    }
  },
  {
    type: 'List.Map',
    name: 'List.Map',
    category: 'list',
    subGroup: 'List',
    icon: 'λ',
    aliases: ['list-map'],
    description: 'Applies the f(x) formula control to every item and returns the transformed list. The expression sees each item as x; useful for unit conversion or scaling samples.',
    inputs: listInputs('List of values'),
    outputs: listOutput('List of f(x) results'),
    controls: [{ id: 'code', type: 'formula', default: 'x * 2', label: 'f(x)' }],
    execute(context, inputs, controls) {
      const fn = compileExpression(controls.code, 'x');
      return { result: toList(inputs.list).map((item) => fn(item)) };
    },
    codegen: {
      python: '{{result}} = [{{code}} for x in {{list}}]',
      csharp: 'var {{result}} = {{list}}.Select(x => {{code}}).ToList();'
    },
    help: {
      description: 'Unit-conversion workflow: scale every measurement in 1..5 by 2 (e.g. metres → half-metres) and total the converted result downstream.',
      inputs: [{ name: 'List', description: 'List of values' }],
      outputs: [{ name: 'Result', description: 'Transformed list' }],
      example: {
        title: 'Double 1..4 and total the results',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.Map', x: 440, y: 60, controls: { code: 'x * 2' } },
          { type: 'List.Sum', x: 640, y: 60 },
          { type: 'output-watch', x: 840, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'list'],
          [5, 'result', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = [{{code}} for x in {{list}}]'
    }
  },
  {
    type: 'List.GroupBy',
    name: 'List.GroupBy',
    category: 'list',
    subGroup: 'List',
    icon: '⊟',
    aliases: ['list-groupby'],
    description: 'Groups list items by key. If a parallel Keys list is supplied it is used directly; otherwise the Key f(x) formula computes a key from each item. Returns parallel arrays of groups and their keys.',
    inputs: [
      { id: 'list', name: 'List', type: 'list', description: 'Items to group' },
      { id: 'keys', name: 'Keys', type: 'list', description: 'Optional parallel list of keys (same length as list)' }
    ],
    outputs: [
      { id: 'groups', name: 'Groups', type: 'list', description: 'List of grouped items (one inner list per key)' },
      { id: 'groupKeys', name: 'Keys', type: 'list', description: 'Distinct group keys in encounter order' }
    ],
    controls: [{ id: 'expr', type: 'formula', default: 'x % 3', label: 'Key f(x)' }],
    execute(context, inputs, controls) {
      const list = toList(inputs.list);
      const keys = toList(inputs.keys);
      const keyFn = compileExpression(controls.expr, 'x');
      const grouped = new Map();
      list.forEach((item, i) => {
        const k = i < keys.length ? keys[i] : keyFn(item);
        const mk = String(k);
        if (!grouped.has(mk)) grouped.set(mk, { key: k, items: [] });
        grouped.get(mk).items.push(item);
      });
      return {
        groups: Array.from(grouped.values()).map((g) => g.items),
        groupKeys: Array.from(grouped.values()).map((g) => g.key)
      };
    },
    codegen: {
      python: '_g = {}\nfor x in {{list}}:\n    k = {{expr}}\n    _g.setdefault(k, []).append(x)\n{{groupKeys}} = list(_g.keys())\n{{groups}} = list(_g.values())',
      csharp: 'var _g = {{list}}.GroupBy(x => {{expr}}); var {{groupKeys}} = _g.Select(g => g.Key).ToList(); var {{groups}} = _g.Select(g => g.ToList()).ToList();'
    },
    help: {
      description: 'Floor-grouping workflow: bucket room numbers 1..7 by floor (x % 3) and report how many distinct floors the building has.',
      inputs: [
        { name: 'List', description: 'Items to group' },
        { name: 'Keys', description: 'Optional parallel keys' }
      ],
      outputs: [
        { name: 'Groups', description: 'List of grouped items' },
        { name: 'Keys', description: 'Distinct keys in order' }
      ],
      example: {
        title: 'Group rooms by floor (x % 3), count distinct floors',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 1 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 8 } },
          { type: 'Input.Number', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 220, y: 60 },
          { type: 'List.GroupBy', x: 440, y: 60, controls: { expr: 'x % 3' } },
          { type: 'List.Count', x: 660, y: 60 },
          { type: 'output-watch', x: 860, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'groupKeys', 5, 'list'],
          [5, 'count', 6, 'value']
        ]
      },
      sampleCode: '_g = {}\nfor x in {{list}}:\n    _g.setdefault({{expr}}, []).append(x)'
    }
  }
];
