import { Sprite, type Texture } from "pixi.js"

import { loadScreen, type ScreenContext } from "./CCBView"
import { formatDuration } from "./format"
import type { Popup, PopupLayer } from "./PopupLayer"

/**
 * Shows a popup, wires its buttons and resolves with whichever one the player pressed. The controller
 * method names are the selectors stored in the ccbi.
 */
const present = async <Result extends string>(
    name: string,
    context: ScreenContext,
    layer: PopupLayer,
    setUp: (popup: Popup, finish: (result: Result) => void) => Record<string, (...args: never[]) => void>,
    extraFiles: string[] = [],
): Promise<Result> => {
    const view = await loadScreen(name, context, extraFiles)
    return new Promise<Result>((resolve) => {
        const popup: Popup = { view }
        let unbind = () => {}
        const finish = (result: Result) => {
            unbind()
            layer.close(popup)
            resolve(result)
        }
        unbind = view.bind(setUp(popup, finish))
        layer.show(popup)
    })
}

/** Popups/ConfirmAccountPopUpView: which of two accounts to keep after logging in. */
export const confirmAccount = (
    context: ScreenContext,
    layer: PopupLayer,
    levels: { chosen: number; other: number },
): Promise<"yes" | "no" | "close"> =>
    present("Popups/ConfirmAccountPopUpView", context, layer, (popup, finish) => {
        popup.view
            .label("messageLabel")
            .setText(
                context.locale.format(
                    "Do you want to continue with your Level %d account?\nWarning: The progress of the other Level %d account will be deleted!",
                    levels.chosen,
                    levels.other,
                ),
                true,
            )
        return {
            onYesButton: () => finish("yes"),
            onNoButton: () => finish("no"),
            onCloseButton: () => finish("close"),
        }
    })

/** Popups/PlaceSellPopUpView: confirms selling a building (`questionLabel`, `onSellButton`, `closeButton`). */
export const placeSell = (
    context: ScreenContext,
    layer: PopupLayer,
    sale: { name: string; gold: number },
): Promise<"sell" | "close"> =>
    present("Popups/PlaceSellPopUpView", context, layer, (popup, finish) => {
        popup.view
            .label("questionLabel")
            .setText(context.locale.format("Are you sure you want to sell %s for %d gold?", sale.name, sale.gold), true)
        return {
            onSellButton: () => finish("sell"),
            onCloseButton: () => finish("close"),
        }
    })

const EARNING_ICONS = { food: "Icons/Food/ic-food.png", gold: "Icons/Gold/ic-gold.png" }

/** Scales `texture` to fit inside a placeholder node and centres it there. */
const fitInto = (texture: Texture, slot: { width: number; height: number }) => {
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5)
    sprite.scale.set(Math.min(slot.width / texture.width, slot.height / texture.height, 1))
    sprite.position.set(slot.width / 2, slot.height / 2)
    return sprite
}

/**
 * Popups/UpgradeBuildingPopupView: the building, what it will yield afterwards and the gems the upgrade costs.
 * `earnings` is null for buildings that yield nothing (the hatchery); the popup then shows no earnings block.
 */
export const upgradeBuilding = (
    context: ScreenContext,
    layer: PopupLayer,
    upgrade: {
        name: string
        art: Texture
        earnings: { kind: keyof typeof EARNING_ICONS; amount: number } | null
        gemCost: number
        gems: number
    },
): Promise<"upgrade" | "close"> =>
    present(
        "Popups/UpgradeBuildingPopupView",
        context,
        layer,
        (popup, finish) => {
            const { view } = popup
            view.label("titleLabel").setText("BUILDING UPGRADE", true)
            view.label("itemLabel").setText(upgrade.name, true)
            view.label("upgradeForValueLabel").setText(String(upgrade.gemCost), true)
            view.button("upgradeButton").setEnabled(upgrade.gems >= upgrade.gemCost)

            const item = view.node("itemPlaceholder")
            item.addChild(fitInto(upgrade.art, view.scene.sizeOf(item)))

            // The second earnings block is for buildings with two yields; none of the known ones has that.
            view.node("twoEarningsNode").visible = false
            const one = view.node("oneEarningNode")
            one.visible = upgrade.earnings !== null
            view.node("earningsLabel").visible = upgrade.earnings !== null
            if (upgrade.earnings) {
                view.label("oneEarningValue").setText(String(upgrade.earnings.amount), true)
                const icon = view.resources?.frame("", EARNING_ICONS[upgrade.earnings.kind])
                if (icon) {
                    const slot = view.node("oneEarningPlaceholder")
                    slot.addChild(fitInto(icon, view.scene.sizeOf(slot)))
                }
            }
            return {
                onUpgradeButton: () => finish("upgrade"),
                onCloseButton: () => finish("close"),
            }
        },
        Object.values(EARNING_ICONS),
    )

/** Popups/BreedingSpeedUpPopUpView: pay gems to finish breeding now. */
export const breedingSpeedUp = (
    context: ScreenContext,
    layer: PopupLayer,
    breeding: { secondsLeft: number; gemCost: number; gems: number },
): Promise<"speedUp" | "close"> =>
    present("Popups/BreedingSpeedUpPopUpView", context, layer, (popup, finish) => {
        popup.view
            .label("infoLabel")
            .setText(
                context.locale.format(
                    "Breeding will finish in %s, do you want\nto finish it now for %d gems?",
                    formatDuration(breeding.secondsLeft),
                    breeding.gemCost,
                ),
                true,
            )
        popup.view.label("speedUpValueLabel").setText(String(breeding.gemCost), true)
        popup.view.button("speedUpButton").setEnabled(breeding.gems >= breeding.gemCost)
        return {
            onSpeedUpButton: () => finish("speedUp"),
            onCloseButton: () => finish("close"),
        }
    })
