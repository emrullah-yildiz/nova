export const logicCategory = {
  id: 'logic',
  name: 'Logic',
  color: '#f38ba8',
  icon: '⊻'
};

const STANDARD_V1 = { standardVersion: 'v1' };

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
      description: 'Returns true when both A and B are true. Use to combine multiple gating conditions before a Logic.Gate or Logic.If.',
      inputs: [
        { name: 'A', description: 'First boolean operand' },
        { name: 'B', description: 'Second boolean operand' }
      ],
      outputs: [{ name: 'Result', description: 'True if both A and B are true' }],
      example: {
        title: 'Door visible only on level 1',
        nodes: [
          { type: 'boolean-input', x: 0, y: 0, controls: { val: 'True' } },
          { type: 'boolean-input', x: 0, y: 80, controls: { val: 'True' } },
          { type: 'Logic.And', x: 220, y: 30 }
        ],
        wires: [[0, 'value', 2, 'a'], [1, 'value', 2, 'b']]
      },
      sampleCode: '{{result}} = {{a}} and {{b}}'
    },
    metadata: STANDARD_V1
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
      description: 'Returns true when at least one input is true. Combine with Logic.And to build composite enable conditions.',
      inputs: [
        { name: 'A', description: 'First boolean operand' },
        { name: 'B', description: 'Second boolean operand' }
      ],
      outputs: [{ name: 'Result', description: 'True if A or B is true' }],
      example: {
        title: 'Triggered by either signal',
        nodes: [
          { type: 'boolean-input', x: 0, y: 0, controls: { val: 'True' } },
          { type: 'boolean-input', x: 0, y: 80, controls: { val: 'False' } },
          { type: 'Logic.Or', x: 220, y: 30 }
        ],
        wires: [[0, 'value', 2, 'a'], [1, 'value', 2, 'b']]
      },
      sampleCode: '{{result}} = {{a}} or {{b}}'
    },
    metadata: STANDARD_V1
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
      description: 'True when exactly one of A or B is true. Detect divergence between two parallel checks.',
      inputs: [
        { name: 'A', description: 'First boolean operand' },
        { name: 'B', description: 'Second boolean operand' }
      ],
      outputs: [{ name: 'Result', description: 'True if A and B differ' }],
      example: {
        title: 'Exclusive choice',
        nodes: [
          { type: 'boolean-input', x: 0, y: 0, controls: { val: 'True' } },
          { type: 'boolean-input', x: 0, y: 80, controls: { val: 'False' } },
          { type: 'Logic.Xor', x: 220, y: 30 }
        ],
        wires: [[0, 'value', 2, 'a'], [1, 'value', 2, 'b']]
      },
      sampleCode: '{{result}} = ({{a}} or {{b}}) and not ({{a}} and {{b}})'
    },
    metadata: STANDARD_V1
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
      description: 'Inverts a boolean. Useful for negating a Logic.Compare result without wiring an extra equality check.',
      inputs: [{ name: 'Value', description: 'Boolean to invert' }],
      outputs: [{ name: 'Result', description: 'The inverted boolean' }],
      example: {
        title: 'Invert a condition',
        nodes: [
          { type: 'boolean-input', x: 0, y: 0, controls: { val: 'True' } },
          { type: 'Logic.Not', x: 220, y: 0 }
        ],
        wires: [[0, 'value', 1, 'value']]
      },
      sampleCode: '{{result}} = not {{value}}'
    },
    metadata: STANDARD_V1
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
      description: 'Ternary selector. Pick one of two upstream values based on a boolean test.',
      inputs: [
        { name: 'Test', description: 'Boolean selector' },
        { name: 'True', description: 'Returned when test is true' },
        { name: 'False', description: 'Returned when test is false' }
      ],
      outputs: [{ name: 'Result', description: 'The selected value' }],
      example: {
        title: 'Pick 100 or 0',
        nodes: [
          { type: 'boolean-input', x: 0, y: 0, controls: { val: 'True' } },
          { type: 'number-input', x: 0, y: 80, controls: { val: 100 } },
          { type: 'number-input', x: 0, y: 160, controls: { val: 0 } },
          { type: 'Logic.If', x: 240, y: 60 }
        ],
        wires: [[0, 'value', 3, 'condition'], [1, 'value', 3, 'ifTrue'], [2, 'value', 3, 'ifFalse']]
      },
      sampleCode: '{{result}} = {{ifTrue}} if {{condition}} else {{ifFalse}}'
    },
    metadata: STANDARD_V1
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
      description: 'Compares A and B using the dropdown operator. Use to drive Logic.If or Logic.Gate from numeric thresholds.',
      inputs: [
        { name: 'A', description: 'Left side of the comparison' },
        { name: 'B', description: 'Right side of the comparison' }
      ],
      outputs: [{ name: 'Result', description: 'Boolean result' }],
      example: {
        title: 'Is value greater than 10?',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 15 } },
          { type: 'number-input', x: 0, y: 80, controls: { val: 10 } },
          { type: 'Logic.Compare', x: 220, y: 30 }
        ],
        wires: [[0, 'value', 2, 'a'], [1, 'value', 2, 'b']]
      },
      sampleCode: '{{result}} = {{a}} {{op}} {{b}}'
    },
    metadata: STANDARD_V1
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
      description: 'Conditional pass-through. Use to short-circuit downstream geometry when an upstream condition fails.',
      inputs: [
        { name: 'Value', description: 'Value to forward' },
        { name: 'Pass', description: 'Open/close the gate' }
      ],
      outputs: [{ name: 'Result', description: 'Forwarded value or undefined' }],
      example: {
        title: 'Pass a number only when enabled',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 42 } },
          { type: 'boolean-input', x: 0, y: 80, controls: { val: 'True' } },
          { type: 'Logic.Gate', x: 220, y: 30 }
        ],
        wires: [[0, 'value', 2, 'value'], [1, 'value', 2, 'pass']]
      },
      sampleCode: '{{result}} = {{value}} if {{pass}} else None'
    },
    metadata: STANDARD_V1
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
      description: 'Tests for null or undefined upstream values. Combine with Logic.If to fall back to a default.',
      inputs: [{ name: 'Value', description: 'Value to inspect' }],
      outputs: [{ name: 'Result', description: 'True if the value is null or undefined' }],
      example: {
        title: 'Detect an empty input',
        nodes: [
          { type: 'number-input', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Logic.IsNull', x: 220, y: 0 }
        ],
        wires: [[0, 'value', 1, 'value']]
      },
      sampleCode: '{{result}} = {{value}} is None'
    },
    metadata: STANDARD_V1
  }
];
