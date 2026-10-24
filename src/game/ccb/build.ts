import { Container, Graphics, NineSliceSprite, Sprite, type Texture } from "pixi.js"

import { sampleKeyframes } from "./animation"
import { ButtonHandle, type ButtonState } from "./button"
import { paletteColor } from "./palette"
import { DEFAULT_FONT, POPUP_BACKGROUND_FILES, type CCBResources, type LabelStyle, type LoadedFont } from "./resources"
import {
    CCBPropType,
    type CCBColor3,
    type CCBDocument,
    type CCBNode,
    type CCBSequence,
    type CCBSequenceProperty,
    type CCBValue,
} from "./types"

export type BuildOptions = {
    /** Size in points of the root's parent (the design resolution). */
    size: { width: number; height: number }
    /** Value of "multiply by resolution" units. */
    resolutionScale?: number
    /** Maps a label palette index to 0xRRGGBB; defaults to the game's own table. */
    colorOf?: (index: number) => number
    /** Builds classes the code instantiates itself (they carry no children in the ccbi). */
    createCustom?: (node: CCBNode) => Container | undefined
    /** Looks a label or button title up in the locale table (the ccbi text is the English key). */
    localize?: (text: string) => string
}

export type LabelHandle = {
    /** Current text, before localization. */
    readonly text: string
    /** Replaces the text; it is localized again unless `localized` says it already is. */
    setText(text: string, localized?: boolean): void
}

export type CCBScene = {
    root: Container
    /** Nodes assigned to a member variable in the editor, by name. */
    members: Map<string, Container>
    /** Labels assigned to a member variable. */
    labels: Map<string, LabelHandle>
    /** Buttons assigned to a member variable. */
    buttons: Map<string, ButtonHandle>
    /** Nine-slice sprites assigned to a member variable. */
    scale9: Map<string, ResizableHandle>
    /** Sprites assigned to a member variable. */
    sprites: Map<string, SpriteHandle>
    /** Every button, assigned or not, with its `ccControl` binding. */
    controls: ButtonHandle[]
    /** Content size in points of a node built by this scene. */
    sizeOf(node: Container): Dims
    sequences: CCBSequence[]
    play(sequence: string | number, onComplete?: () => void): void
    update(deltaSeconds: number): void
}

export type Dims = { width: number; height: number }

/** A sprite whose image the code swaps at runtime (button icons). */
export type SpriteHandle = {
    setTexture(texture: Texture): void
}

/** A nine-slice whose size the code changes at runtime (progress bars). */
export type ResizableHandle = { setSize(width: number, height: number): void }

type Content = {
    view: Container
    size: Dims
    handlesOpacity?: boolean
    label?: LabelHandle
    button?: ButtonHandle
    resizable?: ResizableHandle
    sprite?: SpriteHandle
}

type Animated = {
    container: Container
    animations: Map<number, CCBSequenceProperty[]>
    setPosition(x: number, y: number): void
    setScale(x: number, y: number): void
}

const BLEND_ADD = 1

const xyOf = (value: CCBValue | undefined) =>
    value &&
    (value.type === CCBPropType.Point ||
        value.type === CCBPropType.PointLock ||
        value.type === CCBPropType.Position ||
        value.type === CCBPropType.Size ||
        value.type === CCBPropType.ScaleLock)
        ? value
        : undefined

const hex = ({ r, g, b }: CCBColor3) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)

class Builder {
    readonly members = new Map<string, Container>()
    readonly labels = new Map<string, LabelHandle>()
    readonly buttons = new Map<string, ButtonHandle>()
    readonly scale9 = new Map<string, ResizableHandle>()
    readonly sprites = new Map<string, SpriteHandle>()
    readonly controls: ButtonHandle[] = []
    readonly sizes = new Map<Container, Dims>()
    readonly animated: Animated[] = []

    constructor(
        private readonly resources: CCBResources,
        private readonly options: BuildOptions,
    ) {}

    private get res() {
        return this.options.resolutionScale ?? 1
    }

