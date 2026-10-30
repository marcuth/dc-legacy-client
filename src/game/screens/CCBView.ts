import type { Container } from "pixi.js"

import { fetchAssetBuffer } from "../atlas/assetFiles"
import { buildCCB, type CCBScene, type Dims, type LabelHandle, type SpriteHandle } from "../ccb/build"
import type { ButtonHandle } from "../ccb/button"
import { parseCCB } from "../ccb/reader"
import { loadCCBResources, type CCBResources, type Variant } from "../ccb/resources"
import type { Locale } from "../locale/locale"

export type ScreenContext = {
    locale: Locale
    /** Design resolution in points (the game is authored for 480x320). */
    design: Dims
    variant?: Variant
}

/**
 * A loaded ccbi plus the glue CocosBuilder gives it in the game: members are assigned to a controller
 * object and each button's `ccControl` selector is called on it.
 */
export class CCBView {
    constructor(
        readonly scene: CCBScene,
        private readonly design: Dims,
        /** Textures of the screen, including the extra files asked for at load time. */
        readonly resources?: CCBResources,
    ) {}

    get root(): Container {
        return this.scene.root
    }

    node(name: string): Container {
        const node = this.scene.members.get(name)
        if (!node) throw new Error(`No member "${name}" in this screen`)
        return node
    }

    label(name: string): LabelHandle {
        const label = this.scene.labels.get(name)
        if (!label) throw new Error(`No label member "${name}" in this screen`)
        return label
    }

    sprite(name: string): SpriteHandle {
        const sprite = this.scene.sprites.get(name)
        if (!sprite) throw new Error(`No sprite member "${name}" in this screen`)
        return sprite
    }

    button(name: string): ButtonHandle {
        const button = this.scene.buttons.get(name)
        if (!button) throw new Error(`No button member "${name}" in this screen`)
        return button
    }

    /**
     * Assigns every member variable to `controller[name]` (labels and buttons as their handles) and routes
     * button events to the controller method named by the editor's selector. Returns an unbind function.
     */
    bind(controller: object): () => void {
        const target = controller as Record<string, unknown>
        for (const [name, node] of this.scene.members) {
            if (typeof target[name] === "function") continue
            target[name] = this.scene.labels.get(name) ?? this.scene.buttons.get(name) ?? node
        }

        const unsubscribe: (() => void)[] = []
        for (const button of this.scene.controls) {
            const { control } = button
            if (!control) continue
            unsubscribe.push(
                button.onEvent((event) => {
                    if (!(control.controlEvents & event)) return
                    const handler = target[control.selector]
                    if (typeof handler === "function") handler.call(controller, button)
                    else console.warn(`Selector "${control.selector}" is not implemented by the controller`)
                }),
            )
        }
        return () => unsubscribe.forEach((fn) => fn())
    }

    /** Centres the root's box on the design screen, like the game does for popups. */
    center(): this {
        const size = this.scene.sizeOf(this.scene.root)
        this.root.position.set(
            this.design.width / 2 + (this.root.pivot.x - size.width / 2),
            this.design.height / 2 + (this.root.pivot.y - size.height / 2),
        )
        return this
    }
}

/** A ccbi loaded once that can be instantiated many times (the map menu builds one button per entry). */
export type ScreenFactory = {
    create(): CCBView
    resources: CCBResources
}

export const loadScreenFactory = async (name: string, context: ScreenContext, extraFiles: string[] = []): Promise<ScreenFactory> => {
    const doc = parseCCB(await fetchAssetBuffer(`CCB/${name}.ccbi`))
    const resources = await loadCCBResources([doc], context.variant ?? "HD", extraFiles)
    return {
        resources,
        create: () => new CCBView(buildCCB(doc, resources, { size: context.design, localize: context.locale.tr }), context.design, resources),
    }
}

/** Loads `CCB/<name>.ccbi` with its textures and fonts. */
export const loadScreen = async (name: string, context: ScreenContext, extraFiles: string[] = []): Promise<CCBView> => {
    const doc = parseCCB(await fetchAssetBuffer(`CCB/${name}.ccbi`))
    const resources = await loadCCBResources([doc], context.variant ?? "HD", extraFiles)
    const scene = buildCCB(doc, resources, { size: context.design, localize: context.locale.tr })
    return new CCBView(scene, context.design, resources)
}
