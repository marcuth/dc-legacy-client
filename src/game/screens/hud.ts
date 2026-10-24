import type { GameStore } from "../core/gameStore"
import { formatCount, levelProgress } from "./format"
import { loadScreen, type CCBView, type ScreenContext } from "./CCBView"

export type HudActions = {
    onFood?(): void
    onGold?(): void
    onGems?(): void
    onSettings?(): void
}

/** MainMenu/HUD: the resources bar, kept in sync with the store. Returns the view and a disposer. */
export const createHud = async (
    context: ScreenContext,
    store: GameStore,
    actions: HudActions = {},
): Promise<{ view: CCBView; dispose(): void }> => {
    const view = await loadScreen("MainMenu/HUD", context)
    const controller = {
        onFoodClicked: () => actions.onFood?.(),
        onMoneyClicked: () => actions.onGold?.(),
        onGemsClicked: () => actions.onGems?.(),
        onSettingsClicked: () => actions.onSettings?.(),
    }
    const unbind = view.bind(controller)

    const refresh = () => {
        const resources = store.getSnapshot()
        if (!resources) return
        view.label("foodLabel").setText(formatCount(resources.food), true)
        view.label("moneyLabel").setText(formatCount(resources.gold), true)
        view.label("gemsLabel").setText(formatCount(resources.cash), true)
        view.label("levelLabel").setText(String(resources.level), true)
        view.label("experienceLabel").setText(formatCount(resources.xp), true)
        // The bar layer is anchored on its left edge, so scaling it fills it from the left.
        view.node("experienceBarLayer").scale.x = levelProgress(resources)
    }
    refresh()
    const unsubscribe = store.subscribe(refresh)

    return {
        view,
        dispose() {
            unsubscribe()
            unbind()
        },
    }
}
