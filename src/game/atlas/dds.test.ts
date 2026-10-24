import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { unzip } from "../world/zip.ts"
import { decodeDds } from "./dds.ts"

const sheet = async (name: string) => {
    const bytes = readFileSync(join(import.meta.dirname, "..", "..", "assets", "HD", "Engine", "s3tc", `${name}.zip`))
    const files = await unzip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    const dds = files.get(`${name}.dds`)!
    return decodeDds(dds.buffer.slice(dds.byteOffset, dds.byteOffset + dds.byteLength))
}

const near = (image: { width: number; data: Uint8Array }, x: number, y: number, expected: number[]) => {
    const at = (y * image.width + x) * 4
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(image.data[at + i] - expected[i]) <= 2, `pixel ${x},${y} channel ${i}: ${image.data[at + i]} vs ${expected[i]}`)
}

// Expected values come from Pillow's DDS decoder.
test("decodes a DXT5 sheet like Pillow", async () => {
    const image = await sheet("0016_farm_1")
    assert.deepEqual([image.width, image.height], [512, 256])
    near(image, 3, 3, [0, 0, 0, 0])
    near(image, 100, 100, [145, 87, 40, 255])
    near(image, 256, 128, [192, 134, 57, 255])
    near(image, 150, 120, [148, 113, 66, 255])
})

test("decodes a sheet whose height is not a multiple of 4", async () => {
    const image = await sheet("0026_habitat_earth_1")
    assert.deepEqual([image.width, image.height], [436, 334])
    assert.equal(image.data.length, 436 * 334 * 4)
    near(image, 218, 167, [222, 211, 173, 255])
    near(image, 433, 331, [0, 0, 0, 0])
})

test("rejects files that are not DDS", () => {
    assert.throws(() => decodeDds(new ArrayBuffer(200)), /Not a DDS/)
})
