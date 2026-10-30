import assert from "node:assert/strict"
import { test } from "node:test"

import { buildingLevel, earningsAt, MAX_BUILDING_LEVEL, upgradeGemCost } from "./upgrade.ts"

test("a building without attributes is level 1", () => {
    assert.equal(buildingLevel([16, 1, 2]), 1)
    assert.equal(buildingLevel(undefined), 1)
    assert.equal(buildingLevel([16, 1, 2, 0, 0, 0, { level: 3 }]), 3)
    assert.equal(buildingLevel([16, 1, 2, 0, 0, 0, { level: 99 }]), MAX_BUILDING_LEVEL)
})

test("upgrades cost more and earnings grow with the level", () => {
    assert.ok(upgradeGemCost(2) > upgradeGemCost(1))
    assert.ok(earningsAt("farm", 2)!.amount > earningsAt("farm", 1)!.amount)
    assert.equal(earningsAt("incubator", 1), null)
})
