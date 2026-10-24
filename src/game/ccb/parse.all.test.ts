import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { parseCCB } from "./reader.ts"

const ROOT = join(import.meta.dirname, "..", "..", "assets", "CCB")

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ccbi") ? [path] : []
    })

test("every shipped ccbi parses to the last byte", () => {
    const failures: string[] = []
    const files = walk(ROOT)
    for (const file of files) {
        try {
            parseCCB(readFileSync(file))
        } catch (error) {
            failures.push(`${file.slice(ROOT.length + 1)}: ${(error as Error).message}`)
        }
    }
    assert.deepEqual(failures, [], `${failures.length}/${files.length} failed`)
})
