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
    outputs: [{ id: 'result', name: 'Result', type: 'number' }],
    controls: [
      { id: 'a', type: 'formula', default: '0', label: 'A' },
      { id: 'b', type: 'formula', default: '0', label: 'B' }
    ],
    lacing: { mode: 'shortest' },
    execute(context, inputs) {
      return { result: Number(inputs.a || 0) + Number(inputs.b || 0) };
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