    build(node: CCBNode, parent: Dims): Container {
        const prop = <T extends CCBValue["type"]>(name: string, type?: T) => {
            const found = node.properties.find((p) => p.name === name)
            return found && (type === undefined || found.value.type === type) ? found.value : undefined
        }
        const num = (name: string, fallback: number) => {
            const v = prop(name)
            return v && "value" in v && typeof v.value === "number" ? v.value : fallback
        }
        const flag = (name: string, fallback: boolean) => {
            const v = prop(name)
            return v && v.type === CCBPropType.Check ? v.value : fallback
        }

        const container = new Container({ label: node.className })
        let hasContent = false
        // Changing a node's size (a label getting new text) moves its anchor, not its position.
        const applyPivot = (size: Dims) => {
            const anchor = xyOf(prop("anchorPoint"))
            const fallbackAnchor = hasContent ? 0.5 : 0
            const ax = anchor ? anchor.x : fallbackAnchor
            const ay = anchor ? anchor.y : fallbackAnchor
            const ignoreAnchor = flag("ignoreAnchorPointForPosition", false)
            container.pivot.set(ignoreAnchor ? 0 : ax * size.width, ignoreAnchor ? size.height : (1 - ay) * size.height)
        }
        const content = this.createContent(node, parent, prop, num, applyPivot)
        hasContent = !!content
        const size = content?.size ?? this.readSize(prop("contentSize"), parent)
        if (content) container.addChild(content.view)
        applyPivot(size)
        this.sizes.set(container, size)

        const placeAt = (x: number, y: number) => {
            const p = this.readPosition({ x, y, unit: this.positionUnit(prop("position")) }, parent)
            container.position.set(p.x, parent.height - p.y)
        }
        const position = prop("position")
        if (position && "unit" in position) placeAt(position.x, position.y)
        else container.position.set(0, parent.height)

        const scale = prop("scale")
        const setScale = (x: number, y: number) => container.scale.set(x, y)
        if (scale && "lock" in scale) setScale(scale.x, scale.y)
        container.rotation = (num("rotation", 0) * Math.PI) / 180
        container.visible = flag("visible", true)
        if (!content?.handlesOpacity) container.alpha = num("opacity", 255) / 255

        const member = node.memberVar
        if (member) this.members.set(member.name, container)
        if (content?.label && member) this.labels.set(member.name, content.label)
        if (content?.resizable && member) this.scale9.set(member.name, content.resizable)
        if (content?.sprite && member) this.sprites.set(member.name, content.sprite)
        if (content?.button) {
            content.button.attach(container, size.width, size.height)
            this.controls.push(content.button)
            if (member) this.buttons.set(member.name, content.button)
        }

        if (this.options.createCustom && node.children.length === 0) {
            const custom = this.options.createCustom(node)
            if (custom) container.addChild(custom)
        }
        for (const child of node.children) container.addChild(this.build(child, size))

        if (node.animations.size > 0) {
            this.animated.push({ container, animations: node.animations, setPosition: placeAt, setScale })
        }
        return container
    }

    private positionUnit(value: CCBValue | undefined) {
        return value && "unit" in value ? value.unit : 0
    }

    private readPosition(p: { x: number; y: number; unit: number }, parent: Dims) {
        switch (p.unit) {
            case 1:
                return { x: p.x, y: parent.height - p.y }
            case 2:
                return { x: parent.width - p.x, y: parent.height - p.y }
            case 3:
                return { x: parent.width - p.x, y: p.y }
            case 4:
                return { x: (p.x * parent.width) / 100, y: (p.y * parent.height) / 100 }
            case 5:
                return { x: p.x * this.res, y: p.y * this.res }
            default:
                return { x: p.x, y: p.y }
        }
    }

    private readSize(value: CCBValue | undefined, parent: Dims): Dims {
        if (!value || value.type !== CCBPropType.Size) return { width: 0, height: 0 }
        switch (value.unit) {
            case 1:
                return { width: (value.x * parent.width) / 100, height: (value.y * parent.height) / 100 }
            case 2:
                return { width: parent.width - value.x, height: parent.height - value.y }
            case 3:
                return { width: (value.x * parent.width) / 100, height: value.y }
            case 4:
                return { width: value.x, height: (value.y * parent.height) / 100 }
            case 5:
                return { width: value.x * this.res, height: value.y * this.res }
            default:
                return { width: value.x, height: value.y }
        }
    }

