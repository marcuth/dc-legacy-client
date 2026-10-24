import assert from "node:assert/strict"
import { test } from "node:test"

import { resourcesFromUser } from "./playerResources.ts"

const config = { levels: { "1": { xp_required: 0 }, "2": { xp_required: 100 }, "3": { xp_needed: 300 } } }

test("maps playerInfo and the level table to HUD resources", () => {
    const user = { playerInfo: { name: "Ana", level: 2, xp: 150, gold: 10, food: 20, cash: 3 }, map: { ownedDragons: { a: {}, b: {} } } }
    assert.deepEqual(resourcesFromUser(user, config), {
        name: "Ana",
        level: 2,
        xp: 150,
        levelFloorXp: 100,
        levelCeilXp: 300,
        gold: 10,
        food: 20,
        cash: 3,
        dragons: 2,
    })
})

test("the last level has no ceiling and missing nodes default to zero", () => {
    assert.equal(resourcesFromUser({ playerInfo: { level: 3 } }, config).levelCeilXp, null)
    const empty = resourcesFromUser(undefined, undefined)
    assert.equal(empty.level, 1)
    assert.equal(empty.gold, 0)
    assert.equal(empty.levelCeilXp, null)
})
