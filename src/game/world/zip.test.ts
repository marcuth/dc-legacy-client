import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { unzip } from "./zip.ts"

const ART = join(import.meta.dirname, "..", "..", "assets", "HD", "Engine", "s3tc")

const open = async (name: string) => {
    const bytes = readFileSync(join(ART, name))
    return unzip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
}

test("extracts a building archive", async () => {
    const files = await open("0016_farm_1.zip")
    assert.deepEqual([...files.keys()].sort(), ["0016_farm_1.dds", "0016_farm_1.plist"])
    assert.equal(String.fromCharCode(...files.get("0016_farm_1.dds")!.subarray(0, 4)), "DDS ")
    assert.match(new TextDecoder().decode(files.get("0016_farm_1.plist")), /sourceSize/)
})

test("extracts a dragon archive with its animation files", async () => {
    const files = await open("1011_dragon_earth_a_1.zip")
    assert.ok(files.has("1011_dragon_earth_a_1.dds"))
    assert.ok(files.has("1011_dragon_earth_a_1_walk.bin"))
})

test("rejects data that is not a zip", async () => {
    await assert.rejects(unzip(new ArrayBuffer(64)), /Not a zip/)
})
