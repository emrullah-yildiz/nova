# Stress-test graphs

Two hand-generated `.nodeflow` project files for load / evaluate / render stress
testing. Open them in Nova the same way as any project (the file picker / open
project flow — they use the standard `.nodeflow` serialization, schema
`version: 2`).

| File | Nodes | Wires | Geometry | Stresses |
|---|---|---|---|---|
| `stress-1000-nodes-no-geometry.nodeflow` | 1000 | 1997 | 0 | Node + wire count, deep dependency resolution, canvas/wire rendering — **no** geometry/3D path |
| `stress-1000-nodes-10k-geometry.nodeflow` | 1000 | 0 | 10,000 meshes | Evaluation + the 3D viewer under heavy geometry load |

## What's in each

**No-geometry** — one `Input.Number(1)` feeding a 998-deep `Math.Add` chain
(result climbs 2, 3, 4, … 999), with every adder's `B` also wired from the input
(so node-1 fans out to 999 consumers), terminating in an `Output.Watch`. Pure
value graph: it never constructs a mesh, so it isolates the node/wire/eval cost
from the geometry path. Watch shows `999`.

**10k-geometry** — 1000 `Pattern.HexGrid` nodes, each a 2×5 grid = 10 hex-tile
meshes → 10,000 meshes total. The nodes are unwired on purpose: the engine
evaluates every node, and terminal geometry (nothing consuming it downstream)
previews by default, so all 10k render without an output node. Radius cycles
1.0–6.5 so the rings nest at varied sizes rather than perfectly overlapping.

## Regenerating / rescaling

```
node stress-tests/generate-stress-tests.mjs
```

Edit the count / `rows`×`cols` constants in `generate-stress-tests.mjs` to scale
the stress up or down. `tests/stress-test-files.test.js` validates both files
against the live node registry (every type resolves, every wire port exists,
counts match), so a node rename or port change that would break loading is
caught in CI.
