export const mathCategory = {
  id: 'math',
  name: 'Math',
  color: '#a6e3a1',
  icon: 'M'
};

const numberResult = [{ id: 'result', name: 'Result', type: 'number' }];
const laced = { mode: 'shortest' };

function toNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isNaN(number) ? fallback : number;
}

function unaryMathNode({ type, name, icon, defaultValue = '0', execute, python }) {
  return {
    type,
    name,
    category: 'math',
    icon,
    inputs: [{ id: 'a', name: 'Value', type: 'number' }],
    outputs: numberResult,
    controls: [{ id: 'a', type: 'formula', default: defaultValue, label: 'Value' }],
    lacing: laced,
    execute(context, inputs) {
      return { result: execute(toNumber(inputs.a, toNumber(defaultValue))) };
    },
    codegen: {
      python,
      csharp: ''
    }
  };
}

function binaryMathNode({ type, name, icon, defaults = ['0', '0'], execute, python }) {
  return {
    type,
    name,
    category: 'math',
    icon,
    inputs: [
      { id: 'a', name: 'A', type: 'number' },
      { id: 'b', name: 'B', type: 'number' }
    ],
    outputs: numberResult,
    controls: [
      { id: 'a', type: 'formula', default: defaults[0], label: 'A' },
      { id: 'b', type: 'formula', default: defaults[1], label: 'B' }
    ],
    lacing: laced,
    execute(context, inputs) {
      return { result: execute(toNumber(inputs.a, toNumber(defaults[0])), toNumber(inputs.b, toNumber(defaults[1]))) };
    },
    codegen: {
      python,
      csharp: ''
    }
  };
}

function resolveAutoRange(value, fallbackMin = 0, fallbackMax = 1) {
  if (!Array.isArray(value) || value.length === 0) {
    return { min: fallbackMin, max: fallbackMax };
  }

  const numbers = value.map(item => toNumber(item)).filter(item => !Number.isNaN(item));
  if (numbers.length === 0) return { min: fallbackMin, max: fallbackMax };

  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers)
  };
}

function remapValue(value, fromMin, fromMax, toMin, toMax) {
  if (fromMax === fromMin) return toMin;
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
}

