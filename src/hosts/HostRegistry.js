export class HostRegistry {
  constructor() {
    this._adapters = new Map();
    this._activeHostId = '';
  }

  register(adapter) {
    if (!adapter || !adapter.id) throw new TypeError('Host adapter requires an id.');
    this._adapters.set(adapter.id, adapter);
    if (!this._activeHostId) this._activeHostId = adapter.id;
    return adapter;
  }

  unregister(id) {
    this._adapters.delete(id);
    if (this._activeHostId === id) {
      this._activeHostId = this.ids()[0] || '';
    }
  }

  get(id) {
    return this._adapters.get(id || this._activeHostId) || null;
  }

  require(id) {
    const adapter = this.get(id);
    if (!adapter) throw new Error('Host adapter not registered: ' + (id || this._activeHostId || 'active host'));
    return adapter;
  }

  setActive(id) {
    if (!this._adapters.has(id)) throw new Error('Host adapter not registered: ' + id);
    this._activeHostId = id;
    return this.get(id);
  }

  get activeHostId() {
    return this._activeHostId;
  }

  ids() {
    return Array.from(this._adapters.keys());
  }

  list() {
    return this.ids().map(id => this._adapters.get(id));
  }

  clear() {
    this._adapters.clear();
    this._activeHostId = '';
  }
}

export const hostRegistry = new HostRegistry();

export default hostRegistry;
