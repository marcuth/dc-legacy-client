import { Container, Graphics } from "pixi.js"

import type { Dims } from "../ccb/build"
import type { CCBView } from "./CCBView"

export type Popup = {
    view: CCBView
    /** Called when the layer removes the popup, whoever closed it. */
    dispose?(): void
}

/**
 * Holds the open popups above the game. Each one gets a touch blocker covering the whole screen so
 * taps do not reach what is underneath (the game's SPTouchBlockView).
 */
export class PopupLayer {
    readonly root = new Container({ label: "PopupLayer" })
    private open = new Map<Popup, Container>()

    constructor(private readonly design: Dims) {}

    show(popup: Popup): void {
        if (this.open.has(popup)) return
        const holder = new Container()
        const blocker = new Graphics().rect(0, 0, this.design.width, this.design.height).fill({ color: 0x000000, alpha: 0.001 })
        blocker.eventMode = "static"
        holder.addChild(blocker, popup.view.center().root)
        this.root.addChild(holder)
        this.open.set(popup, holder)
    }

    close(popup: Popup): void {
        const holder = this.open.get(popup)
        if (!holder) return
        this.open.delete(popup)
        holder.removeFromParent()
        popup.dispose?.()
    }

    closeAll(): void {
        for (const popup of [...this.open.keys()]) this.close(popup)
    }

    get count() {
        return this.open.size
    }
}