export const mathNodes = [
  unaryMathNode({
    type: 'math.absolute',
    name: 'Math.Absolute',
    icon: '|x|',
    execute: Math.abs,
    python: '{{result}} = abs({{a}})'
  }),
  binaryMathNode({
    type: 'math.add',
    name: 'Math.Add',
    icon: '+',
    execute: (a, b) => a + b,
    python: '{{result}} = {{a}} + {{b}}'
  }),
  unaryMathNode({
    type: 'math.ceiling',
    name: 'Math.Ceiling',
    icon: 'ceil',
    execute: Math.ceil,
    python: 'import math\n{{result}} = math.ceil({{a}})'
  }),
  {
    type: 'math.clamp',
    name: 'Math.Clamp',
    category: 'math',
    icon: 'clamp',
    inputs: [{ id: 'value', name: 'Value', type: 'number' }],
    outputs: numberResult,
    controls: [
      { id: 'value', type: 'formula', default: '0', label: 'Value' },
      { id: 'min', type: 'formula', default: '0', label: 'Min' },
      { id: 'max', type: 'formula', default: '1', label: 'Max' }
    ],
    lacing: laced,
    execute(context, inputs, controls) {
      const value = toNumber(inputs.value);
      const min = toNumber(controls.min);
      const max = toNumber(controls.max, 1);
      return { result: Math.max(min, Math.min(max, value)) };
    },
    codegen: {
      python: '{{result}} = max({{min}}, min({{max}}, {{value}}))',
      csharp: ''
    }
  },
  binaryMathNode({
    type: 'math.divide',
    name: 'Math.Divide',
    icon: '/',
    defaults: ['1', '1'],
    execute: (a, b) => (b !== 0 ? a / b : undefined),
    python: '{{result}} = {{a}} / {{b}}'
  }),
  unaryMathNode({
    type: 'math.floor',
    name: 'Math.Floor',
    icon: 'floor',
    execute: Math.floor,
    python: 'import math\n{{result}} = math.floor({{a}})'
  }),
  binaryMathNode({
    type: 'math.max',
    name: 'Math.Max',
    icon: 'max',
    execute: Math.max,
    python: '{{result}} = max({{a}}, {{b}})'
  }),
  binaryMathNode({
    type: 'math.min',
    name: 'Math.Min',
    icon: 'min',
    execute: Math.min,
    python: '{{result}} = min({{a}}, {{b}})'
  }),
  binaryMathNode({
    type: 'math.modulo',
    name: 'Math.Modulo',
    icon: '%',
    defaults: ['0', '1'],
    execute: (a, b) => (b !== 0 ? a % b : undefined),
    python: '{{result}} = {{a}} % {{b}}'
  }),
  binaryMathNode({
    type: 'math.multiply',
    name: 'Math.Multiply',
    icon: '*',
    defaults: ['1', '1'],
    execute: (a, b) => a * b,
    python: '{{result}} = {{a}} * {{b}}'
  }),
  unaryMathNode({
    type: 'math.negate',
    name: 'Math.Negate',
    icon: '+/-',
    execute: value => -value,
    python: '{{result}} = -{{a}}'
  }),
  {
    type: 'math.power',
    name: 'Math.Power',
    category: 'math',
    icon: '^',
    inputs: [
      { id: 'base', name: 'Base', type: 'number' },
      { id: 'exp', name: 'Exp', type: 'number' }
    ],
    outputs: numberResult,
    controls: [
      { id: 'base', type: 'formula', default: '2', label: 'Base' },
      { id: 'exp', type: 'formula', default: '2', label: 'Exp' }
    ],
    lacing: laced,
    execute(context, inputs) {
      return { result: Math.pow(toNumber(inputs.base, 2), toNumber(inputs.exp, 2)) };
    },
    codegen: {
      python: '{{result}} = math.pow({{base}}, {{exp}})',
      csharp: ''
    }
  },
  unaryMathNode({
    type: 'math.reciprocal',
    name: 'Math.Reciprocal',
    icon: '1/x',
    defaultValue: '1',
    execute: value => (value !== 0 ? 1 / value : undefined),
    python: '{{result}} = 1 / {{a}}'
  }),
  {
    type: 'math.remap',
    name: 'Math.Remap',
    category: 'math',
    icon: '<->',
    inputs: [{ id: 'value', name: 'Value', type: 'any' }],
    outputs: [{ id: 'result', name: 'Result', type: 'any' }],
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
        return { result: value.map(item => remapValue(toNumber(item), fromMin, fromMax, toMin, toMax)) };
      }

      return { result: remapValue(toNumber(value), fromMin, fromMax, toMin, toMax) };
    },
    codegen: {
      python: '{{result}} = {{toMin}} + ({{value}} - {{fromMin}}) / ({{fromMax}} - {{fromMin}}) * ({{toMax}} - {{toMin}})',
      csharp: ''
    }
  },
  {
    type: 'math.round',
    name: 'Math.Round',
    category: 'math',
    icon: 'round',
    inputs: [{ id: 'a', name: 'Value', type: 'number' }],
    outputs: numberResult,
    controls: [
      { id: 'a', type: 'formula', default: '0', label: 'Value' },
      { id: 'digits', type: 'formula', default: '0', label: 'Digits' }
    ],
    lacing: laced,
    execute(context, inputs, controls) {
      const digits = Math.max(0, Math.round(toNumber(controls.digits)));
      return { result: Number(toNumber(inputs.a).toFixed(digits)) };
    },
    codegen: {
      python: '{{result}} = round({{a}}, int({{digits}}))',
      csharp: ''
    }
  },
  binaryMathNode({
    type: 'math.subtract',
    name: 'Math.Subtract',
    icon: '-',
    execute: (a, b) => a - b,
    python: '{{result}} = {{a}} - {{b}}'
  })
];
