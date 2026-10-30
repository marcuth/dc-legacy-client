import type { WorldBuilding, IsoWorld, MoveState } from "../IsoWorld"
import type { BuildingMenu } from "./BuildingMenu"
import { MenuItemType, menuItemsFor, type BuildingState } from "./menuItems"

export type SelectionOptions = {
    /** `group_type` of an item in the catalog (farm, habitat, incubator...). */
    groupOf(itemId: number): string | undefined
    /** State of a building for the menu (idle until the game tracks work). */
    stateOf?(building: WorldBuilding): BuildingState
    /** Sends the `move` command; resolved when the server has answered. */
    saveMove(id: string, x: number, y: number): Promise<void>
    /** Buttons the owner handles (popups and commands); a sold building calls `deselect`. */
    actions?: Partial<Record<MenuItemType, (building: WorldBuilding) => void>>
    /** Buttons whose action is not implemented yet land here. */
    onUnhandled?(type: MenuItemType, building: WorldBuilding): void
}

/**
 * Glue between the island and the button row: tapping a building shows its buttons, MOVE turns them into OK and
 * CANCEL while the building is dragged, tapping the ground hides them (`DCMap::selectNode` / `changeMenuButtons`).
 */
export class SelectionController {
    private selected: WorldBuilding | null = null

    constructor(
        private readonly world: IsoWorld,
        private readonly menu: BuildingMenu,
        private readonly options: SelectionOptions,
    ) {
        world.setHandlers({
            onBuildingTap: (building) => this.select(building),
            onEmptyTileTap: () => this.clear(),
            onMoveChange: (move) => this.moveChanged(move),
        })
    }

    private select(building: WorldBuilding) {
        this.selected = building
        const state = this.options.stateOf?.(building) ?? "idle"
        this.menu.show(menuItemsFor(this.options.groupOf(building.itemId), state), (type) => this.press(type, building))
    }

    /** Hides the buttons and the highlight (after the building is gone). */
    deselect() {
        this.world.select(null)
        this.clear()
    }

    private clear() {
        this.selected = null
        this.menu.hide()
    }

    private press(type: MenuItemType, building: WorldBuilding) {
        switch (type) {
            case MenuItemType.Move:
                if (this.world.beginMove(building.id)) {
                    this.menu.show([MenuItemType.Ok, MenuItemType.Cancel], (next) => this.press(next, building))
                }
                break
            case MenuItemType.Ok: {
                const moved = this.world.commitMove()
                if (!moved) break
                void this.options.saveMove(moved.id, moved.x, moved.y)
                this.select(building)
                break
            }
            case MenuItemType.Cancel:
                this.world.cancelMove()
                this.select(building)
                break
            default: {
                const action = this.options.actions?.[type]
                if (action) action(building)
                else this.options.onUnhandled?.(type, building)
            }
        }
    }

    private moveChanged(move: MoveState | null) {
        if (move) this.menu.button(MenuItemType.Ok)?.setEnabled(move.valid)
    }

    get current(): WorldBuilding | null {
        return this.selected
    }
}
