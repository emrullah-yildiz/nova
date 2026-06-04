import { resolveCodeBlockPorts } from '../../runtime/python-port-decl.js';
import { desugarSeries } from '../../runtime/codeblock-syntax.js';

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

// Default code for a fresh CodeBlock — a self-contained example that produces a
// port `Result` from two free-variable inputs `x`, `y` (no wiring required to run
// once they are fed). Multi-statement and literal-friendly.
export const DEFAULT_CODEBLOCK_CODE = 'Result = x + y';

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

// Custom.CodeBlock (v2) — the canonical lightweight, multi-statement, code-driven
// inline block. Language = python (the only real runtime). Ports derive from the
// code: free variables → inputs, ALL top-level assignments → outputs (via
// resolveCodeBlockPorts). The `..`/`#` series shorthand desugars to a Python list
// literal (desugarSeries) before execution. Outputs are raw values (numbers /
// strings / lists), so it is Properties-rule friendly.
//
// `custom-codeblock` / `custom-code` / `Custom.Code` resolve here as aliases; the
// engine's PythonRunner switch arm routes all of these spellings. The `language`
// field is carried so a future C# language is a value change, not a new node type.
const CUSTOM_CODEBLOCK_DEF = {
  type: 'Custom.CodeBlock',
  name: 'Custom.CodeBlock',
  category: 'custom',
  subGroup: 'Custom',
  icon: '{ }',
  version: 2,
  aliases: ['custom-codeblock', 'custom-code', 'Custom.Code'],
  priorVersions: [CUSTOM_CODEBLOCK_V1],
  description: 'A lightweight code block. Free variables read in the code become input ports; every top-level assignment becomes an output port. Supports a series shorthand (e.g. 0..10, 0..10..2, 0..10..#5) that expands to a number list. Outputs are plain values consumable by List, math, and watch nodes.',
  // Static SEED ports that match the default code `Result = x + y`. At runtime the
  // ports are code-driven (resolveCodeBlockPorts re-derives them on edit-commit
  // via the on-node editor), but the def carries these so a freshly-dropped node
  // renders with the right ports and the help sample validates — exactly how
  // Custom.Python seeds `elements`/`options`/`result`.
  inputs: [
    { id: 'x', name: 'x', type: 'any', description: 'Free variable read in the default code → input port' },
    { id: 'y', name: 'y', type: 'any', description: 'Free variable read in the default code → input port' }
  ],
  outputs: [
    { id: 'Result', name: 'Result', type: 'any', description: 'Value of the top-level assignment Result' }
  ],
  controls: [
    { id: 'code', type: 'text', default: DEFAULT_CODEBLOCK_CODE, label: 'Code' }
  ],
  metadata: {
    // language = the execution runtime; carried so a future C# language is a value
    // change, not a new node type. The on-node editor calls resolveCodeBlockPorts
    // (python-port-decl.js) on commit to derive ports from the code.
    language: 'python',
    codeDriven: true,
    skipSampleExecution: true
  },
  execute() {
    // Live execution is routed through PythonRunner by the engine (the
    // custom-codeblock switch arm), which desugars the series syntax first. This
    // stub keeps the registry def shape consistent.
    return { output0: undefined };
  },
  codegen: {
    // {{ctrl.code}} is substituted with the raw code at export; the engine
    // desugars the series syntax for live execution. The exporter short-circuit
    // (app.js generateNodeCode) emits the desugared code for a clean round-trip.
    python: '{{ctrl.code}}',
    csharp: '/* CodeBlock (Python runtime) — not directly portable */'
  },
  help: {
    inputs: [
      { name: 'x', description: 'Free variable read in the code → input port' },
      { name: 'y', description: 'Free variable read in the code → input port' }
    ],
    outputs: [{ name: 'Result', description: 'Top-level assignment → output port' }],
    example: {
      title: 'CodeBlock Result = x * 2 on 5 → 10',
      nodes: [
        { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
        { type: 'Custom.CodeBlock', x: 240, y: 0, controls: { code: 'Result = x * 2' } },
        { type: 'Output.Watch', x: 480, y: 0 }
      ],
      wires: [
        [0, 'value', 1, 'x'],
        [1, 'Result', 2, 'value']
      ]
    },
    sampleCode: 'Result = x * 2'
  }
};

// Re-export the CodeBlock primitives so consumers (engine, exporter, on-node
// editor, tests) import them from one place alongside the node defs without
// reaching into runtime internals. resolveCodeBlockPorts is the port-resolution
// contract the on-node editor (Switch) calls on edit-commit.
export { desugarSeries, resolveCodeBlockPorts };

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
