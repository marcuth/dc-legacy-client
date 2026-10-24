import assert from "node:assert/strict"
import { test } from "node:test"

import { coversTile, overlaps, snapMove, tileRange } from "./footprint.ts"

test("a footprint covers the tiles behind its front tile", () => {
    const farm = { x: 22, y: 63, width: 3, height: 3 }
    assert.deepEqual(tileRange(farm), { minX: 20, maxX: 22, minY: 61, maxY: 63 })
    assert.ok(coversTile(farm, { x: 22, y: 63 }))
    assert.ok(coversTile(farm, { x: 20, y: 61 }))
    assert.ok(!coversTile(farm, { x: 23, y: 63 }))
    assert.ok(!coversTile(farm, { x: 19, y: 61 }))
})

test("footprints that share a tile overlap, touching ones do not", () => {
    const a = { x: 10, y: 10, width: 3, height: 3 }
    assert.ok(overlaps(a, { x: 11, y: 11, width: 2, height: 2 }))
    assert.ok(!overlaps(a, { x: 13, y: 10, width: 3, height: 3 }))
    assert.ok(!overlaps(a, { x: 10, y: 13, width: 3, height: 3 }))
    assert.ok(overlaps(a, a))
})

test("moving keeps the point of the building that was grabbed", () => {
    assert.deepEqual(snapMove({ x: 10.2, y: 20.8 }, { x: 0.4, y: -0.3 }), { x: 11, y: 21 })
    assert.deepEqual(snapMove({ x: 10, y: 20 }, { x: 2, y: 2 }), { x: 12, y: 22 })
})
