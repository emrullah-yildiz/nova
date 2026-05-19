import {
  VALUE_TYPES,
  createElementRef,
  createGeometryRef,
  createListValue,
  createPendingValue,
  createRevitElementRef,
  createRevitGeometryRef,
  createScalarValue,
  createTreeValue,
  isNovaValue,
  isReferenceValue,
  summarizeValue,
  unwrapValue,
  valueTypeOf,
  wrapValue
} from '../src/core/values.js';

describe('core value system', () => {
  it('wraps scalar, list, and tree values predictably', () => {
    const scalar = createScalarValue(42);
    const list = createListValue([scalar, createScalarValue('x')]);
    const tree = createTreeValue([{ path: [0, 1], items: [scalar] }]);

    expect(isNovaValue(scalar)).toBe(true);
    expect(scalar).toMatchObject({ type: VALUE_TYPES.SCALAR, value: 42, valueType: 'number' });
    expect(list).toMatchObject({ type: VALUE_TYPES.LIST, length: 2 });
    expect(tree.branches[0]).toEqual({ path: [0, 1], items: [scalar] });
  });

  it('creates host-safe element references for Revit and future hosts', () => {
    const revitRef = createElementRef({ host: 'revit', id: 1245580, category: 'Walls' });
    const rhinoRef = createElementRef({ host: 'rhino', id: 'guid-1', category: 'Brep' });

    expect(revitRef).toMatchObject({
      type: VALUE_TYPES.ELEMENT_REF,
      host: 'revit',
      id: '1245580',
      category: 'Walls'
    });
    expect(rhinoRef.host).toBe('rhino');
    expect(isReferenceValue(revitRef)).toBe(true);
  });

  it('supports lazy geometry references with cached loads', async () => {
    let loadCount = 0;
    const geometryRef = createGeometryRef({
      host: 'revit',
      id: 'wall:1245580:mesh',
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      load: async () => {
        loadCount += 1;
        return { mesh: true };
      }
    });

    await expect(geometryRef.load()).resolves.toEqual({ mesh: true });
    await expect(geometryRef.load()).resolves.toEqual({ mesh: true });
    expect(loadCount).toBe(1);
    expect(summarizeValue(geometryRef)).toMatchObject({
      type: VALUE_TYPES.GEOMETRY_REF,
      host: 'revit',
      id: 'wall:1245580:mesh'
    });
  });

  it('creates Revit-specific refs from existing element records', () => {
    const element = {
      _type: 'RevitElement',
      id: 1245580,
      sourceId: 'uid-1',
      versionId: 'v2',
      category: 'Walls',
      name: 'Basic Wall'
    };

    expect(createRevitElementRef(element)).toMatchObject({
      type: VALUE_TYPES.ELEMENT_REF,
      host: 'revit',
      id: '1245580',
      category: 'Walls',
      metadata: {
        sourceId: 'uid-1',
        versionId: 'v2'
      }
    });
    expect(createRevitGeometryRef(element)).toMatchObject({
      type: VALUE_TYPES.GEOMETRY_REF,
      host: 'revit',
      id: 'Walls:1245580:mesh',
      metadata: {
        elementId: '1245580',
        category: 'Walls'
      }
    });
  });

  it('wraps and unwraps raw runtime values without changing existing engine behavior', () => {
    const wrapped = wrapValue([1, 'two']);
    const pending = createPendingValue('Loading Revit geometry');

    expect(valueTypeOf([1, 2])).toBe(VALUE_TYPES.LIST);
    expect(wrapped.type).toBe(VALUE_TYPES.LIST);
    expect(unwrapValue(wrapped)).toEqual([1, 'two']);
    expect(summarizeValue(pending)).toEqual({
      type: VALUE_TYPES.PENDING,
      label: 'Loading Revit geometry'
    });
  });
});
