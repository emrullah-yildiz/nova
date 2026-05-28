export const logicCategory = {
  id: 'logic',
  name: 'Logic',
  color: '#f38ba8',
  icon: '⊻'
};

const booleanOutput = [{ id: 'result', name: 'Result', type: 'boolean', description: 'Boolean result of the operation' }];
const valueOutput = [{ id: 'result', name: 'Result', type: 'any', description: 'Value forwarded from the input' }];

function toBoolean(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0' || normalized === '') return false;
  }
  return !!value;
}

function compareValues(a, b, operator) {
  switch (operator) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    default: return undefined;
  }
}

export const logicNodes = [
  {
    type: 'Logic.And',
    name: 'Logic.And',
    category: 'logic',
    subGroup: 'Logic',
    icon: '∧',
    aliases: ['logic-and'],
    description: 'Returns true when both inputs are true. Standard boolean conjunction (AND); useful for combining gating conditions.',
    inputs: [
      { id: 'a', name: 'A', type: 'boolean', description: 'First boolean operand' },
      { id: 'b', name: 'B', type: 'boolean', description: 'Second boolean operand' }
    ],
    outputs: booleanOutput,
    controls: [
      { id: 'a', type: 'formula', default: 'true', label: 'A' },
      { id: 'b', type: 'formula', default: 'true', label: 'B' }
    ],
    execute(context, inputs) {
      const a = toBoolean(inputs.a);
      const b = toBoolean(inputs.b);
      if (a === undefined || b === undefined) return { result: undefined };
      return { result: a && b };
    },
    codegen: {
      python: '{{result}} = {{a}} and {{b}}',
      csharp: 'bool {{result}} = {{a}} && {{b}};'
    },
    help: {
      description: 'Range-check workflow: check that a value is greater than the lower bound AND less than the upper bound. Logic.And combines the two comparisons.',
      inputs: [
        { name: 'A', description: 'First boolean operand' },
        { name: 'B', description: 'Second boolean operand' }
      ],
      outputs: [{ name: 'Result', description: 'True only when both A and B are true' }],
      example: {
        title: 'Value within range (10 < 15 < 100)',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 15 } },
          { type: 'number-input', x: 0, y: 80, controls: { val: 10 } },
          { type: 'number-input', x: 0, y: 160, controls: { val: 100 } },
          { type: 'Logic.Compare', x: 220, y: 20, controls: { op: '>' } },
          { type: 'Logic.Compare', x: 220, y: 140, controls: { op: '<' } },
          { type: 'Logic.And', x: 440, y: 80 },
          { type: 'output-watch', x: 640, y: 80 }
        ],
        wires: [
          [0, 'value', 3, 'a'],
          [1, 'value', 3, 'b'],
          [0, 'value', 4, 'a'],
          [2, 'value', 4, 'b'],
          [3, 'result', 5, 'a'],
          [4, 'result', 5, 'b'],
          [5, 'result', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}} and {{b}}'
    },
  },
  {
    type: 'Logic.Or',
    name: 'Logic.Or',
    category: 'logic',
    subGroup: 'Logic',
    icon: '∨',
    aliases: ['logic-or'],
    description: 'Returns true when either input is true. Standard boolean disjunction (OR); useful for tolerating any one of several enabling conditions.',
    inputs: [
      { id: 'a', name: 'A', type: 'boolean', description: 'First boolean operand' },
      { id: 'b', name: 'B', type: 'boolean', description: 'Second boolean operand' }
    ],
    outputs: booleanOutput,
    controls: [
      { id: 'a', type: 'formula', default: 'true', label: 'A' },
      { id: 'b', type: 'formula', default: 'false', label: 'B' }
    ],
    execute(context, inputs) {
      const a = toBoolean(inputs.a);
      const b = toBoolean(inputs.b);
      if (a === undefined || b === undefined) return { result: undefined };
      return { result: a || b };
    },
    codegen: {
      python: '{{result}} = {{a}} or {{b}}',
      csharp: 'bool {{result}} = {{a}} || {{b}};'
    },
    help: {
      description: 'Alarm workflow: raise a flag when either sensor reading exceeds its own threshold. Logic.Or combines the two over-threshold checks.',
      inputs: [
        { name: 'A', description: 'First boolean operand' },
        { name: 'B', description: 'Second boolean operand' }
      ],
      outputs: [{ name: 'Result', description: 'True when A or B (or both) is true' }],
      example: {
        title: 'Any sensor over its threshold',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 45 } },
          { type: 'number-input', x: 0, y: 60, controls: { val: 50 } },
          { type: 'number-input', x: 0, y: 140, controls: { val: 12 } },
          { type: 'number-input', x: 0, y: 200, controls: { val: 10 } },
          { type: 'Logic.Compare', x: 220, y: 20, controls: { op: '>' } },
          { type: 'Logic.Compare', x: 220, y: 160, controls: { op: '>' } },
          { type: 'Logic.Or', x: 440, y: 90 },
          { type: 'output-watch', x: 640, y: 90 }
        ],
        wires: [
          [0, 'value', 4, 'a'],
          [1, 'value', 4, 'b'],
          [2, 'value', 5, 'a'],
          [3, 'value', 5, 'b'],
          [4, 'result', 6, 'a'],
          [5, 'result', 6, 'b'],
          [6, 'result', 7, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}} or {{b}}'
    },
  },
  {
    type: 'Logic.Xor',
    name: 'Logic.Xor',
    category: 'logic',
    subGroup: 'Logic',
    icon: '⊻',
    aliases: ['logic-xor'],
    description: 'Returns true when exactly one input is true. Exclusive-or — useful when two states must differ before triggering downstream behavior.',
    inputs: [
      { id: 'a', name: 'A', type: 'boolean', description: 'First boolean operand' },
      { id: 'b', name: 'B', type: 'boolean', description: 'Second boolean operand' }
    ],
    outputs: booleanOutput,
    controls: [
      { id: 'a', type: 'formula', default: 'true', label: 'A' },
      { id: 'b', type: 'formula', default: 'false', label: 'B' }
    ],
    execute(context, inputs) {
      const a = toBoolean(inputs.a);
      const b = toBoolean(inputs.b);
      if (a === undefined || b === undefined) return { result: undefined };
      return { result: (a || b) && !(a && b) };
    },
    codegen: {
      python: '{{result}} = ({{a}} or {{b}}) and not ({{a}} and {{b}})',
      csharp: 'bool {{result}} = {{a}} ^ {{b}};'
    },
    help: {
      description: 'Exactly-one-mode workflow: only emit 1 when exactly one of Mode A and Mode B is on. Logic.Xor drives a Logic.If that picks 1 (valid) or 0 (conflict).',
      inputs: [
        { name: 'A', description: 'First boolean operand' },
        { name: 'B', description: 'Second boolean operand' }
      ],
      outputs: [{ name: 'Result', description: 'True when exactly one of A or B is true' }],
      example: {
        title: 'Emit 1 only when exactly one mode is on',
        nodes: [
          { type: 'boolean-input', x: 0, y: 0, controls: { val: 'True' } },
          { type: 'boolean-input', x: 0, y: 80, controls: { val: 'False' } },
          { type: 'Logic.Xor', x: 220, y: 30 },
          { type: 'number-input', x: 220, y: 130, controls: { val: 1 } },
          { type: 'number-input', x: 220, y: 200, controls: { val: 0 } },
          { type: 'Logic.If', x: 440, y: 80 },
          { type: 'output-watch', x: 640, y: 80 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 5, 'condition'],
          [3, 'value', 5, 'ifTrue'],
          [4, 'value', 5, 'ifFalse'],
          [5, 'result', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = ({{a}} or {{b}}) and not ({{a}} and {{b}})'
    },
  },
  {
    type: 'Logic.Not',
    name: 'Logic.Not',
    category: 'logic',
    subGroup: 'Logic',
    icon: '¬',
    aliases: ['logic-not'],
    description: 'Inverts a boolean value. Returns true when the input is false, false when the input is true; passes through undefined when no value is supplied.',
    inputs: [
      { id: 'value', name: 'Value', type: 'boolean', description: 'Boolean to invert' }
    ],
    outputs: booleanOutput,
    controls: [
      { id: 'value', type: 'formula', default: 'true', label: 'Value' }
    ],
    execute(context, inputs) {
      const value = toBoolean(inputs.value);
      if (value === undefined) return { result: undefined };
      return { result: !value };
    },
    codegen: {
      python: '{{result}} = not {{value}}',
      csharp: 'bool {{result}} = !{{value}};'
    },
    help: {
      description: 'Negate an equality test: Logic.Compare checks if two values are equal, Logic.Not flips it into a "not equal" signal that downstream nodes can react to.',
      inputs: [{ name: 'Value', description: 'Boolean to invert' }],
      outputs: [{ name: 'Result', description: 'Inverted boolean value' }],
      example: {
        title: 'Not-equal check (5 ≠ 8)',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 5 } },
          { type: 'number-input', x: 0, y: 80, controls: { val: 8 } },
          { type: 'Logic.Compare', x: 220, y: 30, controls: { op: '==' } },
          { type: 'Logic.Not', x: 420, y: 30 },
          { type: 'output-watch', x: 620, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value'],
          [3, 'result', 4, 'value']
        ]
      },
      sampleCode: '{{result}} = not {{value}}'
    },
  },
  {
    type: 'Logic.If',
    name: 'Logic.If',
    category: 'logic',
    subGroup: 'Logic',
    icon: '?',
    aliases: ['logic-if'],
    description: 'Selects between two values based on a boolean test. When the test is true the True input passes through; when false the False input passes through.',
    inputs: [
      { id: 'condition', name: 'Test', type: 'boolean', description: 'Boolean selector' },
      { id: 'ifTrue', name: 'True', type: 'any', description: 'Value returned when the test is true' },
      { id: 'ifFalse', name: 'False', type: 'any', description: 'Value returned when the test is false' }
    ],
    outputs: [{ id: 'result', name: 'Result', type: 'any', description: 'Selected value' }],
    controls: [
      { id: 'condition', type: 'formula', default: 'true', label: 'Test' },
      { id: 'ifTrue', type: 'formula', default: '1', label: 'True' },
      { id: 'ifFalse', type: 'formula', default: '0', label: 'False' }
    ],
    execute(context, inputs) {
      const condition = toBoolean(inputs.condition);
      if (condition === undefined) return { result: undefined };
      return { result: condition ? inputs.ifTrue : inputs.ifFalse };
    },
    codegen: {
      python: '{{result}} = {{ifTrue}} if {{condition}} else {{ifFalse}}',
      csharp: 'var {{result}} = {{condition}} ? {{ifTrue}} : {{ifFalse}};'
    },
    help: {
      description: 'Threshold-driven choice: a Logic.Compare drives Logic.If so the output is 100 when the value clears the threshold and 0 otherwise.',
      inputs: [
        { name: 'Test', description: 'Boolean selector' },
        { name: 'True', description: 'Returned when test is true' },
        { name: 'False', description: 'Returned when test is false' }
      ],
      outputs: [{ name: 'Result', description: 'Selected value' }],
      example: {
        title: 'Pick 100 when value > 10, else 0',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 15 } },
          { type: 'number-input', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Logic.Compare', x: 220, y: 30, controls: { op: '>' } },
          { type: 'number-input', x: 220, y: 130, controls: { val: 100 } },
          { type: 'number-input', x: 220, y: 200, controls: { val: 0 } },
          { type: 'Logic.If', x: 440, y: 80 },
          { type: 'output-watch', x: 640, y: 80 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 5, 'condition'],
          [3, 'value', 5, 'ifTrue'],
          [4, 'value', 5, 'ifFalse'],
          [5, 'result', 6, 'value']
        ]
      },
      sampleCode: '{{result}} = {{ifTrue}} if {{condition}} else {{ifFalse}}'
    },
  },
  {
    type: 'Logic.Compare',
    name: 'Logic.Compare',
    category: 'logic',
    subGroup: 'Logic',
    icon: '≷',
    aliases: ['logic-compare'],
    description: 'Compares two values using a selectable operator (==, !=, <, >, <=, >=). Returns a boolean result; commonly fed into Logic.If or Logic.Gate.',
    inputs: [
      { id: 'a', name: 'A', type: 'any', description: 'Left side of the comparison' },
      { id: 'b', name: 'B', type: 'any', description: 'Right side of the comparison' }
    ],
    outputs: booleanOutput,
    controls: [
      { id: 'a', type: 'formula', default: '0', label: 'A' },
      { id: 'b', type: 'formula', default: '0', label: 'B' },
      { id: 'op', type: 'dropdown', options: ['==', '!=', '<', '>', '<=', '>='], default: '==', label: 'Operator' }
    ],
    execute(context, inputs, controls) {
      if (inputs.a === undefined || inputs.b === undefined) return { result: undefined };
      const result = compareValues(inputs.a, inputs.b, controls.op);
      return { result };
    },
    codegen: {
      python: '{{result}} = {{a}} {{op}} {{b}}',
      csharp: 'bool {{result}} = {{a}} {{op}} {{b}};'
    },
    help: {
      description: 'Threshold gate workflow: Logic.Compare tests whether a value clears a threshold, and the boolean opens a Logic.Gate that lets the value through when the test passes.',
      inputs: [
        { name: 'A', description: 'Left side of the comparison' },
        { name: 'B', description: 'Right side of the comparison' }
      ],
      outputs: [{ name: 'Result', description: 'Boolean result' }],
      example: {
        title: 'Threshold check drives a gate',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 15 } },
          { type: 'number-input', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Logic.Compare', x: 220, y: 30, controls: { op: '>' } },
          { type: 'Logic.Gate', x: 420, y: 30 },
          { type: 'output-watch', x: 640, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [0, 'value', 3, 'value'],
          [2, 'result', 3, 'pass'],
          [3, 'result', 4, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}} {{op}} {{b}}'
    },
  },
  {
    type: 'Logic.Gate',
    name: 'Logic.Gate',
    category: 'logic',
    subGroup: 'Logic',
    icon: '⊳',
    aliases: ['logic-gate'],
    description: 'Forwards the input value only when the gate is open. When Pass is false the output is suppressed (undefined), which can short-circuit downstream computation.',
    inputs: [
      { id: 'value', name: 'Value', type: 'any', description: 'Value to pass through when the gate is open' },
      { id: 'pass', name: 'Pass', type: 'boolean', description: 'When true the value flows; when false the output is suppressed' }
    ],
    outputs: valueOutput,
    controls: [
      { id: 'pass', type: 'formula', default: 'true', label: 'Pass' }
    ],
    execute(context, inputs) {
      const pass = toBoolean(inputs.pass);
      if (pass === undefined) return { result: undefined };
      return { result: pass ? inputs.value : undefined };
    },
    codegen: {
      python: '{{result}} = {{value}} if {{pass}} else None',
      csharp: 'var {{result}} = {{pass}} ? {{value}} : null;'
    },
    help: {
      description: 'Short-circuit workflow: only forward a value when an upstream condition holds. Pair Logic.Gate with Logic.Compare to suppress downstream geometry until a check passes.',
      inputs: [
        { name: 'Value', description: 'Value to forward' },
        { name: 'Pass', description: 'Open/close the gate' }
      ],
      outputs: [{ name: 'Result', description: 'Forwarded value or undefined' }],
      example: {
        title: 'Forward 42 only when it exceeds 10',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 42 } },
          { type: 'number-input', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Logic.Compare', x: 220, y: 30, controls: { op: '>' } },
          { type: 'Logic.Gate', x: 420, y: 30 },
          { type: 'output-watch', x: 640, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [0, 'value', 3, 'value'],
          [2, 'result', 3, 'pass'],
          [3, 'result', 4, 'value']
        ]
      },
      sampleCode: '{{result}} = {{value}} if {{pass}} else None'
    },
  },
  {
    type: 'Logic.IsNull',
    name: 'Logic.IsNull',
    category: 'logic',
    subGroup: 'Logic',
    icon: '∅',
    aliases: ['logic-isnull'],
    description: 'Returns true when the input is null or undefined. Useful for branching on missing upstream data before geometry or compute steps run.',
    inputs: [
      { id: 'value', name: 'Value', type: 'any', description: 'Value to test for null/undefined' }
    ],
    outputs: booleanOutput,
    controls: [],
    execute(context, inputs) {
      return { result: inputs.value === undefined || inputs.value === null };
    },
    codegen: {
      python: '{{result}} = {{value}} is None',
      csharp: 'bool {{result}} = {{value}} == null;'
    },
    help: {
      description: 'Default-substitution workflow: when an upstream value is null/undefined, fall back to a default; otherwise pass the value through. Logic.IsNull drives the Logic.If branch.',
      inputs: [{ name: 'Value', description: 'Value to inspect' }],
      outputs: [{ name: 'Result', description: 'True if the value is null or undefined' }],
      example: {
        title: 'Substitute 0 when input is missing',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Logic.IsNull', x: 220, y: 0 },
          { type: 'number-input', x: 0, y: 80, controls: { val: 0 } },
          { type: 'Logic.If', x: 420, y: 30 },
          { type: 'output-watch', x: 640, y: 30 }
        ],
        wires: [
          [0, 'value', 1, 'value'],
          [1, 'result', 3, 'condition'],
          [2, 'value', 3, 'ifTrue'],
          [0, 'value', 3, 'ifFalse'],
          [3, 'result', 4, 'value']
        ]
      },
      sampleCode: '{{result}} = {{value}} is None'
    }
  }
];
