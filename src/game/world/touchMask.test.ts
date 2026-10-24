import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { TouchMask } from "./touchMask.ts"

const ENGINE = join(import.meta.dirname, "..", "..", "assets", "Engine")

const load = (name: string, width: number) => new TouchMask(new Uint8Array(readFileSync(join(ENGINE, `${name}.mask`))), width)

test("masks hold only zeros and ones", () => {
    const files = readdirSync(ENGINE).filter((name) => name.endsWith(".mask"))
    assert.ok(files.length >= 20)
    for (const file of files) {
        const data = readFileSync(join(ENGINE, file))
        assert.ok(data.every((value) => value === 0 || value === 1), file)
    }
})

test("sizes match the HD art at half resolution", () => {
    // Widths are the source image width in points; the farm file is one row shorter than its image.
    const habitat = load("0026_habitat_earth_1", 216)
    assert.equal(habitat.height, 165)
    const incubator = load("0001_incubator", 324)
    assert.equal(incubator.height, 276)
    assert.equal(load("0016_farm_1", 162).height, 132)
})

test("touchable pixels follow the silhouette", () => {
    const habitat = load("0026_habitat_earth_1", 216)
    // The middle of the earth patch is solid; the top-left corner of the image is transparent.
    assert.equal(habitat.isTouchable(108, 110), true)
    assert.equal(habitat.isTouchable(2, 2), false)
})

test("positions outside the mask are not touchable", () => {
    const farm = load("0016_farm_1", 162)
    assert.equal(farm.isTouchable(-1, 0), false)
    assert.equal(farm.isTouchable(0, 132), false)
    assert.equal(farm.isTouchable(162, 0), false)
    assert.equal(farm.isTouchable(1.5, 3), false)
})
