export class HostAdapter {
  constructor(id) {
    if (!id) throw new TypeError('HostAdapter requires an id.');
    this.id = id;
  }

  getElements(_query) {
    throw new Error(this.id + '.getElements is not implemented.');
  }

  getGeometry(_refs) {
    throw new Error(this.id + '.getGeometry is not implemented.');
  }

  sendGeometry(_geometry, _options) {
    throw new Error(this.id + '.sendGeometry is not implemented.');
  }

  getParameterValues(_refs, _names) {
    throw new Error(this.id + '.getParameterValues is not implemented.');
  }

  setParameterValues(_refs, _names, _values) {
    throw new Error(this.id + '.setParameterValues is not implemented.');
  }
}

export default HostAdapter;
