// Nova Learning page — comprehensive chapter-based primer.
//
// Structure: 10 chapters (Introduction → Code Block), each with concept
// sections, code examples, and interactive quiz questions the user must answer
// correctly before advancing. Mirrors the Dynamo Primer model.
//
// Public API:
//   buildLearningHtml()       → pure string; the modal container HTML
//   initLearning(overlay)     → sets up chapter rendering + quiz handlers
//   attachLearningShots(doc)  → backward-compat; no-ops in the new design
//   LEARNING_CHAPTERS         → the chapter data array (for tests)

// ── Module state ──────────────────────────────────────────────────────────────
let _learnChapter = 0;
// _learnDone[chIdx][qIdx] = true once that quiz question is answered correctly
let _learnDone = {};

// ── Chapter data ──────────────────────────────────────────────────────────────
export const LEARNING_CHAPTERS = [
  // ── 1. Introduction ────────────────────────────────────────────────────────
  {
    id: 'intro',
    title: 'Introduction',
    icon: '⬡',
    intro: 'Computational design is the practice of using algorithms, logic, and parameters to generate and manipulate geometry. Nova is a browser-based visual programming environment built for this kind of work.',
    sections: [
      {
        title: 'What is Computational Design?',
        body: 'Traditional design tools let you draw and place objects manually. Computational design lets you describe <em>rules</em> that generate geometry. Change a parameter — say, the number of floors in a tower — and the entire model updates automatically. This makes it possible to explore thousands of design variations in minutes, find optimised solutions, and build complex geometric systems that would be impractical to draw by hand.',
      },
      {
        title: 'What is Nova?',
        body: 'Nova is a node-based workspace for parametric and computational design that runs entirely in the browser — no installation required. You connect small function-nodes together into a graph, and Nova\'s engine computes the result live in the 3D viewport. Nova can also bridge to desktop tools like Autodesk Revit via the Nova Connect plugin, letting you pull real project geometry in and push parametric results back out.',
      },
      {
        title: 'Visual Programming vs. Writing Code',
        body: 'In Nova you write almost no code by hand. Each node is a small function with typed input ports (left) and output ports (right). You connect outputs to inputs with wires, and data flows through the graph from left to right. This "wiring" approach makes the logic visible and inspectable at every step — much easier to debug and iterate than a wall of code.',
      },
      {
        title: 'How the Graph Executes',
        body: 'Nodes execute in dependency order: a node runs only after all its upstream nodes have finished. The result of each node is immediately available as the input for the next. In <strong>Auto</strong> mode every change triggers an instant recalculation; in <strong>Manual</strong> mode you press the run button when you\'re ready. The engine is fully deterministic — the same graph with the same inputs always produces the same result.',
      },
    ],
    quiz: [
      {
        q: 'What happens automatically when you change a parameter in a computational design model?',
        options: [
          'The node names reset to defaults',
          'The geometry and all downstream calculations update',
          'The project file is renamed',
          'The 3D camera resets to the home view',
        ],
        answer: 1,
        explanation: 'The entire graph re-executes from the changed node downward, so all dependent geometry and values update instantly.',
      },
      {
        q: 'In Nova, what does a wire connecting two nodes represent?',
        options: [
          'A comment or annotation linking two concepts',
          'Data flowing from one node\'s output to another\'s input',
          'A line of Python source code',
          'A geometric edge in the 3D model',
        ],
        answer: 1,
        explanation: 'Wires are the data channels of the graph. They carry the computed value of an output port to the input port of the next node.',
      },
    ],
  },

  // ── 2. Interface ────────────────────────────────────────────────────────────
  {
    id: 'interface',
    title: 'Interface',
    icon: '⊞',
    intro: 'Nova\'s interface has five main areas: the canvas, the node library, the 3D viewport, the inspector panel, and the toolbar. Learning each area makes you productive immediately.',
    sections: [
      {
        title: 'The Canvas',
        body: 'The canvas is the main workspace where you build your node graph. <strong>Pan</strong> by holding the middle mouse button (or Space + drag). <strong>Zoom</strong> with the scroll wheel. <strong>Select</strong> nodes by clicking or drag-selecting an area. Hold <kbd>Shift</kbd> to add to your selection. <strong>Delete</strong> selected nodes with the Delete or Backspace key. <strong>Double-click</strong> the canvas to open the node search popup and add a node at the cursor position.',
      },
      {
        title: 'The Node Library',
        body: 'The panel on the left lists every node grouped by category. Categories expand and collapse with a click. Use the <strong>search bar</strong> at the top to filter by name — start typing and matching nodes appear instantly. You can drag a node from the library to a specific canvas position, or single-click it to place it near the centre. The library shows a brief description when you hover a node name.',
      },
      {
        title: '3D Viewport',
        body: 'The 3D viewport renders computed geometry live. As you edit the graph, it updates in real time. <strong>Orbit</strong>: left-click and drag. <strong>Pan</strong>: right-click and drag (or Shift + left-drag). <strong>Zoom</strong>: scroll wheel. <strong>Reset view</strong>: press F or Home. Geometry nodes automatically feed their output into the viewport; use the <em>Output.Watch</em> node to inspect non-geometry values without rendering them as 3D.',
      },
      {
        title: 'Inspector Panel',
        body: 'Selecting a node opens its inspector on the right side. The inspector shows all input and output port names with their current computed values, any warnings or errors, and the node\'s documentation. It is the primary debugging surface — if a node produces an unexpected result, open its inspector to see exactly what each port holds.',
      },
      {
        title: 'Toolbar',
        body: 'The toolbar at the top contains the run-mode toggle (<strong>Auto</strong> / <strong>Manual</strong>), project actions (New, Save, Open), the Help menu, and the account button. Switching to Manual mode is useful when the graph is heavy and you only want it to recalculate on demand. Press the ▶ Play button (or the keyboard shortcut) to trigger a manual run.',
      },
    ],
    quiz: [
      {
        q: 'How do you search for and add a node to the canvas?',
        options: [
          'Press F5 to open the node refresh dialog',
          'Type a node name in the Output.Watch control',
          'Drag from the library panel, or double-click an empty area on the canvas',
          'Right-click the 3D viewport',
        ],
        answer: 2,
        explanation: 'The library panel lets you browse and drag nodes. Double-clicking blank canvas opens a search popup where you can type and place a node in one action.',
      },
      {
        q: 'Which panel shows the current computed value of each port on a selected node?',
        options: [
          'The 3D viewport',
          'The node library',
          'The toolbar',
          'The inspector panel',
        ],
        answer: 3,
        explanation: 'The inspector panel is the debugging surface: it shows port values, warnings, and documentation for the selected node.',
      },
    ],
  },

  // ── 3. Node Anatomy ─────────────────────────────────────────────────────────
  {
    id: 'node-layout',
    title: 'Node Anatomy',
    icon: '◫',
    intro: 'Every node shares the same visual grammar: a coloured header, a body with ports and controls, and circular port dots that you connect with wires.',
    sections: [
      {
        title: 'The Node Header',
        body: 'The header bar at the top of every node displays a small category <strong>icon</strong>, the node\'s full <strong>name</strong>, and the context-menu button (⋮). The header colour is the category colour, making it easy to spot related nodes at a glance. Click the header and drag to move the node around the canvas.',
      },
      {
        title: 'Input Ports (Left Side)',
        body: 'Input ports are the small circles on the <strong>left edge</strong> of the node. They receive data from upstream nodes. Each port has a label (e.g. <code>a</code>, <code>radius</code>) and an optional type. When no wire is connected to an input port, the node falls back to the <strong>control value</strong> — the number, text, or dropdown that appears directly in the node body. Hovering a port dot shows its name and expected type.',
      },
      {
        title: 'Output Ports (Right Side)',
        body: 'Output ports are the circles on the <strong>right edge</strong> of the node. They emit the node\'s computed result. A node can have one output or many (e.g. a node that produces both a geometry and a count). Drag from an output port to an input port to create a wire. The wire turns solid once connected.',
      },
      {
        title: 'Node Controls',
        body: 'Controls are editable widgets embedded in the node body: number fields, text areas, sliders, dropdowns. They provide the node\'s <em>default</em> input value when no wire is connected. Once you wire a value in from another node, the control is overridden by the incoming data. This means you can prototype quickly by typing a value directly, then later replace it with a dynamic upstream source.',
      },
      {
        title: 'Port Types and Colours',
        body: 'Ports are colour-coded by data type to help you identify compatible connections at a glance. Common types: <strong style="color:#89b4fa">blue</strong> = number, <strong style="color:#a6e3a1">green</strong> = boolean or geometry, <strong style="color:#f9e2af">yellow</strong> = list, <strong style="color:#94e2d5">teal</strong> = custom/any. An <em>any</em> port accepts any data type; typed ports will warn you if the incoming type is incompatible.',
      },
    ],
    quiz: [
      {
        q: 'On which side of a node are the OUTPUT ports located?',
        options: [
          'Top edge',
          'Left edge',
          'Right edge',
          'Bottom edge',
        ],
        answer: 2,
        explanation: 'Input ports (receiving data) are on the left; output ports (sending data) are on the right. Data flows left-to-right through the graph.',
      },
      {
        q: 'When no wire is connected to an input port, what value does the node use?',
        options: [
          'Always zero',
          'The value from the last run',
          'The control value set directly on the node',
          'It always produces an error',
        ],
        answer: 2,
        explanation: 'The inline control (number field, text area, etc.) provides the default input. Wire it to override the control with a dynamic value from another node.',
      },
    ],
  },

  // ── 4. Data Types ───────────────────────────────────────────────────────────
  {
    id: 'data-types',
    title: 'Data Types',
    icon: '≡',
    intro: 'Nova\'s engine is dynamically typed: a port labelled <em>any</em> accepts everything, while typed ports carry a hint about the expected data. Understanding the common types helps you connect nodes correctly and debug type mismatches.',
    sections: [
      {
        title: 'Number',
        body: 'Numbers are the most common type in Nova. They can be integers (e.g. <code>4</code>) or floating-point (e.g. <code>3.14</code>). Use <strong>Input.Number</strong> to introduce a constant. Use <strong>Input.Slider</strong> to expose a number with a draggable range control. Numbers flow into math nodes, geometry dimension inputs, repeat counts, and everywhere else a quantity is needed.',
      },
      {
        title: 'Boolean',
        body: 'Booleans are <code>true</code> or <code>false</code>. Use <strong>Input.Boolean</strong> to introduce a toggle. Booleans drive conditional logic (Logic.If), filter operations (List.Filter), and visibility toggles. Many math and comparison nodes output a boolean — for example, <code>Math.GreaterThan</code> compares two numbers and outputs <code>true</code> or <code>false</code>.',
      },
      {
        title: 'String',
        body: 'Strings are text values, enclosed in quotes when written inline: <code>"hello"</code>. Use <strong>Input.String</strong> to introduce literal text. Strings appear as labels, file names, parameter keys in Revit, and anywhere human-readable text is needed. The <strong>String.Concat</strong> node joins strings; <strong>String.Split</strong> splits on a delimiter.',
      },
      {
        title: 'List (Array)',
        body: 'A list (also called an array) is an ordered collection of any values. Lists are everywhere in Nova — a row of points, a set of walls, a sequence of numbers. Use <strong>List.Create</strong> to hand-build a list from individual inputs. Many geometry nodes return lists automatically (e.g. creating 50 points returns a list of 50 items). Lists can be nested: a list of lists (matrix). Most nodes process lists automatically through <em>lacing</em> (see the List Operations chapter).',
      },
      {
        title: 'Geometry',
        body: 'Geometry is a first-class type: points, vectors, lines, curves, surfaces, solids. Geometry values carry 3D data and are rendered live in the viewport. The type hierarchy goes <em>Point → Curve → Surface → Solid</em>. Geometry nodes are in the <strong>Geo</strong> category. Keep geometry computations toward the right of the graph so all numeric parameters are resolved upstream before the heavy geometry is built.',
      },
      {
        title: 'Null and Undefined',
        body: '<code>null</code> represents "intentionally no value." Some nodes return <code>null</code> when no result exists (e.g. <code>List.GetItem</code> with an out-of-range index). <code>undefined</code> usually means the node has not been executed yet or produced an error. Use <strong>List.Filter</strong> to remove <code>null</code> entries from a list, or <strong>Logic.If</strong> to substitute a fallback value.',
      },
    ],
    quiz: [
      {
        q: 'Which data type represents an ordered collection of values?',
        options: [
          'Number',
          'String',
          'List',
          'Boolean',
        ],
        answer: 2,
        explanation: 'A list (array) holds an ordered sequence of any number of values. It is the primary container for processing multiple items in Nova.',
      },
      {
        q: 'What are the two values a Boolean can hold?',
        options: [
          '0 and 1 (always integers)',
          'true and false',
          'yes and no (strings)',
          'null and undefined',
        ],
        answer: 1,
        explanation: 'A boolean is a logical value: true or false. It drives conditionals, filters, and comparisons throughout the graph.',
      },
    ],
  },

  // ── 5. Math Operations ──────────────────────────────────────────────────────
  {
    id: 'math',
    title: 'Math Operations',
    icon: '∑',
    intro: 'The <strong>Math</strong> category covers arithmetic, rounding, trigonometry, range generation, and number remapping. These nodes are the backbone of parametric control.',
    sections: [
      {
        title: 'Arithmetic',
        body: '<strong>Math.Add</strong>, <strong>Math.Subtract</strong>, <strong>Math.Multiply</strong>, and <strong>Math.Divide</strong> each take two numeric inputs and produce one result. They also work on lists: connecting a list of numbers to both inputs applies the operation element-by-element (through lacing). <strong>Math.Modulo</strong> gives the remainder of integer division, which is useful for alternating patterns (even/odd, every Nth item).',
        code: '// Three Math nodes chained:\n// Input.Number(3) → Math.Add → Math.Multiply(10) → Output.Watch\n// 3 + 4 = 7   →   7 × 10 = 70',
      },
      {
        title: 'Rounding',
        body: '<strong>Math.Floor</strong> rounds down to the nearest integer regardless of the decimal (e.g. <code>3.9 → 3</code>). <strong>Math.Ceil</strong> rounds up (e.g. <code>3.1 → 4</code>). <strong>Math.Round</strong> rounds to the nearest integer using standard half-up rules. <strong>Math.Trunc</strong> drops the decimal part without rounding (same as Floor for positive numbers).',
      },
      {
        title: 'Trigonometry',
        body: 'Trig functions operate in <strong>radians</strong> by default. <strong>Math.Sin</strong>, <strong>Math.Cos</strong>, and <strong>Math.Tan</strong> each take one angle input. Use <strong>Math.Degrees</strong> to convert radians to degrees, and <strong>Math.Radians</strong> to convert degrees to radians before feeding an angle into a trig node. These are essential for placing points on a circle: <code>x = radius × cos(angle)</code>, <code>y = radius × sin(angle)</code>.',
        code: '// Points on a circle of radius 5\n// angle = Math.Range(0, 360, 12) stepped in degrees\n// x = Math.Multiply(5, Math.Cos(Math.Radians(angle)))\n// y = Math.Multiply(5, Math.Sin(Math.Radians(angle)))',
      },
      {
        title: 'Range and Remap',
        body: '<strong>Math.Range</strong> (or Input.Range) generates a list of evenly-spaced numbers: specify start, end, and step or count. <strong>Math.Remap</strong> maps a value from one numeric range to another — for example, remapping a slider value from 0–100 to 0–1 for use as a UV parameter. Remap is essential whenever you have a user-facing control at a "human" scale that drives a computation at a "maths" scale.',
      },
      {
        title: 'Constants',
        body: '<strong>Math.PI</strong> outputs π ≈ 3.14159. <strong>Math.E</strong> outputs Euler\'s number ≈ 2.71828. These are special nodes with no inputs — they simply emit the constant. You can also type <code>3.14159</code> directly in a number control if you prefer, but the Math.PI node is self-documenting and easier to spot in a complex graph.',
      },
    ],
    quiz: [
      {
        q: 'What does Math.Floor(3.9) return?',
        options: [
          '4',
          '3',
          '3.9',
          '0',
        ],
        answer: 1,
        explanation: 'Math.Floor always rounds down toward negative infinity. 3.9 floors to 3.',
      },
      {
        q: 'Math.Sin and Math.Cos expect their angle input in which unit?',
        options: [
          'Degrees',
          'Radians',
          'Gradians',
          'Turns (0–1)',
        ],
        answer: 1,
        explanation: 'Nova\'s trig functions use radians. Use Math.Radians to convert from degrees first, or use the Code Block where you can write deg() as a helper.',
      },
    ],
  },

  // ── 6. Geometry Operations ──────────────────────────────────────────────────
  {
    id: 'geometry',
    title: 'Geometry Operations',
    icon: '◈',
    intro: 'The <strong>Geo</strong> category builds and transforms 3D geometry. Points and vectors are the atomic primitives; everything else — lines, surfaces, solids — is built from them.',
    sections: [
      {
        title: 'Points and Vectors',
        body: '<strong>Geo.Point</strong> takes x, y, z coordinates and creates a 3D location. <strong>Geo.Vector</strong> takes x, y, z components and creates a direction with magnitude. The distinction matters: a point is a place, a vector is a displacement. Vectors are used for translations, normals, and extrusion directions. <code>Geo.Vector.ByCoordinates(1, 0, 0)</code> is a unit vector pointing along the X axis.',
      },
      {
        title: 'Lines and Curves',
        body: '<strong>Geo.Line.By2Points</strong> takes a start point and an end point and produces a straight line. <strong>Geo.Curve.Interpolate</strong> takes a list of points and produces a smooth curve passing through all of them. <strong>Geo.Curve.ByPoints</strong> creates a polyline (straight segments). Curves are the basis for extrusions, lofts, and path-based geometry.',
      },
      {
        title: 'Surfaces',
        body: '<strong>Geo.Surface.ByPatch</strong> fills a closed curve loop with a flat or curved surface. <strong>Geo.Surface.Extrude</strong> takes a curve and a direction vector and sweeps it into a surface. <strong>Geo.Loft</strong> interpolates a surface between two or more profile curves — useful for organic or tapered forms. Surfaces have UV coordinates that let you sample points and normals at any location.',
      },
      {
        title: 'Solids',
        body: '<strong>Geo.Box</strong> creates a rectangular solid from origin point, width, depth, and height. <strong>Geo.Sphere</strong> creates a sphere from centre and radius. <strong>Geo.Cylinder</strong> from axis and radius. For more complex forms, use <strong>Geo.Solid.Extrude</strong> (sweep a closed curve profile into a solid). Boolean operations — <strong>Geo.Solid.Union</strong>, <strong>Geo.Solid.Subtract</strong>, <strong>Geo.Solid.Intersect</strong> — combine and cut solids.',
      },
      {
        title: 'Transformations',
        body: '<strong>Geo.Transform.Translate</strong> moves geometry by a vector. <strong>Geo.Transform.Rotate</strong> rotates around an axis point and axis vector by a given angle (in radians). <strong>Geo.Transform.Scale</strong> scales from an origin point by a factor. Transformations work on any geometry type and on lists of geometry — use lacing to apply the same transform to many shapes or different transforms to each.',
      },
    ],
    quiz: [
      {
        q: 'What does Geo.Point represent?',
        options: [
          'A flat surface in 3D space',
          'A direction and magnitude',
          'A location in 3D space defined by x, y, z',
          'A list of 3 coordinates stored as text',
        ],
        answer: 2,
        explanation: 'A point is a position in 3D space. A vector (different node) is a direction/displacement. Both use x/y/z but have different semantics.',
      },
      {
        q: 'Which node moves geometry from one location to another?',
        options: [
          'Math.Add',
          'Geo.Transform.Translate with a direction vector',
          'List.Map applied to the node position on canvas',
          'Input.Slider controlling the viewport camera',
        ],
        answer: 1,
        explanation: 'Geo.Transform.Translate moves geometry by a Vector. Connect the geometry to translate and a Geo.Vector for the displacement direction and amount.',
      },
    ],
  },

  // ── 7. List Operations ──────────────────────────────────────────────────────
  {
    id: 'lists',
    title: 'List Operations',
    icon: '⊞',
    intro: 'Lists are how Nova handles repetition. Almost every interesting parametric design involves generating, transforming, and filtering collections of geometry or numbers.',
    sections: [
      {
        title: 'Creating Lists',
        body: '<strong>List.Create</strong> takes any number of individual inputs and packs them into a list. <strong>List.Range</strong> generates a numeric sequence: provide start, end, and step. <strong>Input.Range</strong> is a convenience node that exposes start/end/count as controls. <strong>List.Repeat</strong> repeats a single value N times. <strong>List.Flatten</strong> collapses a nested list one level down; pass a depth parameter to control how many levels to flatten.',
      },
      {
        title: 'Accessing Items',
        body: '<strong>List.GetItem</strong> retrieves one item by zero-based index (0 = first). If the index is out of range it returns <code>null</code>. <strong>List.First</strong> and <strong>List.Last</strong> are shortcuts. <strong>List.Slice</strong> returns a sub-list from a start index with a given count. <strong>List.Length</strong> returns how many items the list contains.',
      },
      {
        title: 'Transforming Lists',
        body: '<strong>List.Map</strong> applies a node operation to every item in a list and returns a new list of results — the functional equivalent of a for-loop. <strong>List.Filter</strong> keeps only items where a boolean condition is true. <strong>List.Reverse</strong> flips the order. <strong>List.Sort</strong> sorts by a key. <strong>List.Zip</strong> interleaves two lists into a list of pairs.',
      },
      {
        title: 'Lacing',
        body: 'Lacing controls what happens when you connect a <em>list</em> to a node that expects a <em>single value</em>. Nova has three lacing modes: <strong>Shortest</strong> (zip the lists and stop at the shortest — if one list has 3 items and the other 5, you get 3 results); <strong>Longest</strong> (zip and repeat the last item of the shorter list to match the longer); <strong>Cross Product</strong> (combine every item in list A with every item in list B — N×M results). Right-click a node to change its lacing mode.',
        code: '// Cross Product example\n// List A: [1, 2, 3]  List B: [10, 100]\n// Math.Multiply with Cross Product lacing:\n// → [10, 100, 20, 200, 30, 300] (all 6 combinations)',
      },
      {
        title: 'List Levels (@L1, @L2)',
        body: 'List levels let you target a specific nesting depth without flattening first. <code>@L1</code> processes items one level deep (the default); <code>@L2</code> processes items two levels deep, treating each sub-list as a unit. This is powerful when you have a list of rows (each row a list of points) and you want to, for example, join each row into a curve independently rather than joining all points into one curve. Right-click a port and select the list level to use.',
      },
    ],
    quiz: [
      {
        q: 'What is "lacing" in Nova?',
        options: [
          'Removing duplicate items from a list',
          'How a node handles inputs when they are lists of different sizes',
          'Connecting two nodes together with a wire',
          'Sorting a list alphabetically before processing',
        ],
        answer: 1,
        explanation: 'Lacing determines the matching strategy when a node receives lists of different lengths — Shortest, Longest, or Cross Product.',
      },
      {
        q: 'Cross Product lacing on two lists of 3 items each produces how many output items?',
        options: [
          '3',
          '6',
          '9',
          '2',
        ],
        answer: 2,
        explanation: 'Cross Product combines every item in list A with every item in list B: 3 × 3 = 9 results.',
      },
    ],
  },

  // ── 8. Python Node ──────────────────────────────────────────────────────────
  {
    id: 'python',
    title: 'Python Node',
    icon: '🐍',
    intro: 'The <strong>Custom.Python</strong> node gives you a full Python 3 environment (powered by Pyodide) when the built-in nodes are not enough. Write arbitrary Python, import libraries, and return any value as an output.',
    sections: [
      {
        title: 'Writing Python in Nova',
        body: 'Open the Python node and write your script in the code control. The input port names (<code>elements</code>, <code>options</code>) become Python variables with the same names. Set the variable <code>result</code> to whatever you want to export. You can import standard library modules (<code>import math</code>, <code>import json</code>, etc.) and Nova\'s bundled geometry helpers.',
        code: '# Compute the circumference of each radius in a list\nimport math\nresult = [2 * math.pi * r for r in elements]',
      },
      {
        title: 'Input and Output Ports',
        body: 'By default the Python node has two inputs: <code>elements</code> (typically a list of items to process) and <code>options</code> (a dict or single value for configuration). You set <code>result</code> to produce the single output. If you need multiple outputs, assign a dict to <code>result</code> and unpack it downstream — or split the output list using <strong>List.GetItem</strong> nodes.',
      },
      {
        title: 'Using RevitBridge',
        body: 'When Nova Connect is running and paired with Revit, the global <code>RevitBridge</code> object is available in every Python node. Common methods: <code>RevitBridge.getSelection()</code> returns the currently selected Revit elements as dicts; <code>RevitBridge.getElements(category)</code> fetches all elements of a given category; <code>RevitBridge.getParameter(element, name)</code> reads a parameter value by name. These calls are synchronous in the Nova runtime.',
        code: '# Get the selected walls and read their widths\nwalls = elements or RevitBridge.getSelection()\nresult = [RevitBridge.getParameter(w, "Width") for w in walls if w]',
      },
      {
        title: 'Error Handling',
        body: 'If your Python code raises an exception, the node output is set to <code>undefined</code> and a red warning badge appears on the node. Click the warning to see the traceback. Wrap risky code in <code>try/except</code> blocks to return a fallback value instead of crashing the downstream graph. Long-running computations will block the engine — keep Python nodes fast; offload heavy work to separate calls or cache results in <code>options</code>.',
      },
    ],
    quiz: [
      {
        q: 'In the Custom.Python node, how do you export a value as an output?',
        options: [
          'Call print(value) at the end of the script',
          'Use return value like a function',
          'Assign to the variable named result',
          'Write output = value on the last line',
        ],
        answer: 2,
        explanation: 'Nova reads the Python local scope after execution. Setting `result = <value>` makes that value available on the node\'s output port.',
      },
      {
        q: 'What is RevitBridge?',
        options: [
          'A Python module bundled with Nova for geometry construction',
          'A global object providing access to Revit data when Nova Connect is active',
          'A REST API endpoint for uploading project files',
          'A math utility library for unit conversions',
        ],
        answer: 1,
        explanation: 'RevitBridge is injected into every Python node\'s scope when Nova Connect is paired with a running Revit session. It provides synchronous helpers like getSelection() and getElements().',
      },
    ],
  },

  // ── 9. Code Terminal ────────────────────────────────────────────────────────
  {
    id: 'code-terminal',
    title: 'Code Terminal',
    icon: '>_',
    intro: 'The Code Terminal is a JavaScript console embedded in Nova that gives advanced users direct access to the graph API. It is a developer tool, not a node — nothing you type here becomes part of the saved graph.',
    sections: [
      {
        title: 'Opening the Terminal',
        body: 'Open the Code Terminal from the Help menu or via the keyboard shortcut. The terminal accepts JavaScript expressions and statements. Hit Enter to execute a single line; use Shift+Enter to write multi-line scripts. The terminal retains history for the current session — press ↑ to recall previous commands.',
      },
      {
        title: 'Accessing the Graph',
        body: 'The global <code>app</code> object exposes the full Nova API. Key properties: <code>app.nodes</code> — the array of all nodes on the current canvas; <code>app.wires</code> — all connections; <code>app.graph</code> — the live graph model. You can inspect any node\'s current state by finding it in <code>app.nodes</code> and reading its <code>controlValues</code> or <code>outputCache</code> properties.',
        code: '// Print every node type on the canvas\napp.nodes.map(n => n.type)',
      },
      {
        title: 'Creating Nodes Programmatically',
        body: 'You can automate the canvas from the terminal. <code>app.addNodeToCanvas(type, x, y)</code> drops a node and returns the node object. <code>app.connectNodes(fromId, fromPort, toId, toPort)</code> wires two ports. <code>app.deleteNode(id)</code> removes a node and its wires. This is useful for quickly building repetitive structures or for testing graph shapes from scripts.',
        code: '// Add 5 Math.Add nodes in a column\nfor(let i=0; i<5; i++) app.addNodeToCanvas("Math.Add", 200, i*80);',
      },
      {
        title: 'Inspecting Values',
        body: 'To read the computed output of a node, find it by id or type: <code>app.nodes.find(n => n.type === "Output.Watch")</code>. Then call <code>app.computeNodeValue(node)</code> to get the resolved output. This is the same call the inspector uses. It is synchronous for most nodes, but geometry computation may be deferred.',
      },
    ],
    quiz: [
      {
        q: 'What language does the Code Terminal execute?',
        options: [
          'Python 3',
          'TypeScript',
          'JavaScript',
          'Lua',
        ],
        answer: 2,
        explanation: 'The Code Terminal is a JavaScript REPL. It has access to the browser environment and the Nova `app` object.',
      },
    ],
  },

  // ── 10. Code Block ──────────────────────────────────────────────────────────
  {
    id: 'codeblock',
    title: 'Code Block',
    icon: '{}',
    intro: 'The <strong>Custom.CodeBlock</strong> node lets you write inline expressions with a lightweight JavaScript DSL. It is faster to set up than a full Python node for simple math and series generation.',
    sections: [
      {
        title: 'Expression Syntax',
        body: 'Each line in a Code Block is either a plain expression or an assignment. No <code>function</code> keyword, no semicolons, no <code>return</code>. You get a mini-calculator that produces one or more named output ports. Math functions like <code>sin</code>, <code>cos</code>, <code>sqrt</code>, <code>floor</code>, <code>ceil</code> work without a <code>Math.</code> prefix. Constants <code>PI</code>, <code>pi</code>, <code>E</code> are available. Use <code>^</code> for exponentiation (<code>x^2</code> = x²).',
      },
      {
        title: 'Assignment → Output Port',
        body: 'Write <code>name = expression</code> to create a named output port. The left-hand side becomes the port name; the right-hand side is the computed value. You can have as many assignments as you like — each one adds an output port.\n\nExamples:\n<code>area = width * height</code> → output port "area"\n<code>diagonal = sqrt(width^2 + height^2)</code> → output port "diagonal"',
        code: 'area = width * height\nperimeter = 2 * (width + height)\ndiagonal = sqrt(width^2 + height^2)',
      },
      {
        title: 'Input Variables → Input Ports',
        body: 'Any variable you read without defining first becomes an input port on the node. In the example above, <code>width</code> and <code>height</code> are free variables — Nova creates input ports named <code>width</code> and <code>height</code> automatically. Connect upstream nodes to these ports, or set them via the inline control. There is no explicit port declaration; the ports derive directly from the code.',
      },
      {
        title: 'Series Shorthand',
        body: 'A series expression generates a list of numbers:\n<code>nums = 0..10</code> → [0, 1, 2, …, 10] (integer steps)\n<code>evens = 0..2..10</code> → [0, 2, 4, 6, 8, 10] (step = 2)\n<code>pts = 0..1..#5</code> → [0, 0.25, 0.5, 0.75, 1.0] (#N = N evenly-spaced values)\n\nSeries are perfect for driving repeated geometry — e.g. connect <code>angles = 0..360..#12</code> into <code>Math.Radians</code> to generate 12 evenly-distributed angles for a circle.',
        code: 'angles = 0..360..#12\nscales = 0..1..#5\nindices = 0..n',
      },
      {
        title: 'Boolean Outputs for 0 and 1',
        body: 'When a Code Block line evaluates to exactly <code>0</code> or <code>1</code>, Nova automatically creates a companion boolean output port: writing <code>1</code> gives you both a numeric <code>1</code> port and a <code>1_bool = true</code> port; writing <code>0</code> gives a <code>0</code> port and a <code>0_bool = false</code> port. This lets you feed the same literal directly into both numeric and boolean-gated downstream nodes without an extra conversion step.',
      },
      {
        title: 'Math Functions Reference',
        body: 'Available without prefix: <code>sin cos tan asin acos atan atan2 sqrt cbrt abs floor ceil round trunc log log2 log10 exp pow hypot sign min max</code>.\nAngle helpers: <code>deg(radians)</code> → degrees; <code>rad(degrees)</code> → radians.\nArray helper: <code>len(list)</code> → length of a list or string.\nConstants: <code>PI pi E e</code>.',
        code: '// Circle of n points at radius r\nx = r * cos(rad(angle))\ny = r * sin(rad(angle))\ndist = sqrt(x^2 + y^2)',
      },
    ],
    quiz: [
      {
        q: 'In a Code Block, what does writing `result = x * 2` produce?',
        options: [
          'A list named "result" containing x copies of 2',
          'An output port "result" with value x×2, and an input port "x"',
          'A variable stored in browser memory between sessions',
          'A Python comment — the line is ignored',
        ],
        answer: 1,
        explanation: 'Assignments create output ports; free variables become input ports. `result = x * 2` gives output port "result" and input port "x".',
      },
      {
        q: 'What does `nums = 0..10` produce in a Code Block?',
        options: [
          'The single number 10',
          'The decimal number 0.10',
          'A list: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]',
          'A syntax error — the .. operator is not supported',
        ],
        answer: 2,
        explanation: 'The series shorthand 0..10 expands to [0,1,2,...,10] — 11 items. Use 0..2..10 to step by 2, or 0..1..#5 for exactly 5 evenly-spaced values.',
      },
    ],
  },
];

