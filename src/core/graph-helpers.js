export function curveStart(c) {
  if (!c) return undefined;
  if (c.start) return c.start;
  if (c.points && c.points.length > 0) return c.points[0];
  return undefined;
}

export function curveEnd(c) {
  if (!c) return undefined;
  if (c.end) return c.end;
  if (c.points && c.points.length > 0) return c.points[c.points.length - 1];
  return undefined;
}

export function curveLen(c) {
  if (!c) return 0;
  if (typeof c.length === 'function') return c.length();
  if (c.points && c.points.length > 1) {
    let total = 0;
    for (let i = 1; i < c.points.length; i++) {
      const a = c.points[i - 1];
      const b = c.points[i];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return total;
  }
  return 0;
}

export function curveMid(c) {
  const s = curveStart(c);
  const e = curveEnd(c);
  if (!s || !e) return undefined;
  return {
    x: s.x + (e.x - s.x) * 0.5,
    y: s.y + (e.y - s.y) * 0.5,
    z: s.z + (e.z - s.z) * 0.5
  };
}

export function curveDir(c) {
  const s = curveStart(c);
  const e = curveEnd(c);
  if (!s || !e) return { x: 0, y: 0, z: 0 };
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const dz = e.z - s.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}