    private frame(value: CCBValue | undefined): Texture | null {
        return value && value.type === CCBPropType.SpriteFrame ? this.resources.frame(value.sheet, value.file) : null
    }

    private createContent(
        node: CCBNode,
        parent: Dims,
        prop: (name: string) => CCBValue | undefined,
        num: (name: string, fallback: number) => number,
        resize: (size: Dims) => void,
    ): Content | undefined {
        const k = 1 / this.resources.assetScale
        const tint = () => {
            const c = prop("color")
            return c && c.type === CCBPropType.Color3 ? hex(c.value) : 0xffffff
        }
        const blend = () => {
            const b = prop("blendFunc")
            return b && b.type === CCBPropType.Blendmode && b.dst === BLEND_ADD ? ("add" as const) : ("normal" as const)
        }

        switch (node.className) {
            case "CCSprite":
            case "SPAnimatedSprite":
            case "SPBackgroundSprite":
            case "DCBackgroundSprite": {
                const texture = this.frame(prop("displayFrame"))
                if (!texture) return undefined
                const sprite = new Sprite(texture)
                sprite.scale.set(k)
                sprite.tint = tint()
                sprite.blendMode = blend()
                const flip = prop("flip")
                const size = { width: texture.orig.width * k, height: texture.orig.height * k }
                if (flip && flip.type === CCBPropType.Flip) {
                    if (flip.x) {
                        sprite.scale.x = -k
                        sprite.x = size.width
                    }
                    if (flip.y) {
                        sprite.scale.y = -k
                        sprite.y = size.height
                    }
                }
                sprite.alpha = num("opacity", 255) / 255
                const handle: SpriteHandle = {
                    setTexture: (next) => {
                        sprite.texture = next
                        resize({ width: next.orig.width * k, height: next.orig.height * k })
                    },
                }
                return { view: sprite, size, handlesOpacity: true, sprite: handle }
            }
            case "CCScale9Sprite": {
                const texture = this.frame(prop("spriteFrame"))
                if (!texture) return undefined
                const wanted = prop("preferedSize")
                const size = wanted && wanted.type === CCBPropType.Size ? this.readSize(wanted, parent) : { width: texture.orig.width * k, height: texture.orig.height * k }
                const slice = new NineSliceSprite({
                    texture,
                    leftWidth: num("insetLeft", 0) * this.resources.assetScale,
                    topHeight: num("insetTop", 0) * this.resources.assetScale,
                    rightWidth: num("insetRight", 0) * this.resources.assetScale,
                    bottomHeight: num("insetBottom", 0) * this.resources.assetScale,
                    width: size.width / k,
                    height: size.height / k,
                })
                slice.scale.set(k)
                slice.tint = tint()
                slice.alpha = num("opacity", 255) / 255
                const resizable: ResizableHandle = {
                    setSize: (width, height) => {
                        slice.width = width / k
                        slice.height = height / k
                        resize({ width, height })
                    },
                }
                return { view: slice, size, handlesOpacity: true, resizable }
            }
            case "DCBackgroundPopup":
                return this.createPopupBackground(this.readSize(prop("contentSize"), parent))
            case "DCLabel":
                return this.createLabel(prop, num, resize)
            case "DCButton":
            case "CCControlButton":
                return this.createButton(prop, parent)
            case "CCLayerColor": {
                const size = this.readSize(prop("contentSize"), parent)
                const c = prop("color")
                const g = new Graphics().rect(0, 0, size.width, size.height).fill(c && c.type === CCBPropType.Color3 ? hex(c.value) : 0xffffff)
                g.alpha = num("opacity", 255) / 255
                return { view: g, size, handlesOpacity: true }
            }
            case "CCLayerGradient": {
                const size = this.readSize(prop("contentSize"), parent)
                const a = prop("startColor")
                // Approximated with the start colour until vector-based gradients are needed.
                const g = new Graphics()
                    .rect(0, 0, size.width, size.height)
                    .fill(a && a.type === CCBPropType.Color3 ? hex(a.value) : 0xffffff)
                return { view: g, size }
            }
            default:
                return undefined
        }
    }

