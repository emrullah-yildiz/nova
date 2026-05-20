import { HostAdapter } from '../src/hosts/HostAdapter.js';
import { HostRegistry } from '../src/hosts/HostRegistry.js';
import { RevitAdapter } from '../src/hosts/revit/RevitAdapter.js';
import { RhinoAdapter } from '../src/hosts/rhino/RhinoAdapter.js';

describe('Host adapter registry', () => {
  it('registers and resolves adapters by host id', () => {
    const registry = new HostRegistry();
    const adapter = new HostAdapter('test-host');

    registry.register(adapter);

    expect(registry.get('test-host')).toBe(adapter);
    expect(registry.activeHostId).toBe('test-host');
  });

  it('wraps existing RevitBridge calls behind RevitAdapter', () => {
    const bridge = {
      getElements(category) {
        return [{ id: 1, category }];
      },
      getGeometries(elements) {
        return elements.map(element => ({ meshFor: element.id }));
      },
      getParameterValues(elements, name) {
        return elements.map(element => element.params[name]);
      },
      sendGeometry(geometry, identity, options) {
        return { ok: true, geometry, identity, options };
      }
    };
    const adapter = new RevitAdapter({ getBridge: () => bridge });
    const elements = adapter.getElements({ category: 'Walls' });

    expect(elements).toEqual([{ id: 1, category: 'Walls' }]);
    expect(adapter.getGeometry(elements)).toEqual([{ meshFor: 1 }]);
    expect(adapter.getParameterValues([{ params: { Mark: 'A' } }], 'Mark')).toEqual(['A']);
    expect(adapter.sendGeometry('geo', { name: 'Nova' })).toMatchObject({ ok: true });
  });

  it('keeps Rhino available as a first-class offline adapter', () => {
    const adapter = new RhinoAdapter();

    expect(adapter.getElements({ layer: 'Default' })).toEqual([]);
    expect(adapter.sendGeometry({})).toMatchObject({
      ok: false,
      code: 'RHINO_ADAPTER_OFFLINE'
    });
  });
});
