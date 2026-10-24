import { Rectangle, type Container, type FederatedPointerEvent } from "pixi.js"

/** CCControlEvent bit flags. */
export const ControlEvent = {
    TouchDown: 1,
    DragInside: 2,
    DragOutside: 4,
    DragEnter: 8,
    DragExit: 16,
    TouchUpInside: 32,
    TouchUpOutside: 64,
    TouchCancel: 128,
} as const

/** The editor's `ccControl` block: which method of which object a button calls, and on what event. */
export type ControlBinding = {
    selector: string
    /** 1 = document root, 2 = owner. */
    target: number
    controlEvents: number
}

/** Visual states, numbered like the `|1`, `|2`, `|3` property suffixes. */
export type ButtonState = 1 | 2 | 3

export type ButtonView = {
    setState(state: ButtonState): void
    setTitle(text: string): void
}

const ZOOM_ON_TOUCH = 1.1

/** A CCControlButton: normal / highlighted / disabled look, optional zoom, and control events. */
export class ButtonHandle {
    private listeners = new Set<(event: number) => void>()
    private _enabled = true
    private pressed = false
    private restoreScale = { x: 1, y: 1 }
    container: Container | null = null

    constructor(
        private readonly view: ButtonView,
        readonly control: ControlBinding | undefined,
        private readonly zoomOnTouchDown: boolean,
    ) {}

    get enabled() {
        return this._enabled
    }

    setEnabled(enabled: boolean) {
        this._enabled = enabled
        this.view.setState(enabled ? 1 : 3)
        if (this.container) this.container.cursor = enabled ? "pointer" : "default"
    }

    setTitle(text: string) {
        this.view.setTitle(text)
    }

    /** Subscribes to every control event; the listener gets the CCControlEvent flag that fired. */
    onEvent(listener: (event: number) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /** Fires touch-up-inside as if the player had tapped the button. */
    click() {
        if (this._enabled) this.emit(ControlEvent.TouchUpInside)
    }

    attach(container: Container, width: number, height: number) {
        this.container = container
        container.eventMode = "static"
        container.cursor = "pointer"
        container.hitArea = new Rectangle(0, 0, width, height)

        const release = (event: number) => {
            if (!this.pressed) return
            this.pressed = false
            this.view.setState(this._enabled ? 1 : 3)
            if (this.zoomOnTouchDown) container.scale.set(this.restoreScale.x, this.restoreScale.y)
            this.emit(event)
        }
        container.on("pointerdown", (_event: FederatedPointerEvent) => {
            if (!this._enabled) return
            this.pressed = true
            this.view.setState(2)
            if (this.zoomOnTouchDown) {
                this.restoreScale = { x: container.scale.x, y: container.scale.y }
                container.scale.set(this.restoreScale.x * ZOOM_ON_TOUCH, this.restoreScale.y * ZOOM_ON_TOUCH)
            }
            this.emit(ControlEvent.TouchDown)
        })
        container.on("pointerup", () => release(ControlEvent.TouchUpInside))
        container.on("pointerupoutside", () => release(ControlEvent.TouchUpOutside))
    }

    private emit(event: number) {
        for (const listener of this.listeners) listener(event)
    }
}
