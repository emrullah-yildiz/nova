export const testingCategory = {
  id: 'testing',
  name: 'Testing',
  color: '#f5c2e7',
  icon: '⚡'
};

export const testingNodes = [
  {
    type: 'Testing.SlowCompute',
    name: 'Testing.SlowCompute',
    category: 'testing',
    subGroup: 'Testing',
    icon: '⏱',
    aliases: ['slow-compute'],
    description: 'A debug-only node that returns its input after an artificial delay. Used to exercise the Run/Cancel UX — the engine special-cases this type to return a Promise that resolves after Delay (ms) or aborts when the user cancels.',
    inputs: [
      { id: 'value', name: 'Value', type: 'number', description: 'Value to pass through after the delay' }
    ],
    outputs: [
      { id: 'result', name: 'Result', type: 'number', description: 'Input value, delayed' }
    ],
    controls: [
      { id: 'delayMs', type: 'formula', default: '5000', label: 'Delay (ms)' }
    ],
    metadata: {
      skipSampleExecution: true
    },
    execute() {
      return { result: undefined };
    },
    codegen: {
      python: '{{result}} = {{value}}',
      csharp: 'var {{result}} = {{value}};'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Pass-through value' }],
      outputs: [{ name: 'Result', description: 'Delayed pass-through value' }],
      example: {
        title: 'Delay a constant 7 by Delay ms',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 7 } },
          { type: 'Testing.SlowCompute', x: 240, y: 0 },
          { type: 'Output.Watch', x: 480, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'value'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: '{{result}} = {{value}}'
    }
  }
];
