import assert from "node:assert/strict"
import { test } from "node:test"

import { formatCount, formatDuration, levelProgress } from "./format.ts"

test("formats durations with the two largest units", () => {
    assert.equal(formatDuration(1740), "29m")
    assert.equal(formatDuration(3900), "1h 5m")
    assert.equal(formatDuration(90061), "1d 1h")
    assert.equal(formatDuration(0), "0s")
    assert.equal(formatDuration(40), "40s")
})

test("formats counts with thousands separators", () => {
    assert.equal(formatCount(120000), "120,000")
    assert.equal(formatCount(999), "999")
})

test("level progress is clamped and full at the maximum level", () => {
    assert.equal(levelProgress({ xp: 5400, levelFloorXp: 5000, levelCeilXp: 6000 }), 0.4)
    assert.equal(levelProgress({ xp: 10, levelFloorXp: 5000, levelCeilXp: 6000 }), 0)
    assert.equal(levelProgress({ xp: 99999, levelFloorXp: 5000, levelCeilXp: null }), 1)
})
