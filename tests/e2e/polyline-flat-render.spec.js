// Nova — Flat curve rendering E2E spec
//
// Curves (Polyline3, Line3, Arc3, Circle3) must render as flat, screen-space
// "fat lines" (THREE.Line2) — crisp and 2D like Rhino — NOT as 3D TubeGeometry
// meshes (which look like swept solids). This spec drives the same toMesh()
// path the viewer uses (Geo.addToScene → geoObj.toMesh) and asserts the result
// is a line, never a tube.
//
// See src/ui/line-render-patch.js and index.html (Line2 example modules).

const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.app && window.app.initialized && window.Geo);
}

// Walk a returned object (Group/Mesh/Line) and classify what it contains.
// Returns { isLine, isFatLine, hasTube, meshCount } describing the render.
function classifyToMesh() {
  return {
    classify(obj) {
      let isFatLine = false, isLine = false, hasTube = false, meshCount = 0;
      const visit = (o) => {
        if (!o) return;
        // Line2 (fat lines) extends Mesh, so it reports isMesh === true. Classify
        // line objects first and do NOT count them as solid meshes.
        if (o.isLine2 || o.isLine || o.isLineLoop || o.isLineSegments) {
          if (o.isLine2) isFatLine = true; else isLine = true;
        } else if (o.isMesh) {
          meshCount++;
          const t = o.geometry && o.geometry.type;
          if (t && /Tube/i.test(t)) hasTube = true;
        }
        if (o.children) o.children.forEach(visit);
      };
      visit(obj);
      return { isFatLine, isLine, hasTube, meshCount };
    }
  };
}

test.describe('Curves render flat (fat lines), not 3D tubes', () => {

  test('Polyline3.toMesh produces a flat line, not a tube', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate((classifySrc) => {
      const Geo = window.Geo;
      const P = (x, y, z) => new Geo.Point3(x, y, z);
      const poly = new Geo.Polyline3([P(0, 0, 0), P(5, 0, 0), P(5, 5, 0), P(0, 5, 0)], true);
      const mesh = poly.toMesh(0x94e2d5);
      // eslint-disable-next-line no-eval
      const { classify } = (eval('(' + classifySrc + ')'))();
      return classify(mesh);
    }, classifyToMesh.toString());

    // Must be a line (fat Line2 when modules load, plain Line as fallback) …
    expect(result.isFatLine || result.isLine).toBe(true);
    // … and must NOT contain any tube mesh.
    expect(result.hasTube).toBe(false);
    expect(result.meshCount).toBe(0);
  });

  test('Line3.toMesh produces a flat line, not a tube', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate((classifySrc) => {
      const Geo = window.Geo;
      const line = new Geo.Line3(new Geo.Point3(0, 0, 0), new Geo.Point3(10, 0, 0));
      const mesh = line.toMesh(0xa6e3a1);
      // eslint-disable-next-line no-eval
      const { classify } = (eval('(' + classifySrc + ')'))();
      return classify(mesh);
    }, classifyToMesh.toString());

    expect(result.isFatLine || result.isLine).toBe(true);
    expect(result.hasTube).toBe(false);
    expect(result.meshCount).toBe(0);
  });

  test('Arc3 and Circle3 render as flat lines, not tubes', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate((classifySrc) => {
      const Geo = window.Geo;
      // eslint-disable-next-line no-eval
      const { classify } = (eval('(' + classifySrc + ')'))();
      const arc = new Geo.Arc3(new Geo.Point3(0, 0, 0), 5, 0, Math.PI, new Geo.Vector3(0, 0, 1));
      const circle = new Geo.Circle3(new Geo.Point3(0, 0, 0), 4, new Geo.Vector3(0, 0, 1));
      return { arc: classify(arc.toMesh()), circle: classify(circle.toMesh()) };
    }, classifyToMesh.toString());

    expect(result.arc.isFatLine || result.arc.isLine).toBe(true);
    expect(result.arc.hasTube).toBe(false);
    expect(result.circle.isFatLine || result.circle.isLine).toBe(true);
    expect(result.circle.hasTube).toBe(false);
  });

  test('Rectangle.ByCenterWidthDepth output renders as a flat closed line', async ({ page }) => {
    await waitForApp(page);

    // Rectangle returns a closed Polyline3 (commit 27181ac). Build the node,
    // compute its value, and render it through the viewer's addToScene path.
    const result = await page.evaluate((classifySrc) => {
      const Geo = window.Geo;
      window.app.newProject();
      const rect = window.app.addNodeToCanvas('Rectangle.ByCenterWidthDepth', 200, 200);
      const val = window.app.computeNodeValue(rect);
      // Render through the real viewer path into a throwaway THREE.Group.
      const group = new window.THREE.Group();
      Geo.addToScene(group, val, 0x94e2d5);
      // eslint-disable-next-line no-eval
      const { classify } = (eval('(' + classifySrc + ')'))();
      return { type: val && val._type, render: classify(group) };
    }, classifyToMesh.toString());

    expect(result.type).toBe('Polyline3');
    expect(result.render.isFatLine || result.render.isLine).toBe(true);
    expect(result.render.hasTube).toBe(false);
    expect(result.render.meshCount).toBe(0);
  });
});
