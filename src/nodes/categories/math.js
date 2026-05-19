export const mathCategory = {
  id: 'math',
  name: 'Math',
  color: '#a6e3a1',
  icon: 'Σ'
};

export const mathNodes = [
  {
    type: 'math.add',
  name: 'Math.Add',
  category: 'math',
  icon: '+',

  inputs: [
    { id: 'a', name: 'A', type: 'number' },
    { id: 'b', name: 'B', type: 'number' }
  ],

  outputs: [
    { id: 'result', name: 'Result', type: 'number' }
  ],

  controls: [
    { id: 'a', type: 'formula', default: '0', label: 'A' },
    { id: 'b', type: 'formula', default: '0', label: 'B' }
  ],

  lacing: { mode: 'shortest' },

  execute(context, inputs) {
    const a = inputs.a ?? 0;
    const b = inputs.b ?? 0;

    const toNumber = (v) => Number(v ?? 0);

    const add = (x, y) => toNumber(x) + toNumber(y);

    const isArrayA = Array.isArray(a);
    const isArrayB = Array.isArray(b);

    // List + List
    if (isArrayA && isArrayB) {
      const length = Math.min(a.length, b.length);

      return {
        result: Array.from({ length }, (_, i) => add(a[i], b[i]))
      };
    }

    // List + Scalar
    if (isArrayA) {
      return {
        result: a.map(v => add(v, b))
      };
    }

    // Scalar + List
    if (isArrayB) {
      return {
        result: b.map(v => add(a, v))
      };
    }

    // Scalar + Scalar
    return {
      result: add(a, b)
    };
  },

  codegen: {
    python: '{{result}} = {{a}} + {{b}}',
    csharp: ''
  }
  },
  {
    type: 'math.multiply',
    name: 'Math.Multiply',
    category: 'math',
    icon: '×',
    inputs: [
      { id: 'a', name: 'A', type: 'number' },
      { id: 'b', name: 'B', type: 'number' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'number' }],
    controls: [
      { id: 'a', type: 'formula', default: '1', label: 'A' },
      { id: 'b', type: 'formula', default: '1', label: 'B' }
    ],
    lacing: { mode: 'shortest' },
    execute(context, inputs) {
      return { result: Number(inputs.a || 0) * Number(inputs.b || 0) };
    },
    codegen: {
      python: '{{result}} = {{a}} * {{b}}',
      csharp: ''
    }
  }
];