    /** DCBackgroundPopup::addImages: gradient, clipped background tile and a nine-slice frame. */
    private createPopupBackground(size: Dims): Content {
        const k = 1 / this.resources.assetScale
        const view = new Container()
        const [gradient, background, frame] = POPUP_BACKGROUND_FILES.map((file) => this.resources.frame("", file))
        const margin = 10

        if (gradient) {
            const sprite = new Sprite(gradient)
            sprite.anchor.set(0.5)
            sprite.width = size.width - margin * 2
            sprite.height = size.height - margin * 2
            sprite.position.set(size.width / 2, size.height / 2)
            view.addChild(sprite)
        }
        if (background) {
            const clipWidth = size.width - margin * 2
            const clipHeight = size.height - margin * 2
            const clip = new Container()
            clip.position.set(margin, margin)
            const mask = new Graphics().rect(0, 0, clipWidth, clipHeight).fill(0xffffff)
            clip.addChild(mask)
            clip.mask = mask
            const tile = new Sprite(background)
            tile.scale.set(k)
            // The sprite is anchored at its bottom-left corner inside the clip.
            tile.y = clipHeight - background.orig.height * k
            clip.addChild(tile)
            view.addChild(clip)
        }
        if (frame) {
            // CCScale9Sprite::create without cap insets splits the image into thirds.
            const third = (value: number) => value / 3
            const slice = new NineSliceSprite({
                texture: frame,
                leftWidth: third(frame.orig.width),
                topHeight: third(frame.orig.height),
                rightWidth: third(frame.orig.width),
                bottomHeight: third(frame.orig.height),
                width: size.width / k,
                height: size.height / k,
            })
            slice.scale.set(k)
            view.addChild(slice)
        }
        return { view, size }
    }

    private style(prop: (name: string) => CCBValue | undefined, num: (name: string, fallback: number) => number): LabelStyle {
        const colorOf = this.options.colorOf ?? paletteColor
        const flag = (name: string, fallback = false) => {
            const v = prop(name)
            return v && v.type === CCBPropType.Check ? v.value : fallback
        }
        const style: LabelStyle = { fill: colorOf(num("textColor", 1)), strokeWidth: 0 }
        if (flag("gradientVisible")) {
            style.gradientTop = colorOf(num("upperColor", 1))
            style.gradientBottom = colorOf(num("downColor", 1))
        }
        // SPLabel::variableInit enables the small stroke unless the file says otherwise.
        if (flag("smallStrokeVisible", true)) {
            style.stroke = colorOf(num("smallStrokeColor", 0))
            style.strokeWidth = 0.05 * Math.max(1, num("smallStrokeWidth", 1))
        }
        if (flag("largeStrokeVisible")) {
            style.stroke = colorOf(num("largeStrokeColor", 0))
            style.strokeWidth = 0.05 * Math.max(1, num("largeStrokeWidth", 2))
        }
        return style
    }

    private createLabel(
        prop: (name: string) => CCBValue | undefined,
        num: (name: string, fallback: number) => number,
        resize: (size: Dims) => void,
    ): Content | undefined {
        const fnt = prop("fntFile")
        const text = prop("string")
        if (!fnt || fnt.type !== CCBPropType.FntFile || !text || text.type !== CCBPropType.Text) return undefined
        const font = this.resources.font(fnt.value)
        if (!font) return undefined
        const align = ((prop("horizontalAlignment") as { value?: number } | undefined)?.value ?? 0) as 0 | 1 | 2
        const fit = prop("adjustSizeToFit")
        const style = this.style(prop, num)
        const layout: LabelLayout = {
            fontSize: num("textSize", font.font.size),
            width: num("width", 0),
            align,
            fit: !!fit && fit.type === CCBPropType.Check && fit.value,
        }

        const view = new Container()
        // The editor colour only applies when the palette colour is not set.
        const color = prop("color")
        if (!prop("textColor") && color && color.type === CCBPropType.Color3) view.tint = hex(color.value)
        view.alpha = num("opacity", 255) / 255

        const localize = this.options.localize ?? ((value: string) => value)
        let source = text.value
        const render = (shown: string) => layoutLabel(font, shown, style, layout)
        let current = render(localize(source))
        view.addChild(current.view)

        const label: LabelHandle = {
            get text() {
                return source
            },
            setText: (next, localized = false) => {
                source = next
                view.removeChildren()
                current = render(localized ? next : localize(next))
                view.addChild(current.view)
                resize(current.size)
            },
        }
        return { view, size: current.size, handlesOpacity: true, label }
    }

