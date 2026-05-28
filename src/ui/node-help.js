function getRuntimeApp() {
  if (typeof window !== 'undefined' && window.app) return window.app;
  if (typeof globalThis !== 'undefined' && globalThis.app) return globalThis.app;
  return null;
}

function getRuntimeGlobal() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

// ============================================
// NODEFLOW AI — Node Help Data
// ============================================
export function installNodeHelp(targetApp = getRuntimeApp(), runtimeGlobal = getRuntimeGlobal()) {
  if (!targetApp) return false;
  if (targetApp.__nodeHelpInstalled) return true;
  targetApp.__nodeHelpInstalled = true;
  const app = targetApp;
  const window = runtimeGlobal;

window.NODE_HELP = {};

// ═══════════════════════════════════════
// CURVES
// ═══════════════════════════════════════

window.NODE_HELP['surf-arc'] = {
  description: 'Creates a circular arc from a center point, radius, and start/end angles in degrees. Useful for partial circles, rounded corners, and angular geometry.',
  inputs: [
    { name: 'Center', desc: 'Center point of the arc' },
    { name: 'Radius', desc: 'Distance from center to arc' },
    { name: 'Start°', desc: 'Start angle in degrees (0 = right)' },
    { name: 'End°', desc: 'End angle in degrees' }
  ],
  outputs: [{ name: 'Arc', desc: 'The resulting arc curve' }],
  example: { title: 'Quarter circle arc', nodes: [
    { type: 'point-bycoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
    { type: 'number-input', x: 0, y: 80, controls: { val: 5 } },
    { type: 'number-input', x: 0, y: 140, controls: { val: 0 } },
    { type: 'number-input', x: 0, y: 200, controls: { val: 90 } },
    { type: 'surf-arc', x: 280, y: 60 }
  ], wires: [[0,'point',4,'center'],[1,'value',4,'radius'],[2,'value',4,'startAngle'],[3,'value',4,'endAngle']] }
};

window.NODE_HELP['op-bezier'] = {
  description: 'Creates a smooth Bezier curve through a list of control points. The curve is pulled toward control points without necessarily passing through them (except endpoints).',
  inputs: [{ name: 'Control Pts', desc: 'List of Point3 control points' }],
  outputs: [{ name: 'Curve', desc: 'Smooth Bezier curve' }],
  example: { title: 'S-curve with 4 points', nodes: [
    { type: 'point-bycoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 80, controls: { x: 3, y: 5, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 160, controls: { x: 7, y: -5, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 240, controls: { x: 10, y: 0, z: 0 } },
    { type: 'list-create', x: 200, y: 80 },
    { type: 'op-bezier', x: 420, y: 80 }
  ], wires: [[0,'point',4,'item0'],[1,'point',4,'item1'],[2,'point',4,'item2'],[3,'point',4,'item3'],[4,'list',5,'points']] }
};

window.NODE_HELP['nurbs-blend'] = {
  description: 'Blends between two curves at parameter t. At t=0 you get Curve A, at t=1 Curve B, values between give a smooth intermediate.',
  inputs: [{ name: 'Curve A', desc: 'First curve' },{ name: 'Curve B', desc: 'Second curve' },{ name: 'Blend (0-1)', desc: '0=A, 1=B, 0.5=midpoint' }],
  outputs: [{ name: 'Curve', desc: 'Blended result curve' }],
  example: { title: 'Blend two lines at 50%', nodes: [
    { type: 'point-bycoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 70, controls: { x: 10, y: 0, z: 0 } },
    { type: 'line-bystartpointendpoint', x: 200, y: 0 },
    { type: 'point-bycoordinates', x: 0, y: 180, controls: { x: 0, y: 10, z: 5 } },
    { type: 'point-bycoordinates', x: 0, y: 250, controls: { x: 10, y: 10, z: 5 } },
    { type: 'line-bystartpointendpoint', x: 200, y: 180 },
    { type: 'number-input', x: 200, y: 300, controls: { val: 0.5 } },
    { type: 'nurbs-blend', x: 420, y: 100 }
  ], wires: [[0,'point',2,'startPoint'],[1,'point',2,'endPoint'],[3,'point',5,'startPoint'],[4,'point',5,'endPoint'],[2,'line',7,'curve1'],[5,'line',7,'curve2'],[6,'value',7,'t']] }
};

window.NODE_HELP['geo-circle'] = {
  description: 'Creates a full circle from a center point and radius. Use the Plane dropdown to control orientation (XY, XZ, YZ).',
  inputs: [{ name: 'Center', desc: 'Center point of the circle' },{ name: 'Radius', desc: 'Circle radius' }],
  outputs: [{ name: 'Circle', desc: 'Circle geometry' }],
  example: { title: 'Circle at origin, radius 5', nodes: [
    { type: 'point-origin', x: 0, y: 0 },
    { type: 'number-input', x: 0, y: 80, controls: { val: 5 } },
    { type: 'geo-circle', x: 240, y: 20 }
  ], wires: [[0,'point',2,'center'],[1,'value',2,'radius']] }
};

window.NODE_HELP['prof-circle'] = {
  description: 'Generates a circle as a list of points (polygon approximation). Outputs a point list suitable for Loft, Sweep, or Extrude. Control resolution for smoothness.',
  inputs: [{ name: 'Center', desc: 'Center point' },{ name: 'Radius', desc: 'Circle radius' },{ name: 'Resolution', desc: 'Number of points (higher = smoother)' }],
  outputs: [{ name: 'Profile', desc: 'List of Point3 forming the circle' }],
  example: { title: 'Circle profile, 32 segments', nodes: [
    { type: 'point-origin', x: 0, y: 0 },
    { type: 'number-input', x: 0, y: 70, controls: { val: 3 } },
    { type: 'number-input', x: 0, y: 130, controls: { val: 32 } },
    { type: 'prof-circle', x: 240, y: 20 }
  ], wires: [[0,'point',3,'center'],[1,'value',3,'radius'],[2,'value',3,'resolution']] }
};

window.NODE_HELP['prof-ellipse'] = {
  description: 'Generates an ellipse as a list of points. Supports width, depth, rotation, and resolution. Outputs a point list for Loft/Sweep/Extrude.',
  inputs: [{ name: 'Center', desc: 'Center point' },{ name: 'Width', desc: 'X diameter' },{ name: 'Depth', desc: 'Y diameter' },{ name: 'Rotation°', desc: 'Rotation in degrees' },{ name: 'Resolution', desc: 'Point count' }],
  outputs: [{ name: 'Profile', desc: 'List of Point3 forming the ellipse' }],
  example: { title: 'Rotated ellipse 10x6', nodes: [
    { type: 'point-origin', x: 0, y: 0 },
    { type: 'number-input', x: 0, y: 70, controls: { val: 10 } },
    { type: 'number-input', x: 0, y: 130, controls: { val: 6 } },
    { type: 'number-input', x: 0, y: 190, controls: { val: 30 } },
    { type: 'number-input', x: 0, y: 250, controls: { val: 32 } },
    { type: 'prof-ellipse', x: 240, y: 40 }
  ], wires: [[0,'point',5,'center'],[1,'value',5,'width'],[2,'value',5,'depth'],[3,'value',5,'rotation'],[4,'value',5,'resolution']] }
};

window.NODE_HELP['op-interpolate'] = {
  description: 'Creates a smooth curve passing through all given points. Unlike Bezier, the curve goes through every point. Good for tracing paths through known locations.',
  inputs: [{ name: 'Points', desc: 'List of Point3 to pass through' }],
  outputs: [{ name: 'Curve', desc: 'Smooth interpolated curve' }],
  example: { title: 'Curve through 3 points', nodes: [
    { type: 'point-bycoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 80, controls: { x: 5, y: 3, z: 2 } },
    { type: 'point-bycoordinates', x: 0, y: 160, controls: { x: 10, y: 0, z: 0 } },
    { type: 'list-create', x: 200, y: 40 },
    { type: 'op-interpolate', x: 400, y: 40 }
  ], wires: [[0,'point',3,'item0'],[1,'point',3,'item1'],[2,'point',3,'item2'],[3,'list',4,'points']] }
};

window.NODE_HELP['nurbs-interpolate'] = {
  description: 'Creates a NURBS curve passing through all given points with a specified degree. Higher degree = smoother. Degree 3 (cubic) is standard.',
  inputs: [{ name: 'Through Pts', desc: 'Points the curve must pass through' },{ name: 'Degree', desc: 'NURBS degree (3 = cubic)' }],
  outputs: [{ name: 'Curve', desc: 'NURBS curve through the points' }],
  example: { title: 'Cubic NURBS, 4 points', nodes: [
    { type: 'point-bycoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 70, controls: { x: 3, y: 4, z: 1 } },
    { type: 'point-bycoordinates', x: 0, y: 140, controls: { x: 7, y: 2, z: 3 } },
    { type: 'point-bycoordinates', x: 0, y: 210, controls: { x: 10, y: 0, z: 0 } },
    { type: 'list-create', x: 200, y: 60 },
    { type: 'number-input', x: 200, y: 220, controls: { val: 3 } },
    { type: 'nurbs-interpolate', x: 400, y: 80 }
  ], wires: [[0,'point',4,'item0'],[1,'point',4,'item1'],[2,'point',4,'item2'],[3,'point',4,'item3'],[4,'list',6,'points'],[5,'value',6,'degree']] }
};

window.NODE_HELP['nurbs-curve'] = {
  description: 'Creates a NURBS curve from control points. The curve is attracted toward points but does not pass through them (except endpoints). Degree controls smoothness.',
  inputs: [{ name: 'Control Pts', desc: 'List of control points' },{ name: 'Degree', desc: 'NURBS degree (3 = cubic)' }],
  outputs: [{ name: 'Curve', desc: 'NURBS curve' }],
  example: { title: 'Degree-3 NURBS, 5 points', nodes: [
    { type: 'point-bycoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 70, controls: { x: 2, y: 5, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 140, controls: { x: 5, y: -2, z: 3 } },
    { type: 'point-bycoordinates', x: 0, y: 210, controls: { x: 8, y: 4, z: 1 } },
    { type: 'point-bycoordinates', x: 0, y: 280, controls: { x: 10, y: 0, z: 0 } },
    { type: 'list-create', x: 200, y: 80 },
    { type: 'number-input', x: 200, y: 300, controls: { val: 3 } },
    { type: 'nurbs-curve', x: 400, y: 100 }
  ], wires: [[0,'point',5,'item0'],[1,'point',5,'item1'],[2,'point',5,'item2'],[3,'point',5,'item3'],[4,'point',5,'item4'],[5,'list',7,'points'],[6,'value',7,'degree']] }
};

window.NODE_HELP['surf-polyline'] = {
  description: 'Creates a polyline connecting a list of points with straight segments. Optionally closes the shape by connecting last point to first.',
  inputs: [{ name: 'Points', desc: 'List of Point3 to connect' },{ name: 'Closed', desc: 'Connect last to first' }],
  outputs: [{ name: 'Polyline', desc: 'Polyline curve' }],
  example: { title: 'Closed triangle', nodes: [
    { type: 'point-bycoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 70, controls: { x: 10, y: 0, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 140, controls: { x: 5, y: 8, z: 0 } },
    { type: 'list-create', x: 200, y: 30 },
    { type: 'boolean-input', x: 200, y: 170, controls: { val: 'True' } },
    { type: 'surf-polyline', x: 400, y: 50 }
  ], wires: [[0,'point',3,'item0'],[1,'point',3,'item1'],[2,'point',3,'item2'],[3,'list',5,'points'],[4,'value',5,'closed']] }
};

window.NODE_HELP['prof-rect'] = {
  description: 'Creates a rectangle as 4 corner points centered on a given point. Returns a point list for Loft, Sweep, or Extrude.',
  inputs: [{ name: 'Center', desc: 'Center point' },{ name: 'Width', desc: 'X dimension' },{ name: 'Depth', desc: 'Y dimension' }],
  outputs: [{ name: 'Profile', desc: 'List of 4 corner points' }],
  example: { title: '8x4 rectangle', nodes: [
    { type: 'point-origin', x: 0, y: 0 },
    { type: 'number-input', x: 0, y: 70, controls: { val: 8 } },
    { type: 'number-input', x: 0, y: 130, controls: { val: 4 } },
    { type: 'prof-rect', x: 240, y: 20 }
  ], wires: [[0,'point',3,'center'],[1,'value',3,'width'],[2,'value',3,'depth']] }
};

window.NODE_HELP['geometry-distance'] = {
  description: 'Calculates the 3D distance between any two geometries based on their center points. Works with Points, Lines, Circles, Polylines, Arcs, and Meshes.',
  inputs: [{ name: 'Geometry A', desc: 'First geometry (Point, Line, Circle, Mesh, etc.)' },{ name: 'Geometry B', desc: 'Second geometry (Point, Line, Circle, Mesh, etc.)' }],
  outputs: [{ name: 'Distance', desc: 'Distance between center points' }],
  example: { title: 'Distance between sphere and box', nodes: [
    { type: 'point-origin', x: 0, y: 0 },
    { type: 'number-input', x: 0, y: 70, controls: { val: 5 } },
    { type: 'solid-sphere', x: 200, y: 0 },
    { type: 'point-bycoordinates', x: 400, y: 0, controls: { x: 10, y: 5, z: 0 } },
    { type: 'number-input', x: 400, y: 70, controls: { val: 4 } },
    { type: 'number-input', x: 400, y: 130, controls: { val: 4 } },
    { type: 'number-input', x: 400, y: 190, controls: { val: 4 } },
    { type: 'solid-box', x: 600, y: 40 },
    { type: 'geometry-distance', x: 800, y: 0 },
    { type: 'output-watch', x: 1000, y: 0 }
  ], wires: [[0,'point',2,'center'],[1,'value',2,'radius'],[3,'point',7,'center'],[4,'value',7,'width'],[5,'value',7,'depth'],[6,'value',7,'height'],[2,'solid',8,'a'],[7,'solid',8,'b'],[8,'distance',9,'value']] }
};

window.NODE_HELP['nurbs-tween'] = {
  description: 'Generates intermediate curves evenly spaced between two boundary curves. Useful for surface grids, floor plates, or transition profiles.',
  inputs: [{ name: 'Curve A', desc: 'First boundary' },{ name: 'Curve B', desc: 'Second boundary' },{ name: 'Count', desc: 'Number of tweens' }],
  outputs: [{ name: 'Curves', desc: 'List of tween curves' }],
  example: { title: '5 tweens between two lines', nodes: [
    { type: 'point-bycoordinates', x: 0, y: 0, controls: { x: 0, y: 0, z: 0 } },
    { type: 'point-bycoordinates', x: 0, y: 70, controls: { x: 10, y: 0, z: 0 } },
    { type: 'line-bystartpointendpoint', x: 200, y: 0 },
    { type: 'point-bycoordinates', x: 0, y: 180, controls: { x: 0, y: 0, z: 10 } },
    { type: 'point-bycoordinates', x: 0, y: 250, controls: { x: 10, y: 0, z: 10 } },
    { type: 'line-bystartpointendpoint', x: 200, y: 180 },
    { type: 'number-input', x: 200, y: 310, controls: { val: 5 } },
    { type: 'nurbs-tween', x: 420, y: 100 }
  ], wires: [[0,'point',2,'startPoint'],[1,'point',2,'endPoint'],[3,'point',5,'startPoint'],[4,'point',5,'endPoint'],[2,'line',7,'curve1'],[5,'line',7,'curve2'],[6,'value',7,'count']] }
};

// Helper — build example graph
window.buildExampleGraph = function(helpData) {
  if (!helpData || !helpData.example) return 0;
  var ex = helpData.example;
  var created = [];
  var offsetX = 60, offsetY = 60;
  if (app.nodes.length > 0) {
    var maxY = 0;
    app.nodes.forEach(function(n) { if (n.y > maxY) maxY = n.y; });
    offsetY = maxY + 200;
  }
  ex.nodes.forEach(function(nDef) {
    var nd = app.addNodeToCanvas(nDef.type, nDef.x + offsetX, nDef.y + offsetY);
    if (nd && nDef.controls) Object.keys(nDef.controls).forEach(function(k) { nd.controlValues[k] = nDef.controls[k]; });
    created.push(nd);
  });
  created.forEach(function(nd, i) {
    if (!nd || ex.nodes[i].type !== 'list-create') return;
    var maxIdx = 0;
    ex.wires.forEach(function(w) { if (w[2] === i) { var m = w[3].match(/^item(\d+)$/); if (m && parseInt(m[1]) > maxIdx) maxIdx = parseInt(m[1]); } });
    while (nd.def.inputs.length <= maxIdx) app._addDynInput(nd.id);
  });
  ex.wires.forEach(function(w) {
    var from = created[w[0]], to = created[w[2]];
    if (from && to) app.addWire(from.id, w[1], to.id, w[3]);
  });
  app.updatePortDots();
  setTimeout(function() { app.renderWires(); }, 50);
  return created.length;
};

console.log('[NodeFlow] Node Help data — ' + Object.keys(window.NODE_HELP).length + ' entries');

  return true;
}

export default installNodeHelp;
