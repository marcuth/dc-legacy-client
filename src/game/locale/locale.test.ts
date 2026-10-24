import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { Locale, parseStrings } from "./locale.ts"

const load = (code: string) =>
    new Locale(parseStrings(readFileSync(join(import.meta.dirname, "..", "..", "assets", "Locale", `locale_${code}.txt`), "utf8")))

test("looks up by English text and falls back to the key", () => {
    const pt = load("pt_br")
    assert.notEqual(pt.tr("ACCOUNT CONFIRMATION"), "ACCOUNT CONFIRMATION")
    assert.equal(pt.tr("not a real key"), "not a real key")
})

test("formats sequential placeholders", () => {
    const en = load("en")
    assert.equal(
        en.format("Breeding will finish in %s, do you want\nto finish it now for %d gems?", "29m", 1),
        "Breeding will finish in 29m, do you want\nto finish it now for 1 gems?",
    )
})

test("parses every shipped table", () => {
    for (const code of ["de", "en", "es", "fr", "it", "pl", "pt_br", "tr"]) {
        assert.ok(load(code).tr("ACCOUNT CONFIRMATION").length > 0, code)
    }
    assert.ok(parseStrings(readFileSync(join(import.meta.dirname, "..", "..", "assets", "Locale", "locale_en.txt"), "utf8")).size > 700)
})