// ── Chapter example data ──────────────────────────────────────────────────────
// Added as a post-definition pass so the large chapter objects stay readable.
// Each entry: { chapterIndex, simpleExample, advancedExample }
// Each example: { title, steps: string[], svg: string }
// SVGs are generated by nodeDiagramSvg() which is defined just below.

// We need SVG generation before this data block — so examples are attached in
// _attachChapterExamples(), called at module initialisation after nodeDiagramSvg
// is defined.

function _attachChapterExamples() {
  const ex = [
    // 0 — Introduction
    {
      simpleExample: {
        title: 'Your first graph: double a number',
        steps: [
          'Add an <strong>Input.Number</strong> node (set its value to <code>5</code>).',
          'Add a <strong>Math.Multiply</strong> node.',
          'Wire the <em>value</em> output of Input.Number to the <em>a</em> input of Math.Multiply.',
          'Set the <em>b</em> control on Math.Multiply to <code>2</code>.',
          'Add an <strong>Output.Watch</strong> node and wire Math.Multiply\'s <em>result</em> to it.',
          'The Watch shows <code>10</code>. Change the number to <code>7</code> — it instantly shows <code>14</code>.',
        ],
        svg: null, // filled by _attachChapterExamples after SVG helper is defined
        _svgLabels: ['Input.Number', 'Math.Multiply', 'Output.Watch'],
        _svgFocal: 'Math.Multiply',
      },
      advancedExample: {
        title: 'Parametric tower: floors drive total height',
        steps: [
          'Add <strong>Input.Number</strong> (floors = <code>10</code>) and another <strong>Input.Number</strong> (floorHeight = <code>3</code>).',
          'Add <strong>Math.Multiply</strong> and wire both inputs: floors → a, floorHeight → b.',
          'Add <strong>Input.Number</strong> (footprint = <code>20</code>).',
          'Add <strong>Math.Multiply</strong> to compute <em>volume = totalHeight × footprint</em>.',
          'Wire the first Multiply\'s <em>result</em> to the second\'s <em>a</em> input; footprint to <em>b</em>.',
          'Add <strong>Output.Watch</strong> to inspect volume. Change floors to <code>15</code> — volume updates immediately.',
        ],
        svg: null,
        _svgLabels: ['Input.Number ×3', 'Math.Multiply ×2', 'Output.Watch'],
        _svgFocal: 'Math.Multiply ×2',
      },
    },
    // 1 — Interface
    {
      simpleExample: {
        title: 'Explore the inspector: trace a value',
        steps: [
          'Add a <strong>Math.Add</strong> node. Set <em>a</em> to <code>4</code> and <em>b</em> to <code>6</code>.',
          'Add an <strong>Output.Watch</strong> and wire Add\'s <em>result</em> to it.',
          'Click the Math.Add node — the <strong>Inspector Panel</strong> opens on the right.',
          'Inspect the port values: you should see <em>a=4</em>, <em>b=6</em>, <em>result=10</em>.',
          'Change <em>a</em> to <code>3.5</code>. The inspector updates live to show <em>result=9.5</em>.',
        ],
        svg: null,
        _svgLabels: ['Math.Add', 'Output.Watch'],
        _svgFocal: 'Math.Add',
      },
      advancedExample: {
        title: 'Use Auto vs Manual mode with a heavy graph',
        steps: [
          'Switch the toolbar to <strong>Manual</strong> mode.',
          'Add an <strong>Input.Number</strong> (n = <code>100</code>), a <strong>List.Range</strong>, and an <strong>Output.Watch</strong>.',
          'Wire: Input.Number → List.Range\'s <em>end</em> input; List.Range\'s <em>list</em> → Watch.',
          'Notice that changing <em>n</em> does <em>not</em> trigger a recalculation — the graph waits.',
          'Press the ▶ <strong>Run</strong> button in the toolbar. The Watch shows the list of 100 numbers.',
          'Switch back to <strong>Auto</strong> — now every value change re-runs instantly.',
        ],
        svg: null,
        _svgLabels: ['Input.Number', 'List.Range', 'Output.Watch'],
        _svgFocal: 'List.Range',
      },
    },
    // 2 — Node Anatomy
    {
      simpleExample: {
        title: 'Read every part of a node: Math.Add',
        steps: [
          'Add a <strong>Math.Add</strong> node to the canvas.',
          'Observe the coloured header bar — this is the <em>Math</em> category colour.',
          'Hover over the left port circles to see <em>a</em> and <em>b</em> labels.',
          'The right port circle is the <em>result</em> output.',
          'Type <code>7</code> in the <em>a</em> control and <code>3</code> in <em>b</em>.',
          'Add <strong>Output.Watch</strong> and wire result → Watch. Confirm it shows <code>10</code>.',
        ],
        svg: null,
        _svgLabels: ['Math.Add', 'Output.Watch'],
        _svgFocal: 'Math.Add',
      },
      advancedExample: {
        title: 'Override a control with an upstream wire',
        steps: [
          'Add <strong>Input.Slider</strong> (min=0, max=10, value=5) and a <strong>Math.Multiply</strong> node.',
          'Notice that Math.Multiply\'s <em>a</em> control shows a default number field.',
          'Wire the Slider\'s <em>value</em> output to the <em>a</em> input of Math.Multiply.',
          'Observe that the inline <em>a</em> control on the node is now greyed out — the wire overrides it.',
          'Set <em>b</em> control to <code>3</code>. Drag the slider and watch the output triple the slider value live.',
          'Disconnect the wire. The control becomes editable again — confirming the control/wire priority rule.',
        ],
        svg: null,
        _svgLabels: ['Input.Slider', 'Math.Multiply', 'Output.Watch'],
        _svgFocal: 'Math.Multiply',
      },
    },
    // 3 — Data Types
    {
      simpleExample: {
        title: 'String + Number in one graph',
        steps: [
          'Add an <strong>Input.String</strong> node and type <code>Hello</code>.',
          'Add an <strong>Input.Number</strong> node and set it to <code>42</code>.',
          'Add two <strong>Output.Watch</strong> nodes — one for each input.',
          'Wire Input.String → Watch 1, and Input.Number → Watch 2.',
          'Notice Watch 1 shows <code>"Hello"</code> (string) while Watch 2 shows <code>42</code> (number).',
          'Try wiring a string into a number port — you\'ll see a type-mismatch warning in the inspector.',
        ],
        svg: null,
        _svgLabels: ['Input.String', 'Output.Watch'],
        _svgFocal: 'Input.String',
      },
      advancedExample: {
        title: 'Boolean gate: filter a list',
        steps: [
          'Add <strong>List.Create</strong> with items <code>1, 2, 3, 4, 5</code>.',
          'Add <strong>Math.GreaterThan</strong> — set <em>b</em> to <code>2</code>.',
          'Wire List.Create\'s <em>list</em> → Math.GreaterThan\'s <em>a</em>. (Lacing applies the comparison to every item.)',
          'The output is a boolean list: <code>[false, false, true, true, true]</code>.',
          'Add <strong>List.Filter</strong>. Wire the original list to <em>list</em> and the boolean list to <em>mask</em>.',
          'Output: <code>[3, 4, 5]</code> — only values greater than 2 pass through.',
        ],
        svg: null,
        _svgLabels: ['List.Create', 'Math.GreaterThan', 'List.Filter'],
        _svgFocal: 'List.Filter',
      },
    },
    // 4 — Math Operations
    {
      simpleExample: {
        title: 'Compute the hypotenuse',
        steps: [
          'Add two <strong>Input.Number</strong> nodes: set one to <code>3</code> (a), one to <code>4</code> (b).',
          'Add two <strong>Math.Multiply</strong> nodes. Wire a → a×a, and b → b×b (set the second port to the same input).',
          'Add <strong>Math.Add</strong>. Wire both squares into it.',
          'Add <strong>Math.Sqrt</strong>. Wire the sum into it.',
          'Add <strong>Output.Watch</strong> and wire Sqrt\'s result. You see <code>5</code> — the 3-4-5 hypotenuse.',
        ],
        svg: null,
        _svgLabels: ['Input.Number ×2', 'Math.Multiply ×2', 'Math.Sqrt', 'Output.Watch'],
        _svgFocal: 'Math.Sqrt',
      },
      advancedExample: {
        title: 'Sine wave Y-coordinates for N points',
        steps: [
          'Add <strong>Input.Number</strong> (n = <code>24</code>) and <strong>List.Range</strong>.',
          'Wire n into List.Range\'s <em>count</em>; set start=<code>0</code>, end=<code>360</code>.',
          'Add <strong>Math.Radians</strong> and wire the angle list into it.',
          'Add <strong>Math.Sin</strong> and wire the radians list into it.',
          'Add <strong>Output.Watch</strong> to see the 24 sine values ranging from -1 to 1.',
          'Feed these values into a <strong>Geo.Point</strong> node with x = index/24, y = sin value to plot a sine curve.',
        ],
        svg: null,
        _svgLabels: ['List.Range', 'Math.Radians', 'Math.Sin', 'Output.Watch'],
        _svgFocal: 'Math.Sin',
      },
    },
    // 5 — Geometry Operations
    {
      simpleExample: {
        title: 'Draw a line between two points',
        steps: [
          'Add two <strong>Point.ByCoordinates</strong> nodes.',
          'Set the first to x=<code>0</code>, y=<code>0</code>, z=<code>0</code>.',
          'Set the second to x=<code>5</code>, y=<code>3</code>, z=<code>0</code>.',
          'Add <strong>Line.ByStartPointEndPoint</strong>.',
          'Wire point 1 → startPoint, point 2 → endPoint.',
          'The 3D viewport shows a white line. The inspector reports its length as <code>~5.83</code>.',
        ],
        svg: null,
        _svgLabels: ['Point.ByCoordinates ×2', 'Line.ByStartPoint', 'Output.Watch'],
        _svgFocal: 'Line.ByStartPoint',
      },
      advancedExample: {
        title: 'Extrude a rectangle into a box solid',
        steps: [
          'Add four <strong>Point.ByCoordinates</strong> nodes at (0,0,0), (4,0,0), (4,3,0), (0,3,0).',
          'Add <strong>List.Create</strong> — wire all four points as items.',
          'Add <strong>PolyCurve.ByPoints</strong> (closed = true) to form a rectangle.',
          'Add <strong>Vector.ByCoordinates</strong> (0, 0, 5) for the extrusion direction.',
          'Add <strong>Solid.Extrude</strong>. Wire the closed curve → profile, vector → direction.',
          'The viewport shows a 4×3×5 box. Adjust any coordinate to update the solid live.',
        ],
        svg: null,
        _svgLabels: ['Point.ByCoordinates ×4', 'PolyCurve.ByPoints', 'Solid.Extrude'],
        _svgFocal: 'Solid.Extrude',
      },
    },
    // 6 — List Operations
    {
      simpleExample: {
        title: 'Reverse a list of numbers',
        steps: [
          'Add <strong>List.Create</strong> with three inputs: <code>10</code>, <code>20</code>, <code>30</code>.',
          'Add <strong>List.Reverse</strong>.',
          'Wire List.Create\'s <em>list</em> → List.Reverse.',
          'Add <strong>Output.Watch</strong> and wire List.Reverse\'s result.',
          'The Watch shows <code>[30, 20, 10]</code> — the list in reverse order.',
        ],
        svg: null,
        _svgLabels: ['List.Create', 'List.Reverse', 'Output.Watch'],
        _svgFocal: 'List.Reverse',
      },
      advancedExample: {
        title: 'Cross-product grid of points',
        steps: [
          'Add two <strong>List.Range</strong> nodes: one for X (0–4, step 1), one for Y (0–3, step 1).',
          'Add a <strong>Point.ByCoordinates</strong> node.',
          'Wire X range → x input, Y range → y input.',
          'Right-click Point.ByCoordinates and set lacing to <strong>Cross Product</strong>.',
          'The node now produces 5×4=20 points covering the full grid.',
          'Connect to <strong>Output.Watch</strong> to inspect. The viewport renders all 20 points as dots.',
        ],
        svg: null,
        _svgLabels: ['List.Range ×2', 'Point.ByCoordinates', 'Output.Watch'],
        _svgFocal: 'Point.ByCoordinates',
      },
    },
    // 7 — Python Node
    {
      simpleExample: {
        title: 'Square every number in a list',
        steps: [
          'Add a <strong>Custom.Python</strong> node and open its code editor.',
          'Write: <code>result = [x**2 for x in elements]</code>',
          'Add <strong>List.Create</strong> with items <code>1, 2, 3, 4, 5</code>.',
          'Wire List.Create\'s <em>list</em> → Python\'s <em>elements</em> input.',
          'Add <strong>Output.Watch</strong> and wire Python\'s <em>result</em> to it.',
          'The Watch shows <code>[1, 4, 9, 16, 25]</code>.',
        ],
        svg: null,
        _svgLabels: ['List.Create', 'Custom.Python', 'Output.Watch'],
        _svgFocal: 'Custom.Python',
      },
      advancedExample: {
        title: 'Read Revit wall widths via RevitBridge',
        steps: [
          'Ensure Nova Connect is running and paired with your Revit session.',
          'Add a <strong>Custom.Python</strong> node. Write:\n<code>walls = RevitBridge.getElements("Walls")\nresult = [RevitBridge.getParameter(w, "Width") for w in walls if w]</code>',
          'Add <strong>Output.Watch</strong> and wire Python\'s <em>result</em> to it.',
          'Run the graph. The Watch shows a list of wall widths from the active Revit model.',
          'Feed the widths into <strong>Math.Max</strong> to find the thickest wall.',
        ],
        svg: null,
        _svgLabels: ['Custom.Python', 'Math.Max', 'Output.Watch'],
        _svgFocal: 'Custom.Python',
      },
    },
    // 8 — Code Terminal
    {
      simpleExample: {
        title: 'List all node types on the canvas',
        steps: [
          'Open the Code Terminal (Help menu or keyboard shortcut).',
          'Type: <code>app.nodes.map(n => n.type)</code> and press Enter.',
          'The terminal logs an array of all node type strings on the canvas.',
          'Try: <code>app.nodes.length</code> to see how many nodes exist.',
          'This is read-only — nothing on the canvas changes.',
        ],
        svg: null,
        _svgLabels: ['Code Terminal', 'app.nodes', 'result[]'],
        _svgFocal: 'Code Terminal',
      },
      advancedExample: {
        title: 'Programmatically add 5 Math.Add nodes in a column',
        steps: [
          'Open the Code Terminal.',
          'Type the following and press Enter:\n<code>for(let i=0;i<5;i++) app.addNodeToCanvas("Math.Add",200,i*80);</code>',
          'Five <strong>Math.Add</strong> nodes appear on the canvas in a vertical column.',
          'Now wire the first to the second: find the node IDs with <code>app.nodes.slice(-5).map(n=>n.id)</code>.',
          'Use <code>app.connectNodes(id1, "result", id2, "a")</code> to wire them programmatically.',
          'Run the graph (if in Manual mode) to compute the chain.',
        ],
        svg: null,
        _svgLabels: ['Code Terminal', 'app.addNodeToCanvas', 'Math.Add ×5'],
        _svgFocal: 'app.addNodeToCanvas',
      },
    },
    // 9 — Code Block
    {
      simpleExample: {
        title: 'Rectangle area and diagonal from width and height',
        steps: [
          'Add a <strong>Custom.CodeBlock</strong> node and type:\n<code>area = width * height\ndiagonal = sqrt(width^2 + height^2)</code>',
          'Two output ports (<em>area</em> and <em>diagonal</em>) appear on the right; two input ports (<em>width</em>, <em>height</em>) appear on the left.',
          'Set width = <code>3</code> and height = <code>4</code> via the inline controls.',
          'Add two <strong>Output.Watch</strong> nodes — wire <em>area</em> and <em>diagonal</em> to each.',
          'Confirm: area = <code>12</code>, diagonal = <code>5</code>.',
        ],
        svg: null,
        _svgLabels: ['Custom.CodeBlock', 'Output.Watch ×2'],
        _svgFocal: 'Custom.CodeBlock',
      },
      advancedExample: {
        title: 'Generate a circle of 24 points using series shorthand',
        steps: [
          'Add a <strong>Custom.CodeBlock</strong> and type:\n<code>angles = 0..360..#24\nxs = r * cos(rad(angles))\nys = r * sin(rad(angles))</code>',
          'An input port <em>r</em> appears. Set r = <code>5</code>.',
          'Wire <em>xs</em> and <em>ys</em> to a <strong>Point.ByCoordinates</strong> node (x → xs, y → ys).',
          'The viewport renders 24 evenly-distributed points around a circle of radius 5.',
          'Change <em>r</em> to <code>10</code> — the circle doubles instantly.',
          'Add <strong>PolyCurve.ByPoints</strong> (closed=true) to connect the dots into a closed polygon.',
        ],
        svg: null,
        _svgLabels: ['Custom.CodeBlock', 'Point.ByCoordinates', 'PolyCurve.ByPoints'],
        _svgFocal: 'Custom.CodeBlock',
      },
    },
  ];

  ex.forEach(function (data, i) {
    if (!data) return;
    if (data.simpleExample) {
      data.simpleExample.svg = nodeDiagramSvg(data.simpleExample._svgLabels, data.simpleExample._svgFocal);
      LEARNING_CHAPTERS[i].simpleExample = data.simpleExample;
    }
    if (data.advancedExample) {
      data.advancedExample.svg = nodeDiagramSvg(data.advancedExample._svgLabels, data.advancedExample._svgFocal);
      LEARNING_CHAPTERS[i].advancedExample = data.advancedExample;
    }
  });
}

