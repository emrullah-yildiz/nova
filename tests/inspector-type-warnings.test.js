import { describe, it, expect } from 'vitest';
import { inferValueType, portAcceptsType } from '../src/ui/node-renderer.js';

// Builds a kernel-shaped value stub. The helpers only read `_type`.
function kernel(t) { return { _type: t }; }

describe('inferValueType', () => {
  it('infers primitives and collections', () => {
    expect(inferValueType(3)).toBe('number');
    expect(inferValueType(true)).toBe('boolean');
    expect(inferValueType('hi')).toBe('string');
    expect(inferValueType([1, 2])).toBe('list');
    expect(inferValueType(undefined)).toBe('missing');
    expect(inferValueType(null)).toBe('null');
  });

  it('infers ref-tagged values', () => {
    expect(inferValueType({ type: 'GeometryRef' })).toBe('geometry');
    expect(inferValueType({ type: 'ElementRef' })).toBe('element');
  });

  it('maps every kernel _type to its inspector port-type', () => {
    expect(inferValueType(kernel('Point3'))).toBe('point');
    expect(inferValueType(kernel('Vector3'))).toBe('vector');
    expect(inferValueType(kernel('Line3'))).toBe('line');
    expect(inferValueType(kernel('Polyline3'))).toBe('curve');
    expect(inferValueType(kernel('Arc3'))).toBe('curve');
    expect(inferValueType(kernel('Circle3'))).toBe('circle');
    expect(inferValueType(kernel('Ellipse3'))).toBe('curve');
    expect(inferValueType(kernel('Curve3'))).toBe('curve');
    expect(inferValueType(kernel('NurbsCurve'))).toBe('curve');
    expect(inferValueType(kernel('Surface'))).toBe('surface');
    expect(inferValueType(kernel('NurbsSurface'))).toBe('surface');
    expect(inferValueType(kernel('Mesh3'))).toBe('mesh');
    expect(inferValueType(kernel('CompressedMesh'))).toBe('mesh');
    expect(inferValueType(kernel('Plane'))).toBe('plane');
  });

  it('is case-insensitive on _type', () => {
    expect(inferValueType(kernel('plane'))).toBe('plane');
    expect(inferValueType(kernel('PLANE'))).toBe('plane');
    expect(inferValueType(kernel('circle3'))).toBe('circle');
  });

  it('falls back to object for unknown tagged values (genuine junk still detectable)', () => {
    expect(inferValueType(kernel('WidgetFrobnicator'))).toBe('object');
    expect(inferValueType({ foo: 1 })).toBe('object');
  });
});

describe('portAcceptsType — zero false positives for legitimate pairings', () => {
  // helper: infer the value, then check the port accepts it.
  function accepts(port, value) {
    return portAcceptsType(port, inferValueType(value), value);
  }

  it('accepts the reported bug: Plane value -> plane port', () => {
    expect(accepts('plane', kernel('Plane'))).toBe(true);
  });

  it('accepts Circle3 into both circle and curve ports (the curve-family gap)', () => {
    expect(accepts('circle', kernel('Circle3'))).toBe(true);
    expect(accepts('curve', kernel('Circle3'))).toBe(true);
  });

  it('accepts Line3 into both line and curve ports', () => {
    expect(accepts('line', kernel('Line3'))).toBe(true);
    expect(accepts('curve', kernel('Line3'))).toBe(true);
  });

  it('accepts polyline/arc/ellipse into curve ports', () => {
    expect(accepts('curve', kernel('Polyline3'))).toBe(true);
    expect(accepts('curve', kernel('Arc3'))).toBe(true);
    expect(accepts('curve', kernel('Ellipse3'))).toBe(true);
  });

  it('accepts meshes/surfaces into mesh and surface ports', () => {
    expect(accepts('mesh', kernel('Mesh3'))).toBe(true);
    expect(accepts('mesh', kernel('CompressedMesh'))).toBe(true);
    expect(accepts('surface', kernel('Surface'))).toBe(true);
    expect(accepts('surface', kernel('NurbsSurface'))).toBe(true);
    expect(accepts('mesh', kernel('Surface'))).toBe(true);
    expect(accepts('mesh', kernel('NurbsSurface'))).toBe(true);
  });

  it('accepts every primitive/geometry value-type used in the library into its own port', () => {
    expect(accepts('number', 3)).toBe(true);
    expect(accepts('boolean', true)).toBe(true);
    expect(accepts('string', 'x')).toBe(true);
    expect(accepts('point', kernel('Point3'))).toBe(true);
    expect(accepts('vector', kernel('Vector3'))).toBe(true);
    expect(accepts('mesh', kernel('Mesh3'))).toBe(true);
    expect(accepts('curve', kernel('Curve3'))).toBe(true);
    expect(accepts('line', kernel('Line3'))).toBe(true);
    expect(accepts('circle', kernel('Circle3'))).toBe(true);
    expect(accepts('plane', kernel('Plane'))).toBe(true);
  });

  it('keeps existing permissive cases (any, missing/null, numeric-string)', () => {
    expect(portAcceptsType('any', 'mesh')).toBe(true);
    expect(portAcceptsType('mesh', 'missing')).toBe(true);
    expect(portAcceptsType('mesh', 'null')).toBe(true);
    expect(portAcceptsType('number', 'string', '42')).toBe(true);
  });
});

describe('portAcceptsType — still flags genuine mismatches', () => {
  function accepts(port, value) {
    return portAcceptsType(port, inferValueType(value), value);
  }

  it('warns number -> mesh', () => {
    expect(accepts('mesh', 3)).toBe(false);
  });

  it('warns string -> point', () => {
    expect(accepts('point', 'hello')).toBe(false);
  });

  it('warns number -> plane', () => {
    expect(accepts('plane', 3)).toBe(false);
  });

  it('warns non-numeric string -> number', () => {
    expect(portAcceptsType('number', 'string', 'abc')).toBe(false);
  });

  it('does not let curve family leak into mesh/point', () => {
    expect(accepts('mesh', kernel('Circle3'))).toBe(false);
    expect(accepts('point', kernel('Line3'))).toBe(false);
  });
});
