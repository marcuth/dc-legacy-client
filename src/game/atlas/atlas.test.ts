import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { parseAtlasPlist, parseStarlingAtlas, type Atlas } from "./atlas.ts"

const ROOT = join(import.meta.dirname, "..", "..", "assets")

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? walk(path) : [path]
    })

const check = (atlas: Atlas, label: string, problems: string[]) => {
    if (atlas.frames.size === 0) problems.push(`${label}: no frames`)
    for (const f of atlas.frames.values()) {
        if (atlas.width && (f.x < 0 || f.y < 0 || f.x + f.w > atlas.width || f.y + f.h > atlas.height)) {
            problems.push(`${label}: ${f.name} outside texture`)
        }
        if (f.trimX < -0.5 || f.trimY < -0.5 || f.trimX + f.trimW > f.sourceW + 0.5 || f.trimY + f.trimH > f.sourceH + 0.5) {
            problems.push(`${label}: ${f.name} trim outside source`)
        }
    }
}

test("plist atlases parse with frames inside their texture", () => {
    const problems: string[] = []
    const files = walk(ROOT).filter((p) => p.endsWith(".plist"))
    for (const file of files) {
        const label = file.slice(ROOT.length + 1)
        check(parseAtlasPlist(readFileSync(file, "utf8")), label, problems)
    }
    assert.ok(files.length > 50)
    assert.deepEqual(problems.slice(0, 20), [])
})

test("starling xml atlases parse", () => {
    const problems: string[] = []
    const files = walk(ROOT).filter((p) => p.includes("Engine") && p.endsWith(".xml"))
    for (const file of files) check(parseStarlingAtlas(readFileSync(file, "utf8")), file.slice(ROOT.length + 1), problems)
    assert.deepEqual(problems.slice(0, 20), [])
})

test("trim math matches the cocos offset convention", () => {
    const atlas = parseAtlasPlist(readFileSync(join(ROOT, "HD", "Engine", "s3tc", "night_islands.plist"), "utf8"))
    const frame = atlas.frames.get("all_islands_02.png")!
    assert.deepEqual([frame.trimX, frame.trimY, frame.trimW, frame.trimH], [47, 153, 8, 6])
})
