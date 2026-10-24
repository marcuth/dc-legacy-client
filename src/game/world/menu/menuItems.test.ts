import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { MENU_ITEMS, MenuItemType, menuItemsFor } from "./menuItems.ts"

const ASSETS = join(import.meta.dirname, "..", "..", "..", "assets")

test("every icon of the menu exists in the APK, except the goals one", () => {
    // ic-goals.png is not shipped; the original loads it from the server.
    for (const [type, { icon }] of Object.entries(MENU_ITEMS)) {
        if (Number(type) === MenuItemType.Goals) continue
        assert.ok(readFileSync(join(ASSETS, "HD", icon)).length > 0, icon)
    }
})

test("every title is a key of the English locale", () => {
    const english = readFileSync(join(ASSETS, "Locale", "locale_en.txt"), "utf8")
    for (const { title } of Object.values(MENU_ITEMS)) assert.ok(english.includes(`"${title}" =`), title)
})

test("every building can be moved and inspected", () => {
    assert.deepEqual(menuItemsFor(undefined).slice(0, 2), [MenuItemType.Move, MenuItemType.Info])
    assert.deepEqual(menuItemsFor("decoration"), [MenuItemType.Move, MenuItemType.Info])
})

test("the state of a farm decides its action", () => {
    assert.ok(menuItemsFor("farm", "idle").includes(MenuItemType.GrowFood))
    assert.ok(menuItemsFor("farm", "finished").includes(MenuItemType.CollectFood))
    assert.ok(!menuItemsFor("farm", "working").includes(MenuItemType.GrowFood))
})

test("habitats can be upgraded and sell eggs", () => {
    const items = menuItemsFor("habitat")
    assert.ok(items.includes(MenuItemType.Upgrade) && items.includes(MenuItemType.BuyEgg))
})
