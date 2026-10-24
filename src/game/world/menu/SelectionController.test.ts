import assert from "node:assert/strict"
import { test } from "node:test"

import type { IsoWorld, MoveState, WorldBuilding } from "../IsoWorld.ts"
import type { BuildingMenu } from "./BuildingMenu.ts"
import { MenuItemType } from "./menuItems.ts"
import { SelectionController } from "./SelectionController.ts"

const farm: WorldBuilding = { id: "2", itemId: 16, x: 22, y: 63, width: 3, height: 3 }

const setup = () => {
    const log: string[] = []
    let handlers: Parameters<IsoWorld["setHandlers"]>[0] = {}
    let press: (type: MenuItemType) => void = () => {}
    let shown: MenuItemType[] = []
    const enabled = new Map<MenuItemType, boolean>()
    let commit: { id: string; x: number; y: number } | null = { id: "2", x: 30, y: 70 }

    const world = {
        setHandlers: (next: typeof handlers) => (handlers = next),
        beginMove: (id: string) => (log.push(`begin ${id}`), true),
        commitMove: () => (log.push("commit"), commit),
        cancelMove: () => log.push("cancel"),
    } as unknown as IsoWorld
    const menu = {
        show: (types: MenuItemType[], onPress: (type: MenuItemType) => void) => ((shown = types), (press = onPress)),
        hide: () => (shown = []),
        button: (type: MenuItemType) => ({ setEnabled: (value: boolean) => enabled.set(type, value) }),
    } as unknown as BuildingMenu

    const controller = new SelectionController(world, menu, {
        groupOf: (itemId) => (itemId === 16 ? "farm" : undefined),
        saveMove: async (id, x, y) => void log.push(`save ${id} ${x},${y}`),
        onUnhandled: (type) => log.push(`unhandled ${type}`),
    })
    return {
        controller,
        log,
        enabled,
        handlers: () => handlers,
        press: (type: MenuItemType) => press(type),
        shown: () => shown,
        setCommit: (value: typeof commit) => (commit = value),
    }
}

test("tapping a building shows the buttons of its group", () => {
    const t = setup()
    t.handlers().onBuildingTap!(farm)
    assert.deepEqual(t.shown(), [MenuItemType.Move, MenuItemType.Info, MenuItemType.Upgrade, MenuItemType.GrowFood])
    assert.equal(t.controller.current, farm)
})

test("tapping the ground hides them", () => {
    const t = setup()
    t.handlers().onBuildingTap!(farm)
    t.handlers().onEmptyTileTap!({ x: 1, y: 1 })
    assert.deepEqual(t.shown(), [])
    assert.equal(t.controller.current, null)
})

test("MOVE swaps the buttons for OK and CANCEL, and OK saves the new place", () => {
    const t = setup()
    t.handlers().onBuildingTap!(farm)
    t.press(MenuItemType.Move)
    assert.deepEqual(t.shown(), [MenuItemType.Ok, MenuItemType.Cancel])
    t.press(MenuItemType.Ok)
    assert.deepEqual(t.log, ["begin 2", "commit", "save 2 30,70"])
    assert.equal(t.shown()[0], MenuItemType.Move)
})

test("CANCEL puts the building back and shows its buttons again", () => {
    const t = setup()
    t.handlers().onBuildingTap!(farm)
    t.press(MenuItemType.Move)
    t.press(MenuItemType.Cancel)
    assert.deepEqual(t.log, ["begin 2", "cancel"])
    assert.equal(t.shown()[0], MenuItemType.Move)
})

test("OK does nothing while the place is taken, and the button follows validity", () => {
    const t = setup()
    t.handlers().onBuildingTap!(farm)
    t.press(MenuItemType.Move)
    t.setCommit(null)
    t.press(MenuItemType.Ok)
    assert.deepEqual(t.shown(), [MenuItemType.Ok, MenuItemType.Cancel])
    assert.ok(!t.log.some((entry) => entry.startsWith("save")))

    const state: MoveState = { id: "2", original: { x: 22, y: 63 }, current: { x: 23, y: 63 }, valid: false }
    t.handlers().onMoveChange!(state)
    assert.equal(t.enabled.get(MenuItemType.Ok), false)
})

test("buttons without an action are reported", () => {
    const t = setup()
    t.handlers().onBuildingTap!(farm)
    t.press(MenuItemType.Upgrade)
    assert.deepEqual(t.log, [`unhandled ${MenuItemType.Upgrade}`])
})