    private createButton(prop: (name: string) => CCBValue | undefined, parent: Dims): Content {
        const k = 1 / this.resources.assetScale
        const view = new Container()
        const textures = ([1, 2, 3] as const).map((state) => this.frame(prop(`backgroundSpriteFrame|${state}`)))
        const normal = textures[0]
        const wanted = prop("preferedSize")
        const natural = normal ? { width: normal.orig.width * k, height: normal.orig.height * k } : { width: 0, height: 0 }
        let size = wanted && wanted.type === CCBPropType.Size ? this.readSize(wanted, parent) : natural
        if (size.width === 0 && size.height === 0) size = natural

        const background = normal ? new Sprite(normal) : null
        if (background) {
            background.width = size.width
            background.height = size.height
            view.addChild(background)
        }

        const colorOf = (state: ButtonState) => {
            const c = prop(`titleColor|${state}`)
            return c && c.type === CCBPropType.Color3 ? hex(c.value) : 0xffffff
        }
        const title = new Container()
        view.addChild(title)
        const localize = this.options.localize ?? ((value: string) => value)
        const font = this.resources.font(DEFAULT_FONT)
        const sizeProp = prop("titleTTFSize|1")
        const fontSize = sizeProp && "value" in sizeProp && typeof sizeProp.value === "number" ? sizeProp.value : 26
        const anchor = xyOf(prop("labelAnchorPoint"))
        const ax = anchor ? anchor.x : 0.5
        const ay = anchor ? anchor.y : 0.5
        let titleText = ""
        let state: ButtonState = 1

        const renderTitle = () => {
            title.removeChildren()
            if (!font || !titleText) return
            const label = layoutLabel(font, titleText, { fill: colorOf(state), strokeWidth: 0 }, { fontSize, width: 0, align: 1, fit: false })
            label.view.position.set(ax * size.width - label.size.width / 2, (1 - ay) * size.height - label.size.height / 2)
            title.addChild(label.view)
        }

        const initial = prop("title|1")
        if (initial && initial.type === CCBPropType.String) titleText = initial.value ? localize(initial.value) : ""
        renderTitle()

        const buttonView = {
            setState: (next: ButtonState) => {
                state = next
                const texture = textures[next - 1] ?? normal
                if (background && texture) background.texture = texture
                renderTitle()
            },
            setTitle: (text: string) => {
                titleText = text
                renderTitle()
            },
        }
        const control = prop("ccControl")
        const zoom = prop("zoomOnTouchDown")
        const enabled = prop("enabled")
        const button = new ButtonHandle(
            buttonView,
            control && control.type === CCBPropType.BlockCCControl
                ? { selector: control.selector.replace(/:$/, ""), target: control.target, controlEvents: control.controlEvents }
                : undefined,
            !!zoom && zoom.type === CCBPropType.Check && zoom.value,
        )
        if (enabled && enabled.type === CCBPropType.Check && !enabled.value) button.setEnabled(false)
        return { view, size, button }
    }
}

type LabelLayout = { fontSize: number; width: number; align: 0 | 1 | 2; fit: boolean }

