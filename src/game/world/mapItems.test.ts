import assert from "node:assert/strict"
import { test } from "node:test"

import { buildingsFromMap } from "./mapItems.ts"

const config = { items: { "16": { group_type: "farm", width: 3, height: 3 }, "1011": { group_type: "dragon" } } }

test("reads buildings with their footprint from the catalog", () => {
    const user = { map: { items: { a: [16, 20, 30, 0, 0, 0, {}], b: [99, 5, 6] } } }
    assert.deepEqual(buildingsFromMap(user, config), [
        { id: "a", itemId: 16, x: 20, y: 30, width: 3, height: 3 },
        { id: "b", itemId: 99, x: 5, y: 6, width: 1, height: 1 },
    ])
})

test("skips dragons and malformed entries", () => {
    const user = { map: { items: { a: [1011, 1, 1], b: "nope", c: [16, "x", 2] } } }
    assert.deepEqual(buildingsFromMap(user, config), [])
    assert.deepEqual(buildingsFromMap(undefined, undefined), [])
})
