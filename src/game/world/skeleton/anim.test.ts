import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { unzip } from "../zip.ts"
import { frameAt, parseSkeletonAnimations } from "./anim.ts"

const ENGINE = join(import.meta.dirname, "..", "..", "..", "assets", "Engine")
const ART = join(import.meta.dirname, "..", "..", "..", "assets", "HD", "Engine", "s3tc")

const toBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

test("every shipped path file parses to the last byte", () => {
    const files = readdirSync(ENGINE).filter((name) => name.endsWith(".bin"))
    assert.ok(files.length >= 30)
    for (const file of files) {
        const buffer = toBuffer(readFileSync(join(ENGINE, file)))
        const animations = parseSkeletonAnimations(buffer)
        assert.equal(animations[0].name, "right", file)
        assert.ok(animations[0].parts[0].frames.length > 1, file)
    }
})

test("every animation inside the dragon archives parses", async () => {
    for (const archive of readdirSync(ART).filter((name) => name.endsWith(".zip") && /^\d{4}_dragon/.test(name))) {
        const files = await unzip(toBuffer(readFileSync(join(ART, archive))))
        for (const [name, bytes] of files) {
            if (name.endsWith(".bin")) assert.ok(parseSkeletonAnimations(toBuffer(bytes)).length >= 1, name)
        }
    }
})

test("reads the first frame of the baby dragon walk", async () => {
    const files = await unzip(toBuffer(readFileSync(join(ART, "1011_dragon_earth_a_1.zip"))))
    const [walk] = parseSkeletonAnimations(toBuffer(files.get("1011_dragon_earth_a_1_walk.bin")!))
    assert.equal(walk.name, "walk")
    assert.equal(walk.atlas, "1011_dragon_earth_a_1")
    assert.equal(walk.length, 25)
    assert.equal(walk.parts.length, 29)
    const first = walk.parts[0].frames[0]
    assert.equal(walk.parts[0].name, "Bitmap 2")
    assert.ok(Math.abs(first.anchorX - 0.25) < 1e-6)
    assert.ok(Math.abs(first.scaleX - 0.4033) < 1e-3)
})

test("frameAt finds the run covering a frame and wraps around", async () => {
    const files = await unzip(toBuffer(readFileSync(join(ART, "1011_dragon_earth_a_1.zip"))))
    const [walk] = parseSkeletonAnimations(toBuffer(files.get("1011_dragon_earth_a_1_walk.bin")!))
    const part = walk.parts[0]
    assert.equal(frameAt(part, 0), part.frames[0])
    const second = part.frames[1]
    assert.equal(frameAt(part, second.start + second.count - 1), second)
    assert.equal(frameAt(part, part.frameLength), part.frames[0])
    assert.equal(frameAt(part, -1), part.frames[part.frames.length - 1])
})
