export const inputCategory = {
  id: 'input',
  name: 'Input',
  color: '#cba6f7',
  icon: '⊙'
};

export const inputNodes = [
  {
    type: 'input.number',
    name: 'Number',
    category: 'input',
    icon: '#',
    outputs: [{ id: 'result', name: 'Result', type: 'number' }],
    controls: [{ id: 'val', type: 'formula', default: '0', label: 'Value' }],
    execute(context, inputs, controls) {
      return { result: Number(controls.val || 0) };
    },
    codegen: {
      python: '{{result}} = {{ctrl.val}}',
      csharp: 'double {{result}} = {{ctrl.val}};'
    }
  },
  {
    type: 'input.text',
    name: 'Text',
    category: 'input',
    icon: 'T',
    outputs: [{ id: 'value', name: 'Value', type: 'string' }],
    controls: [{ id: 'val', type: 'text', default: 'Hello', label: 'Text' }],
    execute(context, inputs, controls) {
      return { value: controls.val || '' };
    },
    codegen: {
      python: '{{value}} = "{{ctrl.val}}"',
      csharp: 'string {{value}} = "{{ctrl.val}}";'
    }
  }
];
