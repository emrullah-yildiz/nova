import { Geo } from '../../geometry/index.js';

export const planeCategory = {
  id: 'plane',
  name: 'Plane',
  color: '#89dceb',
  icon: '▱'
};

function toPoint(value, fallback = new Geo.Point3(0, 0, 0)) {
  if (value && typeof value === 'object' && value.x !== undefined) return value;
  return fallback;
}
function toVector(value, fallback = new Geo.Vector3(0, 0, 1)) {
  if (value instanceof Geo.Vector3) return value;
  if (value && typeof value === 'object' && value.x !== undefined) {
    return new Geo.Vector3(value.x || 0, value.y || 0, value.z || 0);
  }
  return fallback;
}
function toPlane(value) {
  if (value && value._type === 'Plane') return value;
  if (value && value.origin && value.normal) {
    return new Geo.Plane(toPoint(value.origin), toVector(value.normal));
  }
  return new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1));
}

export const planeNodes = [
  // ─── Creation ────────────────────────────────────────────
  {
    type: 'Plane.ByOriginNormal',
    name: 'Plane.ByOriginNormal',
    category: 'plane',
    subGroup: 'Creation',
    icon: '▱',
    aliases: ['surf-plane', 'plane-byoriginnormal'],
    description: 'Creates an infinite Plane from an anchor point and a normal vector. The normal is internally normalised; use as a reference for Mirror, projection, intersection, and Surface.ByCoonsPatch operations.',
    inputs: [
      { id: 'origin', name: 'Origin', type: 'point', description: 'Anchor point on the plane' },
      { id: 'normal', name: 'Normal', type: 'vector', description: 'Plane normal vector (normalised internally)' }
    ],
    outputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Resulting plane geometry' }],
    controls: [],
    execute(context, inputs) {
      return { plane: new Geo.Plane(toPoint(inputs.origin), toVector(inputs.normal, new Geo.Vector3(0, 0, 1))) };
    },
    codegen: {
      python: '{{plane}} = Geo.Plane({{origin}}, {{normal}})',
      csharp: 'var {{plane}} = Geo.Plane({{origin}}, {{normal}});'
    },
    help: {
      inputs: [
        { name: 'Origin', description: 'Anchor point' },
        { name: 'Normal', description: 'Plane normal' }
      ],
      outputs: [{ name: 'Plane', description: 'Plane geometry' }],
      example: {
        title: 'XY plane at the origin — normal Z = 1',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Input.Number', x: 0, y: 80, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 150, controls: { val: 0 } },
          { type: 'Input.Number', x: 0, y: 220, controls: { val: 1 } },
          { type: 'Vector.ByCoordinates', x: 240, y: 150 },
          { type: 'Plane.ByOriginNormal', x: 460, y: 70 },
          { type: 'Plane.Normal', x: 660, y: 70 },
          { type: 'Vector.Deconstruct', x: 860, y: 70 },
          { type: 'Output.Watch', x: 1080, y: 70 }
        ],
        wires: [
          [0, 'point', 5, 'origin'],
          [1, 'value', 4, 'x'],
          [2, 'value', 4, 'y'],
          [3, 'value', 4, 'z'],
          [4, 'vector', 5, 'normal'],
          [5, 'plane', 6, 'plane'],
          [6, 'normal', 7, 'vector'],
          [7, 'z', 8, 'value']
        ]
      },
      sampleCode: '{{plane}} = Geo.Plane({{origin}}, {{normal}})'
    }
  },
  {
    type: 'Plane.ByThreePoints',
    name: 'Plane.ByThreePoints',
    category: 'plane',
    subGroup: 'Creation',
    icon: '△',
    aliases: ['plane-bythreepoints'],
    description: 'Builds a plane through three non-collinear points. Point A becomes the origin; the normal is the cross product (B − A) × (C − A), oriented by the right-hand rule and normalised to unit length.',
    inputs: [
      { id: 'a', name: 'A', type: 'point', description: 'First point (becomes the plane origin)' },
      { id: 'b', name: 'B', type: 'point', description: 'Second point' },
      { id: 'c', name: 'C', type: 'point', description: 'Third point (non-collinear with A and B)' }
    ],
    outputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Resulting plane geometry' }],
    controls: [],
    execute(context, inputs) {
      const a = toPoint(inputs.a);
      const b = toPoint(inputs.b, new Geo.Point3(1, 0, 0));
      const c = toPoint(inputs.c, new Geo.Point3(0, 1, 0));
      const ab = new Geo.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
      const ac = new Geo.Vector3(c.x - a.x, c.y - a.y, c.z - a.z);
      const normal = ab.cross(ac);
      if (normal.length() === 0) return { plane: undefined };
      return { plane: new Geo.Plane(a, normal.normalize()) };
    },
    codegen: {
      python: '_ab = Geo.Vector3({{b}}.x - {{a}}.x, {{b}}.y - {{a}}.y, {{b}}.z - {{a}}.z)\n_ac = Geo.Vector3({{c}}.x - {{a}}.x, {{c}}.y - {{a}}.y, {{c}}.z - {{a}}.z)\n{{plane}} = Geo.Plane({{a}}, _ab.cross(_ac).normalize())',
      csharp: 'var _ab = Geo.Vector3({{b}}.X - {{a}}.X, {{b}}.Y - {{a}}.Y, {{b}}.Z - {{a}}.Z); var _ac = Geo.Vector3({{c}}.X - {{a}}.X, {{c}}.Y - {{a}}.Y, {{c}}.Z - {{a}}.Z); var {{plane}} = Geo.Plane({{a}}, _ab.cross(_ac).normalize());'
    },
    help: {
      inputs: [
        { name: 'A', description: 'First / origin point' },
        { name: 'B', description: 'Second point' },
        { name: 'C', description: 'Third point' }
      ],
      outputs: [{ name: 'Plane', description: 'Plane through A, B, C' }],
      example: {
        title: 'XY plane from (0,0,0), (1,0,0), (0,1,0) — normal Z = 1',
        nodes: [
          { type: 'Point.Origin', x: 0, y: 0 },
          { type: 'Point.ByCoordinates', x: 0, y: 80, controls: { x: 1, y: 0, z: 0 } },
          { type: 'Point.ByCoordinates', x: 0, y: 150, controls: { x: 0, y: 1, z: 0 } },
          { type: 'Plane.ByThreePoints', x: 280, y: 60 },
          { type: 'Plane.Normal', x: 500, y: 60 },
          { type: 'Vector.Deconstruct', x: 700, y: 60 },
          { type: 'Output.Watch', x: 920, y: 60 }
        ],
        wires: [
          [0, 'point', 3, 'a'],
          [1, 'point', 3, 'b'],
          [2, 'point', 3, 'c'],
          [3, 'plane', 4, 'plane'],
          [4, 'normal', 5, 'vector'],
          [5, 'z', 6, 'value']
        ]
      },
      sampleCode: '{{plane}} = Geo.Plane({{a}}, (({{b}} - {{a}}).cross({{c}} - {{a}})).normalize())'
    }
  },
  {
    type: 'Plane.XY',
    name: 'Plane.XY',
    category: 'plane',
    subGroup: 'Creation',
    icon: '⬓',
    aliases: ['plane-xy'],
    description: 'The world XY plane — origin at (0, 0, 0) with normal pointing along +Z. The canonical horizontal reference plane; ideal as a default for ground, floor and Mirror operations.',
    inputs: [],
    outputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'World XY plane' }],
    controls: [],
    execute() {
      return { plane: new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 0, 1)) };
    },
    codegen: {
      python: '{{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(0,0,1))',
      csharp: 'var {{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(0,0,1));'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Plane', description: 'XY world plane' }],
      example: {
        title: 'XY plane normal Z component = 1',
        nodes: [
          { type: 'Plane.XY', x: 0, y: 0 },
          { type: 'Plane.Normal', x: 220, y: 0 },
          { type: 'Vector.Deconstruct', x: 420, y: 0 },
          { type: 'Output.Watch', x: 640, y: 0 }
        ],
        wires: [
          [0, 'plane', 1, 'plane'],
          [1, 'normal', 2, 'vector'],
          [2, 'z', 3, 'value']
        ]
      },
      sampleCode: '{{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(0,0,1))'
    }
  },
  {
    type: 'Plane.XZ',
    name: 'Plane.XZ',
    category: 'plane',
    subGroup: 'Creation',
    icon: '◧',
    aliases: ['plane-xz'],
    description: 'The world XZ plane — origin at (0, 0, 0) with normal pointing along +Y. The canonical front-elevation reference plane; useful for sections and side-views.',
    inputs: [],
    outputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'World XZ plane' }],
    controls: [],
    execute() {
      return { plane: new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(0, 1, 0)) };
    },
    codegen: {
      python: '{{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(0,1,0))',
      csharp: 'var {{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(0,1,0));'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Plane', description: 'XZ world plane' }],
      example: {
        title: 'XZ plane normal Y component = 1',
        nodes: [
          { type: 'Plane.XZ', x: 0, y: 0 },
          { type: 'Plane.Normal', x: 220, y: 0 },
          { type: 'Vector.Deconstruct', x: 420, y: 0 },
          { type: 'Output.Watch', x: 640, y: 0 }
        ],
        wires: [
          [0, 'plane', 1, 'plane'],
          [1, 'normal', 2, 'vector'],
          [2, 'y', 3, 'value']
        ]
      },
      sampleCode: '{{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(0,1,0))'
    }
  },
  {
    type: 'Plane.YZ',
    name: 'Plane.YZ',
    category: 'plane',
    subGroup: 'Creation',
    icon: '◨',
    aliases: ['plane-yz'],
    description: 'The world YZ plane — origin at (0, 0, 0) with normal pointing along +X. The canonical side-elevation reference plane; useful for left/right symmetries and Mirror operations.',
    inputs: [],
    outputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'World YZ plane' }],
    controls: [],
    execute() {
      return { plane: new Geo.Plane(new Geo.Point3(0, 0, 0), new Geo.Vector3(1, 0, 0)) };
    },
    codegen: {
      python: '{{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(1,0,0))',
      csharp: 'var {{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(1,0,0));'
    },
    help: {
      inputs: [],
      outputs: [{ name: 'Plane', description: 'YZ world plane' }],
      example: {
        title: 'YZ plane normal X component = 1',
        nodes: [
          { type: 'Plane.YZ', x: 0, y: 0 },
          { type: 'Plane.Normal', x: 220, y: 0 },
          { type: 'Vector.Deconstruct', x: 420, y: 0 },
          { type: 'Output.Watch', x: 640, y: 0 }
        ],
        wires: [
          [0, 'plane', 1, 'plane'],
          [1, 'normal', 2, 'vector'],
          [2, 'x', 3, 'value']
        ]
      },
      sampleCode: '{{plane}} = Geo.Plane(Geo.Point3(0,0,0), Geo.Vector3(1,0,0))'
    }
  },

  // ─── Query ───────────────────────────────────────────────
  {
    type: 'Plane.Origin',
    name: 'Plane.Origin',
    category: 'plane',
    subGroup: 'Query',
    icon: '⊙',
    aliases: ['plane-origin'],
    description: 'Returns the anchor point of a plane — the point used to position the plane in space. Useful as a reference point for sketching, projection, and downstream geometry.',
    inputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Input plane' }],
    outputs: [{ id: 'origin', name: 'Origin', type: 'point', description: 'Anchor point of the plane' }],
    controls: [],
    execute(context, inputs) {
      return { origin: toPlane(inputs.plane).origin };
    },
    codegen: {
      python: '{{origin}} = {{plane}}.origin',
      csharp: 'var {{origin}} = {{plane}}.origin;'
    },
    help: {
      inputs: [{ name: 'Plane', description: 'Plane to inspect' }],
      outputs: [{ name: 'Origin', description: 'Anchor point' }],
      example: {
        title: 'XY plane origin X = 0',
        nodes: [
          { type: 'Plane.XY', x: 0, y: 0 },
          { type: 'Plane.Origin', x: 220, y: 0 },
          { type: 'Point.Deconstruct', x: 420, y: 0 },
          { type: 'Output.Watch', x: 640, y: 0 }
        ],
        wires: [
          [0, 'plane', 1, 'plane'],
          [1, 'origin', 2, 'point'],
          [2, 'x', 3, 'value']
        ]
      },
      sampleCode: '{{origin}} = {{plane}}.origin'
    }
  },
  {
    type: 'Plane.Normal',
    name: 'Plane.Normal',
    category: 'plane',
    subGroup: 'Query',
    icon: '⊥',
    aliases: ['plane-normal'],
    description: 'Returns the unit normal vector of a plane. The normal points away from the plane along its perpendicular direction; useful for projection, Mirror, and dot-product orientation checks.',
    inputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Input plane' }],
    outputs: [{ id: 'normal', name: 'Normal', type: 'vector', description: 'Unit normal of the plane' }],
    controls: [],
    execute(context, inputs) {
      return { normal: toPlane(inputs.plane).normal };
    },
    codegen: {
      python: '{{normal}} = {{plane}}.normal',
      csharp: 'var {{normal}} = {{plane}}.normal;'
    },
    help: {
      inputs: [{ name: 'Plane', description: 'Plane to inspect' }],
      outputs: [{ name: 'Normal', description: 'Plane normal' }],
      example: {
        title: 'XY plane normal length = 1',
        nodes: [
          { type: 'Plane.XY', x: 0, y: 0 },
          { type: 'Plane.Normal', x: 220, y: 0 },
          { type: 'Vector.Length', x: 420, y: 0 },
          { type: 'Output.Watch', x: 620, y: 0 }
        ],
        wires: [
          [0, 'plane', 1, 'plane'],
          [1, 'normal', 2, 'vector'],
          [2, 'length', 3, 'value']
        ]
      },
      sampleCode: '{{normal}} = {{plane}}.normal'
    }
  },
  {
    type: 'Plane.XAxis',
    name: 'Plane.XAxis',
    category: 'plane',
    subGroup: 'Query',
    icon: '→',
    aliases: ['plane-xaxis'],
    description: 'Returns the local X-axis (unit vector) of a plane. Together with Plane.YAxis and Plane.Normal forms a right-handed in-plane coordinate frame for parametric placement.',
    inputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Input plane' }],
    outputs: [{ id: 'xAxis', name: 'X Axis', type: 'vector', description: 'Local X axis of the plane' }],
    controls: [],
    execute(context, inputs) {
      return { xAxis: toPlane(inputs.plane).xAxis() };
    },
    codegen: {
      python: '{{xAxis}} = {{plane}}.xAxis()',
      csharp: 'var {{xAxis}} = {{plane}}.xAxis();'
    },
    help: {
      inputs: [{ name: 'Plane', description: 'Plane to inspect' }],
      outputs: [{ name: 'X Axis', description: 'Local X axis' }],
      example: {
        title: 'XY plane X-axis length = 1',
        nodes: [
          { type: 'Plane.XY', x: 0, y: 0 },
          { type: 'Plane.XAxis', x: 220, y: 0 },
          { type: 'Vector.Length', x: 420, y: 0 },
          { type: 'Output.Watch', x: 620, y: 0 }
        ],
        wires: [
          [0, 'plane', 1, 'plane'],
          [1, 'xAxis', 2, 'vector'],
          [2, 'length', 3, 'value']
        ]
      },
      sampleCode: '{{xAxis}} = {{plane}}.xAxis()'
    }
  },
  {
    type: 'Plane.YAxis',
    name: 'Plane.YAxis',
    category: 'plane',
    subGroup: 'Query',
    icon: '↑',
    aliases: ['plane-yaxis'],
    description: 'Returns the local Y-axis (unit vector) of a plane, computed as Normal × XAxis. Together with Plane.XAxis and Plane.Normal forms a right-handed in-plane coordinate frame.',
    inputs: [{ id: 'plane', name: 'Plane', type: 'plane', description: 'Input plane' }],
    outputs: [{ id: 'yAxis', name: 'Y Axis', type: 'vector', description: 'Local Y axis of the plane' }],
    controls: [],
    execute(context, inputs) {
      return { yAxis: toPlane(inputs.plane).yAxis() };
    },
    codegen: {
      python: '{{yAxis}} = {{plane}}.yAxis()',
      csharp: 'var {{yAxis}} = {{plane}}.yAxis();'
    },
    help: {
      inputs: [{ name: 'Plane', description: 'Plane to inspect' }],
      outputs: [{ name: 'Y Axis', description: 'Local Y axis' }],
      example: {
        title: 'XY plane Y-axis length = 1',
        nodes: [
          { type: 'Plane.XY', x: 0, y: 0 },
          { type: 'Plane.YAxis', x: 220, y: 0 },
          { type: 'Vector.Length', x: 420, y: 0 },
          { type: 'Output.Watch', x: 620, y: 0 }
        ],
        wires: [
          [0, 'plane', 1, 'plane'],
          [1, 'yAxis', 2, 'vector'],
          [2, 'length', 3, 'value']
        ]
      },
      sampleCode: '{{yAxis}} = {{plane}}.yAxis()'
    }
  }
];
