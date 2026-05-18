import { normalizeElementRecord } from './protocol.js';

export class ApsDocsAdapter {
  constructor({ token, fetchImpl } = {}) {
    this.token = token || '';
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.baseUrl = 'https://developer.api.autodesk.com';
  }

  async listHubs() {
    return this.get('/project/v1/hubs');
  }

  async listProjects(hubId) {
    return this.get('/project/v1/hubs/' + encodeURIComponent(hubId) + '/projects');
  }

  async listTopFolders(hubId, projectId) {
    return this.get('/project/v1/hubs/' + encodeURIComponent(hubId) + '/projects/' + encodeURIComponent(projectId) + '/topFolders');
  }

  async listVersions(projectId, itemId) {
    return this.get('/data/v1/projects/' + encodeURIComponent(projectId) + '/items/' + encodeURIComponent(itemId) + '/versions');
  }

  mapItemToElementRecord(item, versionId = '') {
    const attrs = item.attributes || {};
    return normalizeElementRecord({
      id: item.id,
      name: attrs.displayName || attrs.name || item.id,
      category: 'APS Item',
      typeName: item.type,
      params: attrs
    }, {
      source: 'aps',
      sourceId: item.id,
      versionId
    });
  }

  async get(path) {
    const response = await this.fetchImpl(this.baseUrl + path, { headers: this.headers() });
    if (!response.ok) throw new Error('APS request failed: ' + response.status);
    return response.json();
  }

  headers() {
    return { Authorization: 'Bearer ' + this.token };
  }
}

export class ApsDerivativeAdapter {
  constructor({ token, fetchImpl } = {}) {
    this.token = token || '';
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.baseUrl = 'https://developer.api.autodesk.com/modelderivative/v2/designdata';
  }

  async requestTranslation(urn, outputFormats = [{ type: 'svf2', views: ['2d', '3d'] }]) {
    const response = await this.fetchImpl(this.baseUrl + '/job', {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { urn },
        output: { formats: outputFormats }
      })
    });
    if (!response.ok) throw new Error('APS derivative translation failed: ' + response.status);
    return response.json();
  }

  async getManifest(urn) {
    return this.get('/' + encodeURIComponent(urn) + '/manifest');
  }

  async getMetadata(urn) {
    return this.get('/' + encodeURIComponent(urn) + '/metadata');
  }

  async getProperties(urn, guid) {
    return this.get('/' + encodeURIComponent(urn) + '/metadata/' + encodeURIComponent(guid) + '/properties');
  }

  async get(path) {
    const response = await this.fetchImpl(this.baseUrl + path, { headers: this.headers() });
    if (!response.ok) throw new Error('APS derivative request failed: ' + response.status);
    return response.json();
  }

  headers() {
    return { Authorization: 'Bearer ' + this.token };
  }
}

export class ApsDesignAutomationAdapter {
  constructor({ token, fetchImpl, nickname = 'nova' } = {}) {
    this.token = token || '';
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.nickname = nickname;
    this.baseUrl = 'https://developer.api.autodesk.com/da/us-east/v3';
  }

  async createWorkItem({ activityId, arguments: workItemArguments }) {
    const response = await this.fetchImpl(this.baseUrl + '/workitems', {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activityId,
        arguments: workItemArguments || {}
      })
    });
    if (!response.ok) throw new Error('APS Design Automation work item failed: ' + response.status);
    return response.json();
  }

  async getWorkItem(workItemId) {
    const response = await this.fetchImpl(this.baseUrl + '/workitems/' + encodeURIComponent(workItemId), { headers: this.headers() });
    if (!response.ok) throw new Error('APS Design Automation status failed: ' + response.status);
    return response.json();
  }

  headers() {
    return { Authorization: 'Bearer ' + this.token };
  }
}