// ── Example SVG helpers ───────────────────────────────────────────────────────

/**
 * Build a simple node-graph SVG showing up to 4 nodes in a left→right chain.
 * Each node is a labelled rectangle; wires are horizontal lines between them.
 *
 * @param {string[]} labels  Node labels, left to right
 * @param {string}   [highlight]  Label of the "focal" node to highlight
 * @returns {string} inline SVG markup
 */
function nodeDiagramSvg(labels, highlight) {
  const nw = 100; // node width
  const nh = 36;  // node height
  const gap = 40; // gap between nodes
  const py = 24;  // vertical padding
  const count = labels.length;
  const totalW = count * nw + (count - 1) * gap + 2 * 20;
  const totalH = nh + 2 * py;

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + totalW + '" height="' + totalH
    + '" viewBox="0 0 ' + totalW + ' ' + totalH + '" role="img" aria-label="Node graph diagram">';

  // Draw wires first (behind nodes)
  for (let i = 0; i < count - 1; i++) {
    const x1 = 20 + i * (nw + gap) + nw;
    const x2 = 20 + (i + 1) * (nw + gap);
    const y = py + nh / 2;
    svg += '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y
      + '" stroke="#585b70" stroke-width="2"/>'
      // Port dot on right
      + '<circle cx="' + x1 + '" cy="' + y + '" r="4" fill="#89b4fa"/>'
      // Port dot on left
      + '<circle cx="' + x2 + '" cy="' + y + '" r="4" fill="#89b4fa"/>';
  }

  // Draw nodes
  labels.forEach(function (label, i) {
    const x = 20 + i * (nw + gap);
    const y = py;
    const isFocal = label === highlight;
    const fill = isFocal ? '#313244' : '#1e1e2e';
    const stroke = isFocal ? '#89b4fa' : '#45475a';
    const strokeW = isFocal ? 2 : 1;
    // Header bar
    const headerFill = isFocal ? '#1e66f5' : '#45475a';
    svg += '<rect x="' + x + '" y="' + y + '" width="' + nw + '" height="' + nh
      + '" rx="4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeW + '"/>'
      + '<rect x="' + x + '" y="' + y + '" width="' + nw + '" height="12" rx="4" fill="' + headerFill + '"/>'
      + '<rect x="' + x + '" y="' + (y + 8) + '" width="' + nw + '" height="4" fill="' + headerFill + '"/>'
      + '<text x="' + (x + nw / 2) + '" y="' + (y + nh / 2 + 6) + '"'
      + ' text-anchor="middle" font-size="10" fill="#cdd6f4" font-family="monospace">'
      + esc(label) + '</text>';
  });

  svg += '</svg>';
  return svg;
}

