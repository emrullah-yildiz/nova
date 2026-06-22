import { ExecutionEngine } from '../src/runtime/ExecutionEngine.js';

function installDom() {
  globalThis.document = {
    getElementById() { return null; }
  };
}

function createApp() {
  const executed = [];
  const app = {
    nodes: [
      { id: 'a', type: 'Input.Number' },
      { id: 'b', type: 'Math.Add' },
      { id: 'c', type: 'Output.Watch' },
      { id: 'd', type: 'Input.Number' }
    ],
    wires: [
      { fromNode: 'a', fromPort: 'value', toNode: 'b', toPort: 'a' },
      { fromNode: 'b', fromPort: 'result', toNode: 'c', toPort: 'value' }
    ],
    removeNode() {},
    addWire(fromNode, fromPort, toNode, toPort) {
      this.wires.push({ fromNode, fromPort, toNode, toPort });
    },
    invalidateCompute() {},
    computeNodeValue(nd) {
      executed.push(nd.id);
      return nd.id + '-value';
    },
    _commitRunSnapshot() {},
    _showCancelButton() {},
    _hideCancelButton() {}
  };
  return { app, executed };
}

describe('ExecutionEngine dirty runs', () => {
  it('executes only requested roots and their downstream nodes', async () => {
    installDom();
    const { app, executed } = createApp();
    const engine = new ExecutionEngine({ cacheEnabled: false });
    engine.attach(app);

    const result = await engine.runDirtyNodes(['b']);

    expect(result.dirtyNodeIds.sort()).toEqual(['b', 'c']);
    expect(executed).toEqual(['b', 'c']);
  });
});
