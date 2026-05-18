import { Viewer3D } from '../src/viewer/viewer3d.js';

function createViewerProbe() {
  return {
    ...Viewer3D,
    calls: [],
    clearGeometry() {
      this.calls.push({ type: 'clear' });
    },
    addPoints(points, color, size) {
      this.calls.push({ type: 'points', points, color, size });
    },
    addLines(lineSegments, color) {
      this.calls.push({ type: 'lines', lineSegments, color });
    },
    addCircle(center, radius, color) {
      this.calls.push({ type: 'circle', center, radius, color });
    }
  };
}

describe('Viewer3D geometry workflow helpers', () => {
  it('normalizes point strings and arrays into numeric coordinates', () => {
    expect(Viewer3D.parsePoint('(-1.5, -2, 3.25)')).toEqual([-1.5, -2, 3.25]);
    expect(Viewer3D.parsePoint([4, '5', 6])).toEqual([4, 5, 6]);
    expect(Viewer3D.parsePoint('not a point')).toBeNull();
  });

  it('builds render calls for connected line and circle graph nodes', () => {
    const viewer = createViewerProbe();
    const nodes = [
      { id: 'p1', type: 'geo-point' },
      { id: 'p2', type: 'geo-point' },
      { id: 'radius', type: 'number-input' },
      { id: 'line', type: 'geo-line' },
      { id: 'circle', type: 'geo-circle' }
    ];
    const wires = [
      { fromNode: 'p1', fromPort: 'point', toNode: 'line', toPort: 'start' },
      { fromNode: 'p2', fromPort: 'point', toNode: 'line', toPort: 'end' },
      { fromNode: 'p1', fromPort: 'point', toNode: 'circle', toPort: 'center' },
      { fromNode: 'radius', fromPort: 'value', toNode: 'circle', toPort: 'radius' }
    ];
    const values = {
      p1: '(0, 0, 0)',
      p2: '(5, -2, 1)',
      radius: 3
    };

    viewer.buildFromGraph(nodes, wires, node => values[node.id]);

    expect(viewer.calls[0]).toEqual({ type: 'clear' });
    expect(viewer.calls).toEqual(
      expect.arrayContaining([
        {
          type: 'lines',
          lineSegments: [{ start: [0, 0, 0], end: [5, -2, 1] }],
          color: 0xa6e3a1
        },
        {
          type: 'points',
          points: [
            [0, 0, 0],
            [5, -2, 1]
          ],
          color: 0x89b4fa,
          size: 0.3
        },
        {
          type: 'circle',
          center: [0, 0, 0],
          radius: 3,
          color: 0xf9e2af
        }
      ])
    );
  });

  it('renders array point output as points and connecting segments', () => {
    const viewer = createViewerProbe();
    const polyline = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0]
    ];

    viewer.buildFromGraph([{ id: 'polyline', type: 'custom-list' }], [], () => polyline);

    expect(viewer.calls).toEqual(
      expect.arrayContaining([
        {
          type: 'points',
          points: polyline,
          color: 0x94e2d5,
          size: 0.25
        },
        {
          type: 'lines',
          lineSegments: [
            { start: [0, 0, 0], end: [1, 0, 0] },
            { start: [1, 0, 0], end: [1, 1, 0] }
          ],
          color: 0x94e2d5
        }
      ])
    );
  });
});
