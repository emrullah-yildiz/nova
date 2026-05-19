export const listCategory = {
  id: 'list',
  name: 'List',
  color: '#fab387',
  icon: '☰'
};

export const listNodes = [
  {
    type: 'list.create',
    name: 'List.Create',
    category: 'list',
    icon: '[ ]',
    inputs: [
      { id: 'item0', name: 'Item 0', type: 'any' },
      { id: 'item1', name: 'Item 1', type: 'any' }
    ],
    outputs: [{ id: 'list', name: 'List', type: 'list' }],
    dynamicInputs: true,
    execute(context, inputs) {
      return {
        list: Object.keys(inputs)
          .sort()
          .map(key => inputs[key])
          .filter(value => value !== undefined)
      };
    },
    codegen: {
      python: '{{list}} = []',
      csharp: ''
    }
  },
  {
    type: 'list.count',
    name: 'List.Count',
    category: 'list',
    icon: '#',
    inputs: [{ id: 'list', name: 'List', type: 'list' }],
    outputs: [{ id: 'count', name: 'Count', type: 'number' }],
    execute(context, inputs) {
      return { count: Array.isArray(inputs.list) ? inputs.list.length : 0 };
    },
    codegen: {
      python: '{{count}} = len({{list}})',
      csharp: ''
    }
  }
];
