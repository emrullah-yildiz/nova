// Fixture lesson used by the learning-system tests. It exercises real node types
// that exist on develop (Input.Number / Math.Add / Output.Watch) plus a wiring
// check and a choice (MCQ) check, proving validateChecks + the solution guard
// end-to-end. Kept under tests/fixtures so eslint's relaxed override applies and
// so it never ships as a real lesson.

export const fixtureLesson = {
  id: 'fixture-add-two-numbers',
  track: 'beginner',
  order: 1,
  title: 'Add two numbers',
  intro: 'Wire two number inputs into Add, then Add into Watch to make 7.',
  palette: ['Input.Number', 'Math.Add', 'Output.Watch'],
  starter: {
    nodes: [
      { id: 'a', type: 'Input.Number', controlValues: { val: 3 }, x: 40, y: 60 },
      { id: 'b', type: 'Input.Number', controlValues: { val: 4 }, x: 40, y: 160 },
      { id: 'sum', type: 'Math.Add', x: 260, y: 110 },
      { id: 'w', type: 'Output.Watch', x: 480, y: 110 }
    ],
    wires: []
  },
  steps: [
    {
      prompt: 'Wire both numbers into Add, then Add into Watch.',
      checks: [
        {
          kind: 'output',
          node: 'w',
          expected: 7,
          tolerance: 1e-9,
          hint: "Drag from each Number's output port into an Add input, then Add → Watch."
        },
        {
          kind: 'wiring',
          from: 'sum',
          fromPort: 'result',
          to: 'w',
          toPort: 'value',
          hint: 'Connect Add.result to Watch.value.'
        }
      ]
    },
    {
      prompt: 'Which port carries a value OUT of a node?',
      checks: [
        {
          kind: 'choice',
          answer: 'output',
          hint: 'Outputs are on the right edge of a node.'
        }
      ]
    }
  ],
  solution: {
    nodes: [
      { id: 'a', type: 'Input.Number', controlValues: { val: 3 } },
      { id: 'b', type: 'Input.Number', controlValues: { val: 4 } },
      { id: 'sum', type: 'Math.Add' },
      { id: 'w', type: 'Output.Watch' }
    ],
    wires: [
      { fromNode: 'a', fromPort: 'value', toNode: 'sum', toPort: 'a' },
      { fromNode: 'b', fromPort: 'value', toNode: 'sum', toPort: 'b' },
      { fromNode: 'sum', fromPort: 'result', toNode: 'w', toPort: 'value' }
    ]
  }
};

export default fixtureLesson;
