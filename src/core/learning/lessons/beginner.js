// Beginner learning lessons authored as plain data.
//
// These are intentionally small, engine-verifiable graphs: each lesson ships a
// starter, a solution, and checks that prove the concept can be completed without
// relying on one exact wiring pattern where an output value is enough.

export const beginnerLessons = [
  {
    id: 'beginner-wiring-add',
    track: 'beginner',
    order: 10,
    title: 'Wire your first result',
    intro: 'Start with two number inputs, connect them through Math.Add, and watch the result.',
    palette: ['Input.Number', 'Math.Add', 'Output.Watch'],
    starter: {
      nodes: [
        { id: 'a', role: 'left-number', type: 'Input.Number', controlValues: { val: 3 }, x: 40, y: 60 },
        { id: 'b', role: 'right-number', type: 'Input.Number', controlValues: { val: 4 }, x: 40, y: 160 },
        { id: 'sum', role: 'adder', type: 'Math.Add', x: 280, y: 110 },
        { id: 'watch', role: 'watch', type: 'Output.Watch', x: 520, y: 110 }
      ],
      wires: []
    },
    steps: [
      {
        prompt: 'Connect both numbers into Math.Add, then connect Math.Add into Output.Watch.',
        checks: [
          {
            kind: 'output',
            node: 'watch',
            expected: 7,
            tolerance: 1e-9,
            hint: 'Wire 3 and 4 into Math.Add, then send the result to Output.Watch.'
          },
          {
            kind: 'wiring',
            from: 'adder',
            fromPort: 'result',
            to: 'watch',
            toPort: 'value',
            hint: 'The Add result port needs to feed the Watch value port.'
          }
        ]
      },
      {
        prompt: 'Which side of a node sends data onward?',
        checks: [
          {
            kind: 'choice',
            answer: 'output',
            hint: 'Outputs send data onward; inputs receive data from other nodes.'
          }
        ]
      }
    ],
    solution: {
      nodes: [
        { id: 'a', role: 'left-number', type: 'Input.Number', controlValues: { val: 3 } },
        { id: 'b', role: 'right-number', type: 'Input.Number', controlValues: { val: 4 } },
        { id: 'sum', role: 'adder', type: 'Math.Add' },
        { id: 'watch', role: 'watch', type: 'Output.Watch' }
      ],
      wires: [
        { fromNode: 'a', fromPort: 'value', toNode: 'sum', toPort: 'a' },
        { fromNode: 'b', fromPort: 'value', toNode: 'sum', toPort: 'b' },
        { fromNode: 'sum', fromPort: 'result', toNode: 'watch', toPort: 'value' }
      ]
    },
    hints: [
      'Ports on the right produce values.',
      'Ports on the left receive values.',
      'A Watch node is the simplest way to inspect a graph result.'
    ]
  },
  {
    id: 'beginner-lists-sum',
    track: 'beginner',
    order: 20,
    title: 'Build and total a list',
    intro: 'Lists let one wire carry many values. Assemble three numbers, then sum them as one list.',
    palette: ['Input.Number', 'List.Create', 'List.Sum', 'Output.Watch'],
    starter: {
      nodes: [
        { id: 'n1', role: 'first', type: 'Input.Number', controlValues: { val: 2 }, x: 40, y: 40 },
        { id: 'n2', role: 'second', type: 'Input.Number', controlValues: { val: 4 }, x: 40, y: 120 },
        { id: 'n3', role: 'third', type: 'Input.Number', controlValues: { val: 6 }, x: 40, y: 200 },
        { id: 'list', role: 'list', type: 'List.Create', _dynInputIds: ['item0', 'item1', 'item2'], x: 280, y: 110 },
        { id: 'sum', role: 'sum', type: 'List.Sum', x: 520, y: 110 },
        { id: 'watch', role: 'watch', type: 'Output.Watch', x: 760, y: 110 }
      ],
      wires: []
    },
    steps: [
      {
        prompt: 'Wire the three numbers into List.Create, then send the list through List.Sum to Watch.',
        checks: [
          {
            kind: 'output',
            node: 'watch',
            expected: 12,
            tolerance: 1e-9,
            hint: 'List.Create should receive 2, 4, and 6; List.Sum should total that list to 12.'
          },
          {
            kind: 'wiring',
            from: 'list',
            fromPort: 'list',
            to: 'sum',
            toPort: 'list',
            hint: 'Connect List.Create.list to List.Sum.list.'
          }
        ]
      },
      {
        prompt: 'What is the value flowing out of List.Create before it is summed?',
        checks: [
          {
            kind: 'choice',
            answer: 'list',
            hint: 'List.Create outputs one list value, not three separate wires.'
          }
        ]
      }
    ],
    solution: {
      nodes: [
        { id: 'n1', role: 'first', type: 'Input.Number', controlValues: { val: 2 } },
        { id: 'n2', role: 'second', type: 'Input.Number', controlValues: { val: 4 } },
        { id: 'n3', role: 'third', type: 'Input.Number', controlValues: { val: 6 } },
        { id: 'list', role: 'list', type: 'List.Create', _dynInputIds: ['item0', 'item1', 'item2'] },
        { id: 'sum', role: 'sum', type: 'List.Sum' },
        { id: 'watch', role: 'watch', type: 'Output.Watch' }
      ],
      wires: [
        { fromNode: 'n1', fromPort: 'value', toNode: 'list', toPort: 'item0' },
        { fromNode: 'n2', fromPort: 'value', toNode: 'list', toPort: 'item1' },
        { fromNode: 'n3', fromPort: 'value', toNode: 'list', toPort: 'item2' },
        { fromNode: 'list', fromPort: 'list', toNode: 'sum', toPort: 'list' },
        { fromNode: 'sum', fromPort: 'result', toNode: 'watch', toPort: 'value' }
      ]
    },
    hints: [
      'List.Create keeps the input order: item0, item1, item2.',
      'List.Sum expects a list input, then returns one numeric total.'
    ]
  },
  {
    id: 'beginner-lacing-add',
    track: 'beginner',
    order: 30,
    title: 'Add two lists with lacing',
    intro: 'Lacing is how Nova repeats a node over list items. Add two matching lists to get one result per pair.',
    palette: ['Input.Number', 'List.Create', 'Math.Add', 'Output.Watch'],
    starter: {
      nodes: [
        { id: 'a1', role: 'a1', type: 'Input.Number', controlValues: { val: 1 }, x: 40, y: 30 },
        { id: 'a2', role: 'a2', type: 'Input.Number', controlValues: { val: 2 }, x: 40, y: 100 },
        { id: 'a3', role: 'a3', type: 'Input.Number', controlValues: { val: 3 }, x: 40, y: 170 },
        { id: 'b1', role: 'b1', type: 'Input.Number', controlValues: { val: 10 }, x: 40, y: 280 },
        { id: 'b2', role: 'b2', type: 'Input.Number', controlValues: { val: 20 }, x: 40, y: 350 },
        { id: 'b3', role: 'b3', type: 'Input.Number', controlValues: { val: 30 }, x: 40, y: 420 },
        { id: 'listA', role: 'list-a', type: 'List.Create', _dynInputIds: ['item0', 'item1', 'item2'], x: 300, y: 100 },
        { id: 'listB', role: 'list-b', type: 'List.Create', _dynInputIds: ['item0', 'item1', 'item2'], x: 300, y: 350 },
        { id: 'add', role: 'adder', type: 'Math.Add', x: 560, y: 230 },
        { id: 'watch', role: 'watch', type: 'Output.Watch', x: 800, y: 230 }
      ],
      wires: []
    },
    steps: [
      {
        prompt: 'Make two lists, wire them into Math.Add, and watch the laced result.',
        checks: [
          {
            kind: 'output',
            node: 'watch',
            expected: [11, 22, 33],
            tolerance: 1e-9,
            hint: 'Wire [1, 2, 3] into Add.a and [10, 20, 30] into Add.b; Math.Add will add each pair.'
          },
          {
            kind: 'wiring',
            from: 'list-a',
            fromPort: 'list',
            to: 'adder',
            toPort: 'a',
            hint: 'The first list should feed Math.Add input A.'
          },
          {
            kind: 'wiring',
            from: 'list-b',
            fromPort: 'list',
            to: 'adder',
            toPort: 'b',
            hint: 'The second list should feed Math.Add input B.'
          }
        ]
      },
      {
        prompt: 'What does shortest lacing do with two equal-length lists?',
        checks: [
          {
            kind: 'choice',
            answer: 'pairwise',
            hint: 'Shortest lacing pairs items by index until one list runs out.'
          }
        ]
      }
    ],
    solution: {
      nodes: [
        { id: 'a1', role: 'a1', type: 'Input.Number', controlValues: { val: 1 } },
        { id: 'a2', role: 'a2', type: 'Input.Number', controlValues: { val: 2 } },
        { id: 'a3', role: 'a3', type: 'Input.Number', controlValues: { val: 3 } },
        { id: 'b1', role: 'b1', type: 'Input.Number', controlValues: { val: 10 } },
        { id: 'b2', role: 'b2', type: 'Input.Number', controlValues: { val: 20 } },
        { id: 'b3', role: 'b3', type: 'Input.Number', controlValues: { val: 30 } },
        { id: 'listA', role: 'list-a', type: 'List.Create', _dynInputIds: ['item0', 'item1', 'item2'] },
        { id: 'listB', role: 'list-b', type: 'List.Create', _dynInputIds: ['item0', 'item1', 'item2'] },
        { id: 'add', role: 'adder', type: 'Math.Add' },
        { id: 'watch', role: 'watch', type: 'Output.Watch' }
      ],
      wires: [
        { fromNode: 'a1', fromPort: 'value', toNode: 'listA', toPort: 'item0' },
        { fromNode: 'a2', fromPort: 'value', toNode: 'listA', toPort: 'item1' },
        { fromNode: 'a3', fromPort: 'value', toNode: 'listA', toPort: 'item2' },
        { fromNode: 'b1', fromPort: 'value', toNode: 'listB', toPort: 'item0' },
        { fromNode: 'b2', fromPort: 'value', toNode: 'listB', toPort: 'item1' },
        { fromNode: 'b3', fromPort: 'value', toNode: 'listB', toPort: 'item2' },
        { fromNode: 'listA', fromPort: 'list', toNode: 'add', toPort: 'a' },
        { fromNode: 'listB', fromPort: 'list', toNode: 'add', toPort: 'b' },
        { fromNode: 'add', fromPort: 'result', toNode: 'watch', toPort: 'value' }
      ]
    },
    hints: [
      'A laced Math.Add can return a list.',
      'Equal-length lists make the easiest first lacing example: index 0 with index 0, index 1 with index 1, and so on.'
    ]
  }
];

export default beginnerLessons;
