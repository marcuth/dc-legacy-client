import { Container } from "pixi.js"

import { ControlEvent, type ButtonHandle } from "../../ccb/button"
import type { Dims } from "../../ccb/build"
import { loadScreenFactory, type CCBView, type ScreenContext, type ScreenFactory } from "../../screens/CCBView"
import { MENU_ITEMS, MenuItemType } from "./menuItems"

/** Width of a `HUDButton` (contentSize 50 x 57) and the gap the row leaves between buttons. */
const BUTTON_WIDTH = 50
const GAP = 6
/** `selectedBuildingButtonsPlaceholder` of the HUD: a strip 5 points above the bottom edge. */
const BOTTOM_MARGIN = 5

/** The row of round buttons shown under the selected building (`HUDButton` instances, one per `MenuItemInfo`). */
export class BuildingMenu {
    readonly root = new Container({ label: "BuildingMenu" })
    private views = new Map<MenuItemType, CCBView>()

    private constructor(
        private readonly factory: ScreenFactory,
        private readonly design: Dims,
    ) {}

    static async create(context: ScreenContext): Promise<BuildingMenu> {
        const icons = Object.values(MENU_ITEMS).map((item) => item.icon)
        return new BuildingMenu(await loadScreenFactory("MainMenu/HUDButton", context, icons), context.design)
    }

    /** Shows `types` side by side, centred. `onPress` gets the type of the button the player tapped. */
    show(types: MenuItemType[], onPress: (type: MenuItemType) => void): void {
        this.hide()
        const total = types.length * BUTTON_WIDTH + (types.length - 1) * GAP
        const left = (this.design.width - total) / 2

        types.forEach((type, index) => {
            const view = this.factory.create()
            const item = MENU_ITEMS[type]
            const icon = this.factory.resources.frame("", item.icon)
            if (icon) view.sprite("image").setTexture(icon)
            view.label("title").setText(item.title)

            view.button("button").onEvent((event) => {
                if (event === ControlEvent.TouchUpInside) onPress(type)
            })
            // The root hangs from its bottom-left corner.
            view.root.position.set(left + index * (BUTTON_WIDTH + GAP), this.design.height - BOTTOM_MARGIN)
            this.root.addChild(view.root)
            this.views.set(type, view)
        })
    }

    hide(): void {
        this.root.removeChildren()
        this.views.clear()
    }

    get visible(): MenuItemType[] {
        return [...this.views.keys()]
    }

    /** The button of a type that is on show (to enable or disable it). */
    button(type: MenuItemType): ButtonHandle | undefined {
        return this.views.get(type)?.button("button")
    }
}
