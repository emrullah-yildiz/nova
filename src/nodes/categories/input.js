export const inputCategory = {
  id: 'input',
  name: 'Input',
  color: '#cba6f7',
  icon: '⊙'
};

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0' || v === '') return false;
  }
  return !!value;
}

export const inputNodes = [
  {
    type: 'Input.Boolean',
    name: 'Input.Boolean',
    category: 'input',
    subGroup: 'Input',
    icon: '◑',
    aliases: ['boolean-input'],
    description: 'A constant boolean value chosen from a True/False dropdown. Use it to drive Logic.If branches, gate conditions, or seed boolean lists.',
    inputs: [],
    outputs: [{ id: 'value', name: 'Value', type: 'boolean', description: 'The chosen boolean constant' }],
    controls: [
      { id: 'val', type: 'dropdown', options: ['True', 'False'], default: 'True', label: 'Value' }
    ],
    execute(context, inputs, controls) {
      return { value: toBoolean(controls.val) };
    },
    codegen: {
      python: '{{value}} = {{ctrl.val}}',
      csharp: 'bool {{value}} = {{ctrl.val_lower}};'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Value', description: 'Chosen boolean' }],
      example: {
        title: 'Toggle picks 100 (enabled) or 0 (disabled)',
        nodes: [
          { type: 'Input.Boolean', x: 0, y: 0, controls: { val: 'True' } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 100 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 0 } },
          { type: 'Logic.If', x: 240, y: 60 },
          { type: 'output-watch', x: 460, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'condition'],
          [1, 'value', 3, 'ifTrue'],
          [2, 'value', 3, 'ifFalse'],
          [3, 'result', 4, 'value']
        ]
      },
      sampleCode: '{{value}} = {{ctrl.val}}'
    }
  },
  {
    type: 'Input.Integer',
    name: 'Input.Integer',
    category: 'input',
    subGroup: 'Input',
    icon: 'ℤ',
    aliases: ['integer-input'],
    description: 'A whole-number constant typed into the control field. Outputs the integer (rounded if fractional) for downstream counts, indices, and discrete loop bounds.',
    inputs: [],
    outputs: [{ id: 'value', name: 'Value', type: 'number', description: 'The integer constant' }],
    controls: [
      { id: 'val', type: 'number', default: 1, label: 'Value' }
    ],
    execute(context, inputs, controls) {
      return { value: Math.trunc(toNumber(controls.val, 0)) };
    },
    codegen: {
      python: '{{value}} = int({{ctrl.val}})',
      csharp: 'int {{value}} = {{ctrl.val}};'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Value', description: 'Integer constant' }],
      example: {
        title: 'Sum of 0..4 = 10',
        nodes: [
          { type: 'Input.Integer', x: 0, y: 0, controls: { val: 0 } },
          { type: 'Input.Integer', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Integer', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 240, y: 60 },
          { type: 'List.Sum', x: 460, y: 60 },
          { type: 'output-watch', x: 660, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'list'],
          [4, 'result', 5, 'value']
        ]
      },
      sampleCode: '{{value}} = int({{ctrl.val}})'
    }
  },
  {
    type: 'Input.Number',
    name: 'Input.Number',
    category: 'input',
    subGroup: 'Input',
    icon: '#',
    aliases: ['number-input'],
    description: 'A real-number constant typed into the control field. Outputs a double-precision value for downstream measurements, prices, coordinates, and scalars.',
    inputs: [],
    outputs: [{ id: 'value', name: 'Value', type: 'number', description: 'The numeric constant' }],
    controls: [
      { id: 'val', type: 'number', default: 0, label: 'Value' }
    ],
    execute(context, inputs, controls) {
      return { value: toNumber(controls.val, 0) };
    },
    codegen: {
      python: '{{value}} = {{ctrl.val}}',
      csharp: 'double {{value}} = {{ctrl.val}};'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Value', description: 'Numeric constant' }],
      example: {
        title: 'Sum two numbers (5.5 + 4.5 = 10)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5.5 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4.5 } },
          { type: 'List.Create', x: 240, y: 30 },
          { type: 'List.Sum', x: 460, y: 30 },
          { type: 'output-watch', x: 660, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'item0'],
          [1, 'value', 2, 'item1'],
          [2, 'list', 3, 'list'],
          [3, 'result', 4, 'value']
        ]
      },
      sampleCode: '{{value}} = {{ctrl.val}}'
    }
  },
  {
    type: 'Input.Slider',
    name: 'Input.Slider',
    category: 'input',
    subGroup: 'Input',
    icon: '⊶',
    aliases: ['slider-input'],
    description: 'A numeric constant chosen via an interactive Min..Max slider. The output is clamped to the slider range; ideal for adjustable thresholds and tunable parameters.',
    inputs: [],
    outputs: [{ id: 'value', name: 'Value', type: 'number', description: 'The slider value, clamped to [Min, Max]' }],
    controls: [
      { id: 'min', type: 'number', default: 0, label: 'Min' },
      { id: 'max', type: 'number', default: 100, label: 'Max' },
      { id: 'val', type: 'range', default: 50, label: 'Value' }
    ],
    execute(context, inputs, controls) {
      const min = toNumber(controls.min, 0);
      const max = toNumber(controls.max, 100);
      const val = toNumber(controls.val, (min + max) / 2);
      return { value: Math.min(max, Math.max(min, val)) };
    },
    codegen: {
      python: '{{value}} = max({{ctrl.min}}, min({{ctrl.max}}, {{ctrl.val}}))',
      csharp: 'double {{value}} = Math.Max({{ctrl.min}}, Math.Min({{ctrl.max}}, {{ctrl.val}}));'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Value', description: 'Slider value' }],
      example: {
        title: 'Pass slider value only when > 10',
        nodes: [
          { type: 'Input.Slider', x: 0, y: 0, controls: { min: 0, max: 100, val: 42 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Logic.Compare', x: 240, y: 30, controls: { op: '>' } },
          { type: 'Logic.Gate', x: 460, y: 30 },
          { type: 'output-watch', x: 680, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [0, 'value', 3, 'value'],
          [2, 'result', 3, 'pass'],
          [3, 'result', 4, 'value']
        ]
      },
      sampleCode: '{{value}} = max({{ctrl.min}}, min({{ctrl.max}}, {{ctrl.val}}))'
    }
  },
  {
    type: 'Input.Text',
    name: 'Input.Text',
    category: 'input',
    subGroup: 'Input',
    icon: '¶',
    aliases: ['text-input'],
    description: 'A string constant typed into the control field. Outputs the text for downstream labels, parameter names, file paths, and template content.',
    inputs: [],
    outputs: [{ id: 'value', name: 'Value', type: 'string', description: 'The text constant' }],
    controls: [
      { id: 'val', type: 'text', default: 'Hello', label: 'Text' }
    ],
    execute(context, inputs, controls) {
      return { value: controls.val == null ? '' : String(controls.val) };
    },
    codegen: {
      python: '{{value}} = "{{ctrl.val}}"',
      csharp: 'string {{value}} = "{{ctrl.val}}";'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Value', description: 'Text constant' }],
      example: {
        title: 'Repeat label 3 times, count occurrences',
        nodes: [
          { type: 'Input.Text', x: 0, y: 0, controls: { val: 'room' } },
          { type: 'Input.Integer', x: 0, y: 80, controls: { val: 3 } },
          { type: 'List.Repeat', x: 240, y: 30 },
          { type: 'List.Count', x: 460, y: 30 },
          { type: 'output-watch', x: 660, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'item'],
          [1, 'value', 2, 'count'],
          [2, 'list', 3, 'list'],
          [3, 'count', 4, 'value']
        ]
      },
      sampleCode: '{{value}} = "{{ctrl.val}}"'
    }
  }
];
