import {
  ApsDesignAutomationAdapter,
  ApsDerivativeAdapter,
  ApsDocsAdapter
} from '../src/integrations/connect/aps-adapters.js';

function createFetchMock(payload = { data: [] }) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => payload
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('APS Connect adapters', () => {
  it('maps Autodesk Docs items into Nova element records', async () => {
    const fetchImpl = createFetchMock({ data: [] });
    const adapter = new ApsDocsAdapter({ token: 'aps-token', fetchImpl });

    await adapter.listHubs();
    const record = adapter.mapItemToElementRecord({
      id: 'urn:item',
      type: 'items',
      attributes: { displayName: 'Building.rvt', extension: { type: 'versions:autodesk.bim360:File' } }
    }, 'urn:version');

    expect(fetchImpl.calls[0].url).toBe('https://developer.api.autodesk.com/project/v1/hubs');
    expect(fetchImpl.calls[0].options.headers.Authorization).toBe('Bearer aps-token');
    expect(record.identity.source).toBe('aps');
    expect(record.identity.versionId).toBe('urn:version');
    expect(record.name).toBe('Building.rvt');
  });

  it('submits model derivative translation jobs', async () => {
    const fetchImpl = createFetchMock({ result: 'created' });
    const adapter = new ApsDerivativeAdapter({ token: 'aps-token', fetchImpl });

    await adapter.requestTranslation('encoded-urn');

    expect(fetchImpl.calls[0].url).toBe('https://developer.api.autodesk.com/modelderivative/v2/designdata/job');
    expect(JSON.parse(fetchImpl.calls[0].options.body)).toMatchObject({
      input: { urn: 'encoded-urn' },
      output: { formats: [{ type: 'svf2', views: ['2d', '3d'] }] }
    });
  });

  it('creates Design Automation work items for batch Revit jobs', async () => {
    const fetchImpl = createFetchMock({ id: 'workitem-1' });
    const adapter = new ApsDesignAutomationAdapter({ token: 'aps-token', fetchImpl });

    await adapter.createWorkItem({
      activityId: 'nova.ExportGeometry+prod',
      arguments: { inputRvt: { url: 'https://example.com/model.rvt' } }
    });

    expect(fetchImpl.calls[0].url).toBe('https://developer.api.autodesk.com/da/us-east/v3/workitems');
    expect(JSON.parse(fetchImpl.calls[0].options.body)).toMatchObject({
      activityId: 'nova.ExportGeometry+prod',
      arguments: { inputRvt: { url: 'https://example.com/model.rvt' } }
    });
  });
});
