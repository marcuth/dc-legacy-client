import assert from "node:assert/strict"
import { test } from "node:test"

import { nodeZIndex, pixelToTile, tileToPixel } from "./iso.ts"

test("tile corners project to a 54 x 27 diamond grid", () => {
    assert.deepEqual(tileToPixel(0, 0), { x: 0, y: 0 })
    assert.deepEqual(tileToPixel(1, 0), { x: 27, y: 13.5 })
    assert.deepEqual(tileToPixel(0, 1), { x: -27, y: 13.5 })
    assert.deepEqual(tileToPixel(2, 2), { x: 0, y: 54 })
})

test("a point inside tile n maps back to n (tiles are ceiled)", () => {
    for (const [tx, ty] of [[5, 7], [22, 63], [1, 1]]) {
        // The middle of the diamond of tile (tx, ty) lies half a tile before its bottom corner.
        const middle = tileToPixel(tx - 0.5, ty - 0.5)
        assert.deepEqual(pixelToTile(middle.x, middle.y), { x: tx, y: ty })
    }
})

test("depth grows towards the viewer and shrinks with the width", () => {
    assert.equal(nodeZIndex(10, 10, 3), 17)
    assert.ok(nodeZIndex(11, 10, 3) > nodeZIndex(10, 10, 3))
    assert.equal(nodeZIndex(10.9, 10, 2), 18)
})
