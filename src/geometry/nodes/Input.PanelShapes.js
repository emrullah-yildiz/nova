/**
 * Input.PanelShapes — shape-source node (Input category)
 *
 * Supplies a premade unit panel shape chosen from a dropdown (Diagonal,
 * Rectangle, Square, Hexagon, Circle) as a single closed-curve output `Shape`.
 * The shape is a unit-sized closed Geo.Polyline3 centred on the origin (extent
 * ~[-0.5, 0.5]²), so it watches/wires like any other curve and feeds straight
 * into Surface.Panelize's `Shape` input.
 *
 * The shape geometry itself lives in src/geometry/panel-shapes.js (pure
 * builders); this file is only the node definition + the dropdown widget.
 *
 * Owned file: src/geometry/nodes/Input.PanelShapes.js
 * Owner: geometry-engineer (mouse) — TICK-014 / T14a
 */

import {
  PANEL_SHAPE_OPTIONS,
  DEFAULT_PANEL_SHAPE,
  panelShapeCurve
} from '../panel-shapes.js';

export const inputPanelShapesNode = {
  type: 'Input.PanelShapes',
  name: 'Input.PanelShapes',
  category: 'input',
  subGroup: 'Input',
  icon: '⬡',
  aliases: ['panel-shape', 'panel-shapes'],
  description: 'Supplies a premade unit panel shape from a dropdown (Diagonal, Rectangle, Square, Hexagon, Circle) as a single closed curve. The shape is unit-sized and centred on the origin — feed it into Surface.Panelize to clad a surface, or watch/wire it like any other closed curve.',
  inputs: [],
  outputs: [
    { id: 'shape', name: 'Shape', type: 'curve', description: 'Closed unit polygon/curve for the selected option, centred on the origin' }
  ],
  controls: [
    { id: 'shape', type: 'dropdown', options: PANEL_SHAPE_OPTIONS, default: DEFAULT_PANEL_SHAPE, label: 'Shape' }
  ],
  execute(context, inputs, controls) {
    const option = (controls && controls.shape) || DEFAULT_PANEL_SHAPE;
    return { shape: panelShapeCurve(option) };
  },
  codegen: {
    python: "{{shape}} = Geo.panelShape('{{ctrl.shape}}')",
    csharp: 'var {{shape}} = Geo.panelShape("{{ctrl.shape}}");'
  },
  help: {
    summary: 'Premade unit panel shape (Diagonal/Rectangle/Square/Hexagon/Circle) as a closed curve.',
    inputs: [],
    outputs: [{ name: 'Shape', description: 'Closed unit polygon for the selected option' }],
    example: {
      title: 'Square panel shape tiled across a patch — visible panels in Watch',
      nodes: [
        { type: 'Point.Origin', x: 0, y: 0 },
        { type: 'Input.Number', x: 0, y: 80, controls: { val: 5 } },
        { type: 'Circle.ByCenterRadius', x: 220, y: 30 },
        { type: 'Surface.ByPatch', x: 440, y: 30 },
        { type: 'Input.PanelShapes', x: 440, y: 150, controls: { shape: 'Square' } },
        { type: 'Surface.Panelize', x: 680, y: 70 },
        { type: 'Output.Watch', x: 900, y: 70 }
      ],
      wires: [
        [0, 'point', 2, 'center'],
        [1, 'value', 2, 'radius'],
        [2, 'circle', 3, 'boundary'],
        [3, 'surface', 5, 'surface'],
        [4, 'shape', 5, 'shape'],
        [5, 'panels', 6, 'value']
      ]
    },
    sampleCode: "{{shape}} = Geo.panelShape('{{ctrl.shape}}')"
  }
};
