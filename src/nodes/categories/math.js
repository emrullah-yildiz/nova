export const mathCategory = {
  id: 'math',
  name: 'Math',
  color: '#a6e3a1',
  icon: 'Σ'
};

const numberResult = (description) => [{ id: 'result', name: 'Result', type: 'number', description }];
const shortestLacing = { mode: 'shortest' };

function toNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isNaN(n) ? fallback : n;
}

function resolveAutoRange(value, fallbackMin = 0, fallbackMax = 1) {
  if (!Array.isArray(value) || value.length === 0) {
    return { min: fallbackMin, max: fallbackMax };
  }
  const nums = value.map((v) => toNumber(v)).filter((v) => !Number.isNaN(v));
  if (!nums.length) return { min: fallbackMin, max: fallbackMax };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}
function remapValue(value, fromMin, fromMax, toMin, toMax) {
  if (fromMax === fromMin) return toMin;
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
}

export const mathNodes = [
  {
    type: 'Math.Absolute',
    name: 'Math.Absolute',
    category: 'math',
    subGroup: 'Math',
    icon: '|·|',
    aliases: ['math-abs'],
    description: 'Returns the absolute value (magnitude) of a number, dropping its sign. Useful for converting signed deltas into distances and for safely taking square roots downstream.',
    inputs: [{ id: 'a', name: 'Value', type: 'number', description: 'Signed value to take the absolute of' }],
    outputs: numberResult('|a| — the non-negative magnitude'),
    controls: [{ id: 'a', type: 'formula', default: '0', label: 'Value' }],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: Math.abs(toNumber(inputs.a, 0)) };
    },
    codegen: {
      python: '{{result}} = abs({{a}})',
      csharp: 'double {{result}} = Math.Abs({{a}});'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Signed input' }],
      outputs: [{ name: 'Result', description: 'Non-negative magnitude' }],
      example: {
        title: 'Magnitude of -7',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: -7 } },
          { type: 'Math.Absolute', x: 240, y: 0 },
          { type: 'Output.Watch', x: 460, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'a'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: '{{result}} = abs({{a}})'
    }
  },
  {
    type: 'Math.Add',
    name: 'Math.Add',
    category: 'math',
    subGroup: 'Math',
    icon: '+',
    aliases: ['math-add'],
    description: 'Adds two numbers (A + B). Supports list lacing — when given two lists of the same length, returns the element-wise sum.',
    inputs: [
      { id: 'a', name: 'A', type: 'number', description: 'First addend' },
      { id: 'b', name: 'B', type: 'number', description: 'Second addend' }
    ],
    outputs: numberResult('A + B'),
    controls: [
      { id: 'a', type: 'formula', default: '0', label: 'A' },
      { id: 'b', type: 'formula', default: '0', label: 'B' }
    ],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: toNumber(inputs.a, 0) + toNumber(inputs.b, 0) };
    },
    codegen: {
      python: '{{result}} = {{a}} + {{b}}',
      csharp: 'double {{result}} = {{a}} + {{b}};'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First addend' },
        { name: 'B', description: 'Second addend' }
      ],
      outputs: [{ name: 'Result', description: 'Sum' }],
      example: {
        title: 'Combined area: 100 + 50 = 150',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 100 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 50 } },
          { type: 'Math.Add', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}} + {{b}}'
    }
  },
  {
    type: 'Math.Ceiling',
    name: 'Math.Ceiling',
    category: 'math',
    subGroup: 'Math',
    icon: '⌈⌉',
    aliases: ['math-ceil'],
    description: 'Rounds a number up to the next integer (toward positive infinity). Useful for sizing — never under-allocate; always reserve enough capacity.',
    inputs: [{ id: 'a', name: 'Value', type: 'number', description: 'Input to round up' }],
    outputs: numberResult('Smallest integer ≥ a'),
    controls: [{ id: 'a', type: 'formula', default: '0', label: 'Value' }],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: Math.ceil(toNumber(inputs.a, 0)) };
    },
    codegen: {
      python: 'import math\n{{result}} = math.ceil({{a}})',
      csharp: 'double {{result}} = Math.Ceiling({{a}});'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Input number' }],
      outputs: [{ name: 'Result', description: 'Rounded up' }],
      example: {
        title: 'Round 2.3 up to 3',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 2.3 } },
          { type: 'Math.Ceiling', x: 240, y: 0 },
          { type: 'Output.Watch', x: 460, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'a'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: 'import math; {{result}} = math.ceil({{a}})'
    }
  },
  {
    type: 'Math.Clamp',
    name: 'Math.Clamp',
    category: 'math',
    subGroup: 'Math',
    icon: '⊏⊐',
    aliases: ['math-clamp'],
    description: 'Constrains a value to the [Min, Max] window. Values below Min snap to Min; values above Max snap to Max. Ideal for keeping parameters within safe ranges.',
    inputs: [{ id: 'value', name: 'Value', type: 'number', description: 'Value to constrain' }],
    outputs: numberResult('Value clamped to [Min, Max]'),
    controls: [
      { id: 'value', type: 'formula', default: '0', label: 'Value' },
      { id: 'min', type: 'formula', default: '0', label: 'Min' },
      { id: 'max', type: 'formula', default: '1', label: 'Max' }
    ],
    lacing: shortestLacing,
    execute(context, inputs, controls) {
      const v = toNumber(inputs.value);
      const min = toNumber(controls.min, 0);
      const max = toNumber(controls.max, 1);
      return { result: Math.max(min, Math.min(max, v)) };
    },
    codegen: {
      python: '{{result}} = max({{min}}, min({{max}}, {{value}}))',
      csharp: 'double {{result}} = Math.Max({{min}}, Math.Min({{max}}, {{value}}));'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Input value' }],
      outputs: [{ name: 'Result', description: 'Clamped value' }],
      example: {
        title: 'Clamp 175 into [0, 100] → 100',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 175 } },
          { type: 'Math.Clamp', x: 240, y: 0, controls: { min: 0, max: 100 } },
          { type: 'Output.Watch', x: 460, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'value'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: '{{result}} = max({{min}}, min({{max}}, {{value}}))'
    }
  },
  {
    type: 'Math.Divide',
    name: 'Math.Divide',
    category: 'math',
    subGroup: 'Math',
    icon: '÷',
    aliases: ['math-divide'],
    description: 'Divides A by B (A ÷ B). Returns undefined when B is zero to avoid silent NaN propagation downstream.',
    inputs: [
      { id: 'a', name: 'A', type: 'number', description: 'Numerator' },
      { id: 'b', name: 'B', type: 'number', description: 'Denominator (must be non-zero)' }
    ],
    outputs: numberResult('A ÷ B (undefined when B is 0)'),
    controls: [
      { id: 'a', type: 'formula', default: '1', label: 'A' },
      { id: 'b', type: 'formula', default: '1', label: 'B' }
    ],
    lacing: shortestLacing,
    execute(context, inputs) {
      const a = toNumber(inputs.a, 1);
      const b = toNumber(inputs.b, 1);
      return { result: b !== 0 ? a / b : undefined };
    },
    codegen: {
      python: '{{result}} = {{a}} / {{b}}',
      csharp: 'double {{result}} = {{b}} != 0 ? {{a}} / {{b}} : double.NaN;'
    },
    help: {
      inputs: [
        { name: 'A', description: 'Numerator' },
        { name: 'B', description: 'Denominator' }
      ],
      outputs: [{ name: 'Result', description: 'Quotient' }],
      example: {
        title: 'Average price: 100 / 4 = 25',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 100 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 4 } },
          { type: 'Math.Divide', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}} / {{b}}'
    }
  },
  {
    type: 'Math.Floor',
    name: 'Math.Floor',
    category: 'math',
    subGroup: 'Math',
    icon: '⌊⌋',
    aliases: ['math-floor'],
    description: 'Rounds a number down to the previous integer (toward negative infinity). Useful for indices and bucketing — never over-shoot.',
    inputs: [{ id: 'a', name: 'Value', type: 'number', description: 'Input to round down' }],
    outputs: numberResult('Largest integer ≤ a'),
    controls: [{ id: 'a', type: 'formula', default: '0', label: 'Value' }],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: Math.floor(toNumber(inputs.a, 0)) };
    },
    codegen: {
      python: 'import math\n{{result}} = math.floor({{a}})',
      csharp: 'double {{result}} = Math.Floor({{a}});'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Input number' }],
      outputs: [{ name: 'Result', description: 'Rounded down' }],
      example: {
        title: 'Round 2.7 down to 2',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 2.7 } },
          { type: 'Math.Floor', x: 240, y: 0 },
          { type: 'Output.Watch', x: 460, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'a'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: 'import math; {{result}} = math.floor({{a}})'
    }
  },
  {
    type: 'Math.Max',
    name: 'Math.Max',
    category: 'math',
    subGroup: 'Math',
    icon: '↑',
    aliases: ['math-max'],
    description: 'Returns the larger of two numbers. For more than two inputs, chain multiple Math.Max nodes or use List.Max on a list of values.',
    inputs: [
      { id: 'a', name: 'A', type: 'number', description: 'First candidate' },
      { id: 'b', name: 'B', type: 'number', description: 'Second candidate' }
    ],
    outputs: numberResult('max(A, B)'),
    controls: [],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: Math.max(toNumber(inputs.a, 0), toNumber(inputs.b, 0)) };
    },
    codegen: {
      python: '{{result}} = max({{a}}, {{b}})',
      csharp: 'double {{result}} = Math.Max({{a}}, {{b}});'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First candidate' },
        { name: 'B', description: 'Second candidate' }
      ],
      outputs: [{ name: 'Result', description: 'Larger value' }],
      example: {
        title: 'Larger plan dimension: max(10, 5) = 10',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 5 } },
          { type: 'Math.Max', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: '{{result}} = max({{a}}, {{b}})'
    }
  },
  {
    type: 'Math.Min',
    name: 'Math.Min',
    category: 'math',
    subGroup: 'Math',
    icon: '↓',
    aliases: ['math-min'],
    description: 'Returns the smaller of two numbers. For more than two inputs, chain multiple Math.Min nodes or use List.Min on a list of values.',
    inputs: [
      { id: 'a', name: 'A', type: 'number', description: 'First candidate' },
      { id: 'b', name: 'B', type: 'number', description: 'Second candidate' }
    ],
    outputs: numberResult('min(A, B)'),
    controls: [],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: Math.min(toNumber(inputs.a, 0), toNumber(inputs.b, 0)) };
    },
    codegen: {
      python: '{{result}} = min({{a}}, {{b}})',
      csharp: 'double {{result}} = Math.Min({{a}}, {{b}});'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First candidate' },
        { name: 'B', description: 'Second candidate' }
      ],
      outputs: [{ name: 'Result', description: 'Smaller value' }],
      example: {
        title: 'Tighter dimension: min(10, 5) = 5',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 5 } },
          { type: 'Math.Min', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: '{{result}} = min({{a}}, {{b}})'
    }
  },
  {
    type: 'Math.Modulo',
    name: 'Math.Modulo',
    category: 'math',
    subGroup: 'Math',
    icon: '%',
    aliases: ['math-modulo'],
    description: 'Returns the remainder of A divided by B (A % B). Useful for wrap-around indices, periodic patterns, and bucket assignments.',
    inputs: [
      { id: 'a', name: 'A', type: 'number', description: 'Dividend' },
      { id: 'b', name: 'B', type: 'number', description: 'Divisor (must be non-zero)' }
    ],
    outputs: numberResult('Remainder of A ÷ B'),
    controls: [
      { id: 'a', type: 'formula', default: '0', label: 'A' },
      { id: 'b', type: 'formula', default: '1', label: 'B' }
    ],
    lacing: shortestLacing,
    execute(context, inputs) {
      const a = toNumber(inputs.a, 0);
      const b = toNumber(inputs.b, 1);
      return { result: b !== 0 ? a % b : undefined };
    },
    codegen: {
      python: '{{result}} = {{a}} % {{b}}',
      csharp: 'double {{result}} = {{a}} % {{b}};'
    },
    help: {
      inputs: [
        { name: 'A', description: 'Dividend' },
        { name: 'B', description: 'Divisor' }
      ],
      outputs: [{ name: 'Result', description: 'Remainder' }],
      example: {
        title: 'Bucket assignment: 7 % 3 = 1',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 7 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 3 } },
          { type: 'Math.Modulo', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}} % {{b}}'
    }
  },
  {
    type: 'Math.Multiply',
    name: 'Math.Multiply',
    category: 'math',
    subGroup: 'Math',
    icon: '×',
    aliases: ['math-multiply'],
    description: 'Multiplies two numbers (A × B). Common uses: scaling, area calculations from sides, unit conversions.',
    inputs: [
      { id: 'a', name: 'A', type: 'number', description: 'First factor' },
      { id: 'b', name: 'B', type: 'number', description: 'Second factor' }
    ],
    outputs: numberResult('A × B'),
    controls: [
      { id: 'a', type: 'formula', default: '1', label: 'A' },
      { id: 'b', type: 'formula', default: '1', label: 'B' }
    ],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: toNumber(inputs.a, 1) * toNumber(inputs.b, 1) };
    },
    codegen: {
      python: '{{result}} = {{a}} * {{b}}',
      csharp: 'double {{result}} = {{a}} * {{b}};'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First factor' },
        { name: 'B', description: 'Second factor' }
      ],
      outputs: [{ name: 'Result', description: 'Product' }],
      example: {
        title: 'Floor area: 10 × 5 = 50',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 10 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 5 } },
          { type: 'Math.Multiply', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}} * {{b}}'
    }
  },
  {
    type: 'Math.Negate',
    name: 'Math.Negate',
    category: 'math',
    subGroup: 'Math',
    icon: '±',
    aliases: ['math-negate'],
    description: 'Flips the sign of a number: positive becomes negative and vice versa. Useful for reversing a direction vector component or inverting a sign convention.',
    inputs: [{ id: 'a', name: 'Value', type: 'number', description: 'Input value' }],
    outputs: numberResult('-a'),
    controls: [{ id: 'a', type: 'formula', default: '0', label: 'Value' }],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: -toNumber(inputs.a, 0) };
    },
    codegen: {
      python: '{{result}} = -{{a}}',
      csharp: 'double {{result}} = -{{a}};'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Input value' }],
      outputs: [{ name: 'Result', description: 'Negated' }],
      example: {
        title: 'Reverse direction: -10',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 10 } },
          { type: 'Math.Negate', x: 240, y: 0 },
          { type: 'Output.Watch', x: 460, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'a'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: '{{result}} = -{{a}}'
    }
  },
  {
    type: 'Math.Power',
    name: 'Math.Power',
    category: 'math',
    subGroup: 'Math',
    icon: '^',
    aliases: ['math-power'],
    description: 'Returns base raised to the exponent (base^exp). Use Exp = 2 for squares, 0.5 for square roots, -1 for reciprocals.',
    inputs: [
      { id: 'base', name: 'Base', type: 'number', description: 'Base of the power' },
      { id: 'exp', name: 'Exp', type: 'number', description: 'Exponent' }
    ],
    outputs: numberResult('base ^ exp'),
    controls: [
      { id: 'base', type: 'formula', default: '2', label: 'Base' },
      { id: 'exp', type: 'formula', default: '2', label: 'Exp' }
    ],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: Math.pow(toNumber(inputs.base, 2), toNumber(inputs.exp, 2)) };
    },
    codegen: {
      python: 'import math\n{{result}} = math.pow({{base}}, {{exp}})',
      csharp: 'double {{result}} = Math.Pow({{base}}, {{exp}});'
    },
    help: {
      inputs: [
        { name: 'Base', description: 'Base' },
        { name: 'Exp', description: 'Exponent' }
      ],
      outputs: [{ name: 'Result', description: 'base^exp' }],
      example: {
        title: 'Area of a 5-unit square: 5² = 25',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 2 } },
          { type: 'Math.Power', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'base'],
          [1, 'value', 2, 'exp'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: 'import math; {{result}} = math.pow({{base}}, {{exp}})'
    }
  },
  {
    type: 'Math.Reciprocal',
    name: 'Math.Reciprocal',
    category: 'math',
    subGroup: 'Math',
    icon: '⅟',
    aliases: ['math-reciprocal'],
    description: 'Returns 1 ÷ value — the multiplicative inverse. Returns undefined for 0 input. Common use: convert period to frequency, or pixel count to density.',
    inputs: [{ id: 'a', name: 'Value', type: 'number', description: 'Non-zero input' }],
    outputs: numberResult('1 ÷ a (undefined if a is 0)'),
    controls: [{ id: 'a', type: 'formula', default: '1', label: 'Value' }],
    lacing: shortestLacing,
    execute(context, inputs) {
      const a = toNumber(inputs.a, 1);
      return { result: a !== 0 ? 1 / a : undefined };
    },
    codegen: {
      python: '{{result}} = 1 / {{a}}',
      csharp: 'double {{result}} = {{a}} != 0 ? 1.0 / {{a}} : double.NaN;'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Non-zero input' }],
      outputs: [{ name: 'Result', description: '1/value' }],
      example: {
        title: 'Frequency: 1 ÷ 4 = 0.25 Hz',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 4 } },
          { type: 'Math.Reciprocal', x: 240, y: 0 },
          { type: 'Output.Watch', x: 460, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'a'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: '{{result}} = 1 / {{a}}'
    }
  },
  {
    type: 'Math.Remap',
    name: 'Math.Remap',
    category: 'math',
    subGroup: 'Math',
    icon: '↔',
    aliases: ['math-remap'],
    description: 'Linearly remaps a value (or list of values) from the source range [fromMin, fromMax] into the target range [toMin, toMax]. Pass "auto" for fromMin/fromMax to derive them from the input list.',
    inputs: [{ id: 'value', name: 'Value', type: 'any', description: 'Value or list of values to remap' }],
    outputs: [{ id: 'result', name: 'Result', type: 'any', description: 'Remapped value or list' }],
    controls: [
      { id: 'value', type: 'formula', default: '0.5', label: 'Value' },
      { id: 'fromMin', type: 'text', default: 'auto', label: 'From Min' },
      { id: 'fromMax', type: 'text', default: 'auto', label: 'From Max' },
      { id: 'toMin', type: 'formula', default: '0', label: 'To Min' },
      { id: 'toMax', type: 'formula', default: '100', label: 'To Max' }
    ],
    lacing: { mode: 'none' },
    execute(context, inputs, controls) {
      const value = inputs.value;
      const autoRange = resolveAutoRange(value);
      const fromMin = controls.fromMin === 'auto' ? autoRange.min : toNumber(controls.fromMin);
      const fromMax = controls.fromMax === 'auto' ? autoRange.max : toNumber(controls.fromMax, 1);
      const toMin = toNumber(controls.toMin);
      const toMax = toNumber(controls.toMax, 100);

      if (Array.isArray(value)) {
        return { result: value.map((v) => remapValue(toNumber(v), fromMin, fromMax, toMin, toMax)) };
      }
      return { result: remapValue(toNumber(value), fromMin, fromMax, toMin, toMax) };
    },
    codegen: {
      python: '{{result}} = {{toMin}} + ({{value}} - {{fromMin}}) / ({{fromMax}} - {{fromMin}}) * ({{toMax}} - {{toMin}})',
      csharp: 'double {{result}} = {{toMin}} + ({{value}} - {{fromMin}}) / ({{fromMax}} - {{fromMin}}) * ({{toMax}} - {{toMin}});'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Value to remap' }],
      outputs: [{ name: 'Result', description: 'Remapped value' }],
      example: {
        title: 'Remap 5 from [0..10] into [0..100] → 50',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Math.Remap', x: 240, y: 0, controls: { fromMin: '0', fromMax: '10', toMin: '0', toMax: '100' } },
          { type: 'Output.Watch', x: 460, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'value'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: '{{result}} = {{toMin}} + ({{value}} - {{fromMin}}) / ({{fromMax}} - {{fromMin}}) * ({{toMax}} - {{toMin}})'
    }
  },
  {
    type: 'Math.Round',
    name: 'Math.Round',
    category: 'math',
    subGroup: 'Math',
    icon: '≈',
    aliases: ['math-round'],
    description: 'Rounds a number to the nearest value at the requested number of decimal digits. Digits = 0 rounds to integer; digits = 2 keeps two decimal places.',
    inputs: [{ id: 'a', name: 'Value', type: 'number', description: 'Value to round' }],
    outputs: numberResult('Rounded value'),
    controls: [
      { id: 'a', type: 'formula', default: '0', label: 'Value' },
      { id: 'digits', type: 'formula', default: '0', label: 'Digits' }
    ],
    lacing: shortestLacing,
    execute(context, inputs, controls) {
      const digits = Math.max(0, Math.round(toNumber(controls.digits, 0)));
      return { result: Number(toNumber(inputs.a, 0).toFixed(digits)) };
    },
    codegen: {
      python: '{{result}} = round({{a}}, int({{digits}}))',
      csharp: 'double {{result}} = Math.Round({{a}}, (int){{digits}});'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Value to round' }],
      outputs: [{ name: 'Result', description: 'Rounded value' }],
      example: {
        title: 'Round π to 2 decimals → 3.14',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 3.14159 } },
          { type: 'Math.Round', x: 240, y: 0, controls: { digits: 2 } },
          { type: 'Output.Watch', x: 460, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'a'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: '{{result}} = round({{a}}, int({{digits}}))'
    }
  },
  {
    type: 'Math.Subtract',
    name: 'Math.Subtract',
    category: 'math',
    subGroup: 'Math',
    icon: '−',
    aliases: ['math-subtract'],
    description: 'Subtracts B from A (A − B). Supports list lacing — when given two lists of the same length, returns the element-wise difference.',
    inputs: [
      { id: 'a', name: 'A', type: 'number', description: 'Minuend' },
      { id: 'b', name: 'B', type: 'number', description: 'Subtrahend' }
    ],
    outputs: numberResult('A − B'),
    controls: [
      { id: 'a', type: 'formula', default: '0', label: 'A' },
      { id: 'b', type: 'formula', default: '0', label: 'B' }
    ],
    lacing: shortestLacing,
    execute(context, inputs) {
      return { result: toNumber(inputs.a, 0) - toNumber(inputs.b, 0) };
    },
    codegen: {
      python: '{{result}} = {{a}} - {{b}}',
      csharp: 'double {{result}} = {{a}} - {{b}};'
    },
    help: {
      inputs: [
        { name: 'A', description: 'Minuend' },
        { name: 'B', description: 'Subtrahend' }
      ],
      outputs: [{ name: 'Result', description: 'Difference' }],
      example: {
        title: 'Net profit: 100 − 30 = 70',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 100 } },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 30 } },
          { type: 'Math.Subtract', x: 240, y: 30 },
          { type: 'Output.Watch', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: '{{result}} = {{a}} - {{b}}'
    }
  }
];