// Attach examples now that nodeDiagramSvg is defined.
_attachChapterExamples();

// ── Render helpers ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildNavHtml(currentIdx) {
  let html = '<div class="learn-nav-header">'
    + '<span class="learn-nav-brand">Nova Primer</span>'
    + '<button class="learn-close" aria-label="Close" onclick="app.closeLearning()">&times;</button>'
    + '</div>'
    + '<nav class="learn-nav-list" aria-label="Chapters">';

  LEARNING_CHAPTERS.forEach(function (ch, i) {
    const done = _isChapterDone(i);
    const active = i === currentIdx;
    let cls = 'learn-nav-ch';
    if (active) cls += ' active';
    if (done && !active) cls += ' done';
    html += '<button class="' + cls + '" onclick="__learnGo(' + i + ')" aria-current="' + (active ? 'page' : 'false') + '">'
      + '<span class="learn-nav-ch-icon">' + esc(ch.icon) + '</span>'
      + '<span class="learn-nav-ch-title">' + esc(ch.title) + '</span>'
      + (done ? '<span class="learn-nav-ch-check" aria-label="Completed">✓</span>' : '')
      + '</button>';
  });

  html += '</nav>';
  return html;
}

function buildChapterHtml(ch, chIdx) {
  let html = '<div class="learn-ch-header">'
    + '<span class="learn-ch-num">Chapter ' + (chIdx + 1) + '</span>'
    + '<h1 class="learn-ch-title">' + esc(ch.title) + '</h1>'
    + '<p class="learn-ch-intro">' + ch.intro + '</p>'
    + '</div>';

  ch.sections.forEach(function (sec) {
    html += '<div class="learn-section">'
      + '<h2 class="learn-section-title">' + esc(sec.title) + '</h2>'
      + '<p class="learn-section-body">' + sec.body + '</p>';
    if (sec.code) {
      html += '<pre class="learn-code-block"><code>' + esc(sec.code) + '</code></pre>';
    }
    html += '</div>';
  });

  // ── Examples (simple + advanced) ────────────────────────────────────────────
  if (ch.simpleExample || ch.advancedExample) {
    html += '<div class="learn-examples">'
      + '<h2 class="learn-examples-heading">Try It</h2>';

    [ch.simpleExample, ch.advancedExample].forEach(function (ex, exIdx) {
      if (!ex) return;
      const levelLabel = exIdx === 0 ? 'Simple' : 'Advanced';
      html += '<div class="learn-example learn-example--' + (exIdx === 0 ? 'simple' : 'advanced') + '">'
        + '<h3 class="learn-example-title">'
        + '<span class="learn-example-badge">' + levelLabel + '</span> '
        + esc(ex.title)
        + '</h3>';

      if (ex.svg) {
        html += '<div class="learn-example-diagram" aria-hidden="true">' + ex.svg + '</div>';
      }

      if (ex.steps && ex.steps.length > 0) {
        html += '<ol class="learn-example-steps">';
        ex.steps.forEach(function (step) {
          html += '<li class="learn-example-step">' + step + '</li>';
        });
        html += '</ol>';
      }

      html += '</div>';
    });

    html += '</div>';
  }

  if (ch.quiz && ch.quiz.length > 0) {
    html += '<div class="learn-quiz">'
      + '<h2 class="learn-quiz-heading">Check Your Understanding</h2>';

    ch.quiz.forEach(function (q, qi) {
      const answered = _learnDone[chIdx] && _learnDone[chIdx][qi];
      html += '<div class="learn-quiz-q" id="lq-' + chIdx + '-' + qi + '">'
        + '<p class="learn-quiz-question"><span class="learn-quiz-qnum">Q' + (qi + 1) + '</span> ' + esc(q.q) + '</p>'
        + '<div class="learn-quiz-options">';

      q.options.forEach(function (opt, oi) {
        let cls = 'learn-quiz-opt';
        if (answered) {
          if (oi === q.answer) cls += ' correct';
          else cls += ' disabled';
        }
        const clickAttr = answered ? '' : ' onclick="__learnAnswer(' + chIdx + ',' + qi + ',' + oi + ')"';
        html += '<button class="' + cls + '"' + clickAttr + '>' + esc(opt) + '</button>';
      });

      html += '</div>';
      if (answered) {
        html += '<p class="learn-quiz-feedback correct"><span class="learn-quiz-tick">✓</span> Correct! ' + esc(q.explanation) + '</p>';
      } else {
        html += '<p class="learn-quiz-feedback" id="lqf-' + chIdx + '-' + qi + '"></p>';
      }
      html += '</div>';
    });

    html += '</div>';
  }

  // Navigation buttons
  const allDone = _isChapterDone(chIdx);
  const isFirst = chIdx === 0;
  const isLast = chIdx === LEARNING_CHAPTERS.length - 1;

  html += '<div class="learn-ch-nav">';
  if (!isFirst) {
    html += '<button class="learn-nav-btn learn-nav-btn--prev" onclick="__learnGo(' + (chIdx - 1) + ')">← Previous</button>';
  } else {
    html += '<span></span>';
  }
  if (!isLast) {
    const nextDisabled = !allDone ? ' disabled title="Answer all quiz questions to continue"' : '';
    html += '<button class="learn-nav-btn learn-nav-btn--next"' + nextDisabled + ' onclick="__learnGo(' + (chIdx + 1) + ')">Next Chapter →</button>';
  } else {
    // Last chapter: show finish actions
    html += '<div class="learn-finish-actions">'
      + '<button class="learn-btn learn-btn--primary" onclick="app.closeLearning();app.newProject()">Start a new project</button>'
      + '<button class="learn-btn learn-btn--ghost" onclick="app.closeLearning()">Close</button>'
      + '</div>';
  }
  html += '</div>';

  html += '<p class="learn-footer-fine">Curious about privacy? '
    + '<a href="#" class="learn-privacy-link" onclick="app.showLegal(\'privacy\');return false;">Data Privacy notice</a>.'
    + '</p>';

  return html;
}

