export const customCategory = {
  id: 'custom',
  name: 'Custom / AI',
  color: '#94e2d5',
  icon: '✦'
};

function safeJsFunction(body, argNames) {
  try {
    return new Function(...argNames, body);
  } catch (e) {
    return null;
  }
}

export const customNodes = [
  {
    type: 'Custom.AI',
    name: 'Custom.AI',
    category: 'custom',
    subGroup: 'Custom',
    icon: '✦',
    aliases: ['custom-ainode'],
    description: 'A placeholder node that passes its input straight through to its output. The Prompt control records a natural-language description of the behavior an AI assistant should generate later.',
    inputs: [
      { id: 'in0', name: 'Input', type: 'any', description: 'Input value passed through to the output' }
    ],
    outputs: [
      { id: 'out0', name: 'Output', type: 'any', description: 'Same value as the input (until AI behavior is generated)' }
    ],
    controls: [
      { id: 'prompt', type: 'text', default: 'Describe behavior…', label: 'Prompt' }
    ],
    execute(context, inputs) {
      return { out0: inputs.in0 };
    },
    codegen: {
      python: '# AI: {{ctrl.prompt}}\n{{out0}} = {{in0}}',
      csharp: '/* AI: {{ctrl.prompt}} */ var {{out0}} = {{in0}};'
    },
    help: {
      inputs: [{ name: 'Input', description: 'Source value' }],
      outputs: [{ name: 'Output', description: 'Pass-through' }],
      example: {
        title: 'AI placeholder — passes 42 straight through',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 42 } },
          { type: 'Custom.AI', x: 240, y: 0 },
          { type: 'Output.Watch', x: 480, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'in0'],
          [1, 'out0', 2, 'value']
        ]
      },
      sampleCode: '{{out0}} = {{in0}}'
    }
  },
  {
    type: 'Custom.Code',
    name: 'Custom.Code',
    category: 'custom',
    subGroup: 'Custom',
    icon: '{ }',
    aliases: ['custom-code'],
    description: 'A JavaScript code block that takes a single input (named input0) and returns one value. The Code control is the body of an anonymous function, so it must contain an explicit return statement.',
    inputs: [
      { id: 'input0', name: 'input0', type: 'any', description: 'Single input value passed to the code block as input0' }
    ],
    outputs: [
      { id: 'output0', name: 'output0', type: 'any', description: 'Value returned by the code block' }
    ],
    controls: [
      { id: 'code', type: 'text', default: 'return input0;', label: 'Code' }
    ],
    execute(context, inputs, controls) {
      const fn = safeJsFunction(String(controls.code || 'return input0;'), ['input0']);
      if (!fn) return { output0: undefined };
      try {
        return { output0: fn(inputs.input0) };
      } catch (e) {
        return { output0: undefined };
      }
    },
    codegen: {
      python: '{{output0}} = (lambda input0: {{ctrl.code}})({{input0}})',
      csharp: 'var {{output0}} = (new Func<object, object>((input0) => { {{ctrl.code}} }))({{input0}});'
    },
    help: {
      inputs: [{ name: 'input0', description: 'Single input' }],
      outputs: [{ name: 'output0', description: 'Return value' }],
      example: {
        title: 'Pass 5 through default code (return input0) → 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Custom.Code', x: 240, y: 0 },
          { type: 'Output.Watch', x: 480, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'input0'],
          [1, 'output0', 2, 'value']
        ]
      },
      sampleCode: '{{output0}} = (lambda input0: {{ctrl.code}})({{input0}})'
    }
  },
  {
    type: 'Custom.Comment',
    name: 'Custom.Comment',
    category: 'custom',
    subGroup: 'Custom',
    icon: '💬',
    aliases: ['custom-comment'],
    description: 'A canvas-only note. Holds free-form text for documenting a workflow; it has no input or output ports, never affects compute results, and emits nothing but a Python comment in generated code.',
    inputs: [],
    outputs: [],
    controls: [
      { id: 'text', type: 'text', default: 'Add notes here…', label: 'Note' }
    ],
    preview: false,
    execute(context, inputs, controls) {
      return controls.text;
    },
    codegen: {
      python: '# {{ctrl.text}}',
      csharp: '// {{ctrl.text}}'
    },
    help: {
      inputs: [],
      outputs: [],
      example: {
        title: 'A standalone comment',
        nodes: [
          { type: 'Custom.Comment', x: 0, y: 0, controls: { text: 'Workflow notes go here' } }
        ],
        wires: []
      },
      sampleCode: '# {{ctrl.text}}'
    }
  },
  {
    type: 'Custom.Formula',
    name: 'Custom.Formula',
    category: 'custom',
    subGroup: 'Custom',
    icon: 'ƒ',
    aliases: ['custom-formula'],
    description: 'Evaluates a single math expression against the two numeric inputs x and y. The Expression control is a JavaScript expression — the default x + y can be replaced with any formula that returns a number.',
    inputs: [
      { id: 'x', name: 'x', type: 'number', description: 'First numeric input' },
      { id: 'y', name: 'y', type: 'number', description: 'Second numeric input' }
    ],
    outputs: [
      { id: 'result', name: 'Result', type: 'number', description: 'Value of the expression' }
    ],
    controls: [
      { id: 'expr', type: 'text', default: 'x + y', label: 'Expression' }
    ],
    execute(context, inputs, controls) {
      const expr = String(controls.expr || 'x + y');
      const fn = safeJsFunction('return (' + expr + ');', ['x', 'y']);
      if (!fn) return { result: undefined };
      try {
        return { result: fn(Number(inputs.x) || 0, Number(inputs.y) || 0) };
      } catch (e) {
        return { result: undefined };
      }
    },
    codegen: {
      python: '{{result}} = {{ctrl.expr}}',
      csharp: 'var {{result}} = {{ctrl.expr}};'
    },
    help: {
      inputs: [
        { name: 'x', description: 'First number' },
        { name: 'y', description: 'Second number' }
      ],
      outputs: [{ name: 'Result', description: 'Evaluated value' }],
      example: {
        title: 'Default expression x + y on 5 and 3 → 8',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 3 } },
          { type: 'Custom.Formula', x: 240, y: 30 },
          { type: 'Output.Watch', x: 480, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'x'],
          [1, 'value', 2, 'y'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: '{{result}} = {{ctrl.expr}}'
    }
  },
  {
    type: 'Custom.Python',
    name: 'Custom.Python',
    category: 'custom',
    subGroup: 'Custom',
    icon: '🐍',
    aliases: ['custom-python'],
    description: 'A Python code block executed by the embedded Python runtime (Pyodide). The Python control is the source; the engine special-cases this node type to route it through PythonRunner, which exposes inputs by name and reads outputs back from the local scope.',
    inputs: [
      { id: 'input0', name: 'input', type: 'any', description: 'Single input value available inside the Python block as input0' }
    ],
    outputs: [
      { id: 'output0', name: 'output', type: 'any', description: 'Value assigned to output0 inside the Python block' }
    ],
    controls: [
      { id: 'code', type: 'text', default: 'output = input', label: 'Python' }
    ],
    metadata: {
      skipSampleExecution: true
    },
    execute() {
      return { output0: undefined };
    },
    codegen: {
      python: '# Python block\n{{ctrl.code}}',
      csharp: '/* Python block — not directly portable */'
    },
    help: {
      inputs: [{ name: 'input', description: 'Single input' }],
      outputs: [{ name: 'output', description: 'Computed output' }],
      example: {
        title: 'Pass 5 through default Python (output = input) → 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Custom.Python', x: 240, y: 0 },
          { type: 'Output.Watch', x: 480, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'input0'],
          [1, 'output0', 2, 'value']
        ]
      },
      sampleCode: '# Python block\n{{ctrl.code}}'
    }
  }
];
