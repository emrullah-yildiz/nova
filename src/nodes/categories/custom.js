import { desugarSeries } from '../../runtime/codeblock-syntax.js';
import { resolveCBPorts } from '../../runtime/codeblock-eval.js';

export const customCategory = {
  id: 'custom',
  name: 'Custom / AI',
  color: '#94e2d5',
  icon: '✦'
};

export const DEFAULT_CUSTOM_PYTHON_CODE = `# in: elements:list, options:any
# out: result:any
import math

# Port names above become Python variables with the same names:
# elements, options -> result
#
# Nova Connect / Revit setup. Use these bridge objects in the web Python node.
# - Geo: geometry constructors and operations
# - RevitBridge: local Revit snapshot helpers when Nova Connect is paired

target_elements = elements
if not target_elements:
    target_elements = RevitBridge.getSelection()
if not target_elements:
    target_elements = []

result = target_elements`;

function safeJsFunction(body, argNames) {
  try {
    return new Function(...argNames, body);
  } catch (e) {
    return null;
  }
}

// Default code for a fresh CodeBlock. Uses the JS DSL (not Python):
// free-variable inputs → ports, assignment → output port.
export const DEFAULT_CODEBLOCK_CODE = 'result = x + y';

// Custom.Code v1 — the ORIGINAL JavaScript single-input code block, preserved
// verbatim as the version-1 predecessor of Custom.CodeBlock so a graph pinned to
// v1 keeps running the exact old JS behavior (`return input0;`). New nodes default
// to v2 (the Python CodeBlock below). Carried in `priorVersions`, never shown in
// the library on its own. type MUST equal the canonical `Custom.CodeBlock` so the
// version map buckets v1 and v2 under one type.
const CUSTOM_CODEBLOCK_V1 = {
  type: 'Custom.CodeBlock',
  name: 'Custom.Code',
  category: 'custom',
  subGroup: 'Custom',
  icon: '{ }',
  version: 1,
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
  }
};

// Custom.CodeBlock (v2) — a lightweight expression block with a pure-JavaScript
// DSL (not Python). Each line is an expression or assignment:
//   result = x + y      → named output, inputs x and y
//   0..10               → list [0..10] (series shorthand)
//   1                   → number 1 + companion bool port (true)
//   0                   → number 0 + companion bool port (false)
//   "hello"             → string
//   sin(a) * r          → math formula; a, r → input ports
// Ports derive from code: free variables → inputs, assignments → outputs (via
// resolveCBPorts). Language is 'codeblock' (JS evaluator, not Python).
const CUSTOM_CODEBLOCK_DEF = {
  type: 'Custom.CodeBlock',
  name: 'Custom.CodeBlock',
  category: 'custom',
  subGroup: 'Custom',
  icon: '{ }',
  version: 2,
  aliases: ['custom-codeblock', 'custom-code', 'Custom.Code'],
  priorVersions: [CUSTOM_CODEBLOCK_V1],
  description: 'An expression block. Each line is a formula or assignment: free variables become input ports, assignments become output ports. Supports number/bool/string literals, series shorthand (0..10, 0..2..10, 0..1..#5), math functions (sin, cos, sqrt…), and dual boolean output for 0/1 values.',
  inputs: [
    { id: 'x', name: 'x', type: 'any', description: 'Free variable → input port' },
    { id: 'y', name: 'y', type: 'any', description: 'Free variable → input port' }
  ],
  outputs: [
    { id: 'result', name: 'result', type: 'any', description: 'Value of the assignment' }
  ],
  controls: [
    { id: 'code', type: 'text', default: DEFAULT_CODEBLOCK_CODE, label: 'Code' }
  ],
  metadata: {
    language: 'codeblock',
    codeDriven: true,
    skipSampleExecution: true
  },
  execute() { return { out: undefined }; },
  codegen: {
    python: '{{ctrl.code}}',
    csharp: '/* CodeBlock — expression DSL */'
  },
  help: {
    inputs: [
      { name: 'x', description: 'Free variable read in the code → input port' },
      { name: 'y', description: 'Free variable read in the code → input port' }
    ],
    outputs: [{ name: 'result', description: 'Top-level assignment → output port' }],
    example: {
      title: 'CodeBlock result = x * 2 on 5 → 10',
      nodes: [
        { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
        { type: 'Custom.CodeBlock', x: 240, y: 0, controls: { code: 'result = x * 2' } },
        { type: 'Output.Watch', x: 480, y: 0 }
      ],
      wires: [
        [0, 'value', 1, 'x'],
        [1, 'result', 2, 'value']
      ]
    },
    sampleCode: 'result = x * 2'
  }
};

// Re-export CodeBlock primitives so consumers can import from one place.
export { desugarSeries, resolveCBPorts };

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
  CUSTOM_CODEBLOCK_DEF,
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
  // Custom.Formula is REMOVED from the library — superseded by Custom.CodeBlock
  // (a CodeBlock with `Result = <expr>` produces the same x/y inputs and one
  // output, with arbitrary expressions and more inputs). This def is retained ONE
  // release ONLY as a deprecated, hidden resolving FALLBACK so a graph saved with
  // un-migrated Custom.Formula nodes still computes. `metadata.deprecated` hides
  // it from the library/fit gate; `metadata.migrateTo` describes the type→type
  // migration (see core/node-versions.js `migrateNodeType` + the load-time hook).
  {
    type: 'Custom.Formula',
    name: 'Custom.Formula',
    category: 'custom',
    subGroup: 'Custom',
    icon: 'ƒ',
    aliases: ['custom-formula'],
    description: 'Deprecated — replaced by Custom.CodeBlock. Retained so existing graphs keep working; new graphs use a CodeBlock with Result = <expression>.',
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
    metadata: {
      deprecated: true,
      // type→type migration target consumed by migrateNodeType(): each
      // Custom.Formula instance becomes a Custom.CodeBlock whose code is
      // `Result = <expr>`, with ports remapped x→x, y→y, result→Result.
      migrateTo: {
        type: 'Custom.CodeBlock',
        codeFromControls(controls) {
          const expr = (controls && controls.expr != null && String(controls.expr).trim()) || 'x + y';
          return 'Result = ' + expr;
        },
        portMap: { x: 'x', y: 'y', result: 'Result' }
      }
    },
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
      { id: 'elements', name: 'elements', type: 'list', description: 'Revit elements to inspect. Leave empty to use the active Revit selection when connected.' },
      { id: 'options', name: 'options', type: 'any', description: 'Optional settings for Revit/Nova Connect operations.' }
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'any', description: 'Dictionary containing Revit connection context, selected elements, options, and count.' }
    ],
    controls: [
      { id: 'code', type: 'text', default: DEFAULT_CUSTOM_PYTHON_CODE, label: 'Python' }
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
      inputs: [
        { name: 'elements', description: 'Revit element list' },
        { name: 'options', description: 'Optional operation settings' }
      ],
      outputs: [{ name: 'result', description: 'Computed result' }],
      example: {
        title: 'Set up a Revit connection context',
        nodes: [
          { type: 'List.Create', x: 0, y: 0 },
          { type: 'Custom.Python', x: 260, y: 0 },
          { type: 'Output.Watch', x: 540, y: 0 }
        ],
        wires: [
          [0, 'list', 1, 'elements'],
          [1, 'result', 2, 'value']
        ]
      },
      sampleCode: DEFAULT_CUSTOM_PYTHON_CODE
    }
  }
];