function _isChapterDone(chIdx) {
  const ch = LEARNING_CHAPTERS[chIdx];
  if (!ch || !ch.quiz || ch.quiz.length === 0) return true;
  const done = _learnDone[chIdx] || {};
  return ch.quiz.every(function (_, qi) { return done[qi] === true; });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build the modal container HTML. Pure string builder — no DOM access — so it
 * is testable in jsdom and app.js can assign it to innerHTML directly.
 * Interactive content is wired up by initLearning() after DOM insertion.
 * @returns {string}
 */
export function buildLearningHtml() {
  return (
    '<div class="learn-panel" role="dialog" aria-modal="true" aria-label="Nova Learning">'
    + '<div class="learn-nav" id="learn-nav"></div>'
    + '<div class="learn-body" id="learn-scroll">'
    + '<div class="learn-chapter-content" id="learn-chapter-content"></div>'
    + '</div>'
    + '</div>'
  );
}

/**
 * Wire up chapter navigation and quiz interactivity after the overlay is in
 * the DOM. Must be called once per showLearning() invocation.
 * @param {Element} overlay  The #learning-overlay element
 */
export function initLearning(overlay) {
  // Reset state for fresh open
  _learnChapter = 0;
  _learnDone = {};

  // Expose global handler functions that onclick attributes reference.
  window.__learnGo = function (idx) {
    _learnChapter = Math.max(0, Math.min(idx, LEARNING_CHAPTERS.length - 1));
    _render(overlay);
    const scroll = overlay.querySelector('#learn-scroll');
    if (scroll) scroll.scrollTop = 0;
  };

  window.__learnAnswer = function (chIdx, qIdx, optIdx) {
    const ch = LEARNING_CHAPTERS[chIdx];
    if (!ch || !ch.quiz || !ch.quiz[qIdx]) return;
    const q = ch.quiz[qIdx];
    if (_learnDone[chIdx] && _learnDone[chIdx][qIdx]) return; // already answered

    if (optIdx === q.answer) {
      // Correct
      if (!_learnDone[chIdx]) _learnDone[chIdx] = {};
      _learnDone[chIdx][qIdx] = true;
      _render(overlay);
    } else {
      // Wrong — show hint, highlight wrong answer
      const qEl = overlay.querySelector('#lq-' + chIdx + '-' + qIdx);
      if (qEl) {
        const opts = qEl.querySelectorAll('.learn-quiz-opt');
        opts.forEach(function (btn, i) {
          btn.classList.remove('wrong');
          if (i === optIdx) btn.classList.add('wrong');
        });
        const fb = overlay.querySelector('#lqf-' + chIdx + '-' + qIdx);
        if (fb) {
          fb.textContent = '✗ Not quite — try again. Hint: ' + q.explanation;
          fb.className = 'learn-quiz-feedback wrong';
        }
      }
    }
  };

  _render(overlay);
}

function _render(overlay) {
  const nav = overlay.querySelector('#learn-nav');
  const content = overlay.querySelector('#learn-chapter-content');
  if (nav) nav.innerHTML = buildNavHtml(_learnChapter);
  if (content) content.innerHTML = buildChapterHtml(LEARNING_CHAPTERS[_learnChapter], _learnChapter);
}

/**
 * Backward-compatible no-op — screenshot slots are not used in the chapter
 * layout; kept so existing app.js calls don't need updating.
 * @param {Document} _doc
 */
export function attachLearningShots(_doc) {
  // no-op — new design uses prose + code blocks, not screenshot overlays
}

// Keep LEARNING_STEPS as a backward-compat alias so any remaining import
// that hasn't been updated yet doesn't hard-crash. Points at the chapters.
export const LEARNING_STEPS = LEARNING_CHAPTERS;
