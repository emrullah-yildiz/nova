export const outputCategory = {
  id: 'output',
  name: 'Output',
  color: '#f9e2af',
  icon: '◎'
};

export const outputNodes = [
  {
    type: 'Output.Watch',
    name: 'Output.Watch',
    category: 'output',
    subGroup: 'Output',
    icon: '👁',
    aliases: ['output-watch'],
    description: 'A passive watcher that displays whatever upstream value flows in. The most common end-of-workflow sink — wire any compute result here to inspect it in the node body without affecting downstream logic.',
    inputs: [
      { id: 'value', name: 'Value', type: 'any', description: 'Value to display' }
    ],
    outputs: [],
    controls: [],
    execute(context, inputs) {
      return inputs.value;
    },
    codegen: {
      python: 'print({{value}})',
      csharp: 'Console.WriteLine({{value}});'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Upstream value' }],
      outputs: [],
      example: {
        title: 'Watch a constant value (42)',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 42 } },
          { type: 'Output.Watch', x: 240, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'value']
        ]
      },
      sampleCode: 'print({{value}})'
    }
  },
  {
    type: 'Output.Display',
    name: 'Output.Display',
    category: 'output',
    subGroup: 'Output',
    icon: '🖥',
    aliases: ['output-display'],
    description: 'Renders the input value with a chosen format — Auto (default print), JSON (structured), or Table (tabular rendering for lists of records). Use during debugging when raw print isn\'t readable enough.',
    inputs: [
      { id: 'value', name: 'Value', type: 'any', description: 'Value to render' }
    ],
    outputs: [],
    controls: [
      { id: 'format', type: 'dropdown', options: ['Auto', 'JSON', 'Table'], default: 'Auto', label: 'Format' }
    ],
    execute(context, inputs) {
      return inputs.value;
    },
    codegen: {
      python: 'print({{value}})',
      csharp: 'Console.WriteLine({{value}});'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Value to render' }],
      outputs: [],
      example: {
        title: 'Display the sum 5 + 4 = 9',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 5 } },
          { type: 'Input.Number', x: 0, y: 70, controls: { val: 4 } },
          { type: 'Math.Add', x: 240, y: 30 },
          { type: 'Output.Display', x: 460, y: 30 }
        ],
        wires: [
          [0, 'value', 2, 'a'],
          [1, 'value', 2, 'b'],
          [2, 'result', 3, 'value']
        ]
      },
      sampleCode: 'print({{value}})'
    }
  },
  {
    type: 'Output.Console',
    name: 'Output.Console',
    category: 'output',
    subGroup: 'Output',
    icon: '⊳',
    aliases: ['output-log'],
    description: 'Logs the input value to the browser developer console (and to the generated Python via print). Useful for headless debugging — values appear in the JS console without taking up canvas room.',
    inputs: [
      { id: 'value', name: 'Value', type: 'any', description: 'Value to log to the console' }
    ],
    outputs: [],
    controls: [],
    execute(context, inputs) {
      return inputs.value;
    },
    codegen: {
      python: 'print({{value}})',
      csharp: 'Console.WriteLine({{value}});'
    },
    help: {
      inputs: [{ name: 'Value', description: 'Value to log' }],
      outputs: [],
      example: {
        title: 'Log a constant value to the console',
        nodes: [
          { type: 'Input.Number', x: 0, y: 0, controls: { val: 7 } },
          { type: 'Output.Console', x: 240, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'value']
        ]
      },
      sampleCode: 'print({{value}})'
    }
  },
  {
    type: 'Output.Chart',
    name: 'Output.Chart',
    category: 'output',
    subGroup: 'Output',
    icon: '📊',
    aliases: ['output-chart'],
    description: 'Renders a numeric list as a chart (Bar, Line, or Pie). Pair with List.Range or List.Map to visualise sampled curves, distributions and aggregated counts.',
    inputs: [
      { id: 'data', name: 'Data', type: 'list', description: 'List of numeric values to chart' }
    ],
    outputs: [],
    controls: [
      { id: 'chartType', type: 'dropdown', options: ['Bar', 'Line', 'Pie'], default: 'Bar', label: 'Type' }
    ],
    execute(context, inputs) {
      return inputs.data;
    },
    codegen: {
      python: 'plot_chart({{data}}, chart_type="{{ctrl.chartType}}")',
      csharp: '/* plot_chart({{data}}, "{{ctrl.chartType}}") */'
    },
    help: {
      inputs: [{ name: 'Data', description: 'Numeric list' }],
      outputs: [],
      example: {
        title: 'Chart a 0..10 range as a bar chart',
        nodes: [
          { type: 'Input.Integer', x: 0, y: 0, controls: { val: 0 } },
          { type: 'Input.Integer', x: 0, y: 70, controls: { val: 10 } },
          { type: 'Input.Integer', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 240, y: 60 },
          { type: 'Output.Chart', x: 460, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'data']
        ]
      },
      sampleCode: 'plot_chart({{data}}, chart_type="{{ctrl.chartType}}")'
    }
  },
  {
    type: 'Output.Export',
    name: 'Output.Export',
    category: 'output',
    subGroup: 'Output',
    icon: '📤',
    aliases: ['output-export'],
    description: 'Serialises the input value to JSON, CSV, or Text and prompts a file download. Use at the end of a workflow to hand the computed data off to an external tool — spreadsheets, reports, downstream scripts.',
    inputs: [
      { id: 'data', name: 'Data', type: 'any', description: 'Value or list to export' }
    ],
    outputs: [],
    controls: [
      { id: 'fmt', type: 'dropdown', options: ['JSON', 'CSV', 'Text'], default: 'JSON', label: 'Format' }
    ],
    execute(context, inputs) {
      return inputs.data;
    },
    codegen: {
      python: 'export_data({{data}}, format="{{ctrl.fmt}}")',
      csharp: '/* export_data({{data}}, "{{ctrl.fmt}}") */'
    },
    help: {
      inputs: [{ name: 'Data', description: 'Value to export' }],
      outputs: [],
      example: {
        title: 'Export a 0..5 range as JSON',
        nodes: [
          { type: 'Input.Integer', x: 0, y: 0, controls: { val: 0 } },
          { type: 'Input.Integer', x: 0, y: 70, controls: { val: 5 } },
          { type: 'Input.Integer', x: 0, y: 140, controls: { val: 1 } },
          { type: 'List.Range', x: 240, y: 60 },
          { type: 'Output.Export', x: 460, y: 60 }
        ],
        wires: [
          [0, 'value', 3, 'start'],
          [1, 'value', 3, 'end'],
          [2, 'value', 3, 'step'],
          [3, 'list', 4, 'data']
        ]
      },
      sampleCode: 'export_data({{data}}, format="{{ctrl.fmt}}")'
    }
  }
];