const layoutLabel = (loaded: LoadedFont, text: string, style: LabelStyle, layout: LabelLayout) => {
    const { font } = loaded
    let scale = (layout.fontSize || font.size) / font.size
    const advance = (line: string) => {
        let x = 0
        let prev = 0
        for (const ch of line) {
            const info = font.chars.get(ch.codePointAt(0)!)
            if (!info) continue
            x += (font.kernings.get(prev * 65536 + info.id) ?? 0) + info.xadvance
            prev = info.id
        }
        return x
    }

    const lines: string[] = []
    for (const paragraph of text.split("\n")) {
        if (layout.width <= 0 || layout.fit) {
            lines.push(paragraph)
            continue
        }
        let current = ""
        for (const word of paragraph.split(" ")) {
            const candidate = current ? `${current} ${word}` : word
            if (current && advance(candidate) * scale > layout.width) {
                lines.push(current)
                current = word
            } else current = candidate
        }
        lines.push(current)
    }

    const widest = Math.max(0, ...lines.map(advance))
    if (layout.fit && layout.width > 0 && widest * scale > layout.width) scale *= layout.width / (widest * scale)

    const view = new Container()
    // `width` only limits wrapping and fitting; the node is as wide as its text.
    const boxWidth = widest * scale
    lines.forEach((line, row) => {
        const lineWidth = advance(line) * scale
        let x = layout.align === 1 ? (boxWidth - lineWidth) / 2 : layout.align === 2 ? boxWidth - lineWidth : 0
        let prev = 0
        for (const ch of line) {
            const info = font.chars.get(ch.codePointAt(0)!)
            if (!info) continue
            x += (font.kernings.get(prev * 65536 + info.id) ?? 0) * scale
            const texture = loaded.glyph(info.id, style)
            if (texture && info.width > 0) {
                const glyph = new Sprite(texture)
                if (!loaded.isDistanceField) glyph.tint = style.fill
                glyph.scale.set(scale)
                glyph.position.set(x + info.xoffset * scale, (row * font.lineHeight + info.yoffset) * scale)
                view.addChild(glyph)
            }
            x += info.xadvance * scale
            prev = info.id
        }
    })
    return { view, size: { width: boxWidth, height: lines.length * font.lineHeight * scale } }
}

export const buildCCB = (doc: CCBDocument, resources: CCBResources, options: BuildOptions): CCBScene => {
    const builder = new Builder(resources, options)
    const root = builder.build(doc.root, options.size)

    let playing: { sequence: CCBSequence; time: number; onComplete?: () => void } | undefined

    const apply = () => {
        if (!playing) return
        for (const entry of builder.animated) {
            for (const prop of entry.animations.get(playing.sequence.id) ?? []) {
                const v = sampleKeyframes(prop.keyframes, playing.time)
                if (!v) continue
                switch (prop.name) {
                    case "position":
                        if (v.kind === "xy") entry.setPosition(v.x, v.y)
                        break
                    case "scale":
                        if (v.kind === "xy") entry.setScale(v.x, v.y)
                        break
                    case "rotation":
                        if (v.kind === "float") entry.container.rotation = (v.value * Math.PI) / 180
                        break
                    case "opacity":
                        if (v.kind === "byte") entry.container.alpha = v.value / 255
                        break
                    case "visible":
                        if (v.kind === "bool") entry.container.visible = v.value
                        break
                }
            }
        }
    }

    const start = (sequence: CCBSequence, onComplete?: () => void) => {
        playing = { sequence, time: 0, onComplete }
        apply()
    }

    const scene: CCBScene = {
        root,
        members: builder.members,
        labels: builder.labels,
        buttons: builder.buttons,
        scale9: builder.scale9,
        sprites: builder.sprites,
        controls: builder.controls,
        sizeOf: (node) => builder.sizes.get(node) ?? { width: 0, height: 0 },
        sequences: doc.sequences,
        play(which, onComplete) {
            const sequence = doc.sequences.find((s) => (typeof which === "number" ? s.id === which : s.name === which))
            if (!sequence) throw new Error(`Unknown sequence ${which}`)
            start(sequence, onComplete)
        },
        update(dt) {
            if (!playing) return
            playing.time += dt
            if (playing.time < playing.sequence.duration) return apply()
            playing.time = playing.sequence.duration
            apply()
            const { sequence, onComplete } = playing
            const next = doc.sequences.find((s) => s.id === sequence.chainedSequenceId)
            if (next) start(next, onComplete)
            else {
                playing = undefined
                onComplete?.()
            }
        },
    }
    if (doc.autoPlaySequenceId >= 0) scene.play(doc.autoPlaySequenceId)
    return scene
}
