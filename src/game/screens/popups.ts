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
): Promise<Result> => {
    const view = await loadScreen(name, context)
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
