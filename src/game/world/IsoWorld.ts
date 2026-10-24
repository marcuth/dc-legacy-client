import { Container, Graphics, Rectangle, Sprite, Texture, type FederatedPointerEvent, type FederatedWheelEvent } from "pixi.js"

import { loadBuildingArt } from "./buildingArt"
import { loadTouchMask } from "./touchMaskLoader"
import type { TouchMask } from "./touchMask"
import { createBackground, createGround } from "./ground"
import { DragonActor } from "./DragonActor"
import { createDragonSkeleton, loadDragonArt } from "./skeleton/dragonArt"
import { loadHabitatPath } from "./skeleton/habitatPath"
import { coversTile, overlaps, snapMove, type Footprint } from "./footprint"
import { nodeZIndex, pixelToTile, tileToPixel, type Point } from "./iso"

/** `LoadState::createGraphicScene` passes 0.3 and 1.5 as the zoom limits and sets the layer scale to 0.6. */
const MIN_ZOOM = 0.3
const MAX_ZOOM = 1.5
const START_ZOOM = 0.6
/** The default view is centred on this tile (derived from the layer position (900, 850) of the original). */
const START_TILE: Point = { x: 22, y: 63 }
/** Taps that moved less than this many pixels are not drags. */
const DRAG_THRESHOLD = 6
/** HD art has two pixels per point. */
const PIXELS_PER_POINT = 2
const DESIGN = { width: 480, height: 320 }

export type WorldBuilding = {
    id: string
    itemId: number
    /** Tile of the front corner: the building covers x - width + 1 .. x and y - height + 1 .. y. */
    x: number
    y: number
    width: number
    height: number
}

export type WorldDragon = {
    id: string
    /** Item id of the dragon (1011 is the earth dragon). */
    itemId: number
    /** Id of the habitat building the dragon lives in. */
    habitatId: string
}

export type IsoWorldOptions = {
    /** Draws the footprint of every building (useful to check the art against the tile grid). */
    debugFootprints?: boolean
    /** Tints the touchable pixels of every building (useful to check the masks against the art). */
    debugMasks?: boolean
    /** Called whenever the building being moved changes tile or becomes (in)valid; null when the move ends. */
    onMoveChange?(move: MoveState | null): void
    onBuildingTap?(building: WorldBuilding): void
    onDragonTap?(dragon: WorldDragon): void
    onEmptyTileTap?(tile: Point): void
}

/** A building being dragged to a new place (the original's move state, confirmed with OK or CANCEL). */
export type MoveState = { id: string; original: Point; current: Point; valid: boolean }

/** Tint of a building that cannot be dropped where it is. */
const INVALID_TINT = 0xff7777

/** What is under a point of the map, from front to back: dragons, buildings (by mask or by tile), then the ground. */
export type WorldHit = { kind: "dragon"; dragon: WorldDragon } | { kind: "building"; building: WorldBuilding } | { kind: "tile"; tile: Point }

type BuildingEntry = {
    building: WorldBuilding
    node: Container
    sprite: Sprite
    itemId: number
    sourceWidth: number
    sourceHeight: number
    /** Null when the APK has no mask: touches then use the tiles of the footprint. */
    mask: TouchMask | null
}

/** Tint of the selected building (stands in for `IsoBuilding::setDefaultSelectionColour`). */
const SELECTED_TINT = 0xffffaa

/**
 * The island: sky, ground and buildings in map pixels (points), with the pan and zoom of `hydra::GraphicScene`.
 * `view` fills the window; the map inside is scaled by `zoom` times the points-to-pixels factor.
 */
export class IsoWorld {
    readonly view = new Container({ label: "IsoWorld" })
    private readonly map = new Container({ label: "map" })
    private readonly nodes = new Container({ label: "nodes", sortableChildren: true })
    private background: Sprite | null = null
    private width = DESIGN.width
    private height = DESIGN.height
    private zoom = START_ZOOM
    private buildings = new Map<string, BuildingEntry>()
    private dragons: { actor: DragonActor; dragon: WorldDragon }[] = []
    private selected: string | null = null
    private dragging: { x: number; y: number; moved: boolean; pointer: number; building?: Point } | null = null
    private move: MoveState | null = null

    /** Replaces the callbacks (they often need objects built after the world). */
    setHandlers(handlers: Pick<IsoWorldOptions, "onBuildingTap" | "onDragonTap" | "onEmptyTileTap" | "onMoveChange">): void {
        Object.assign(this.options, handlers)
    }

    constructor(private readonly options: IsoWorldOptions = {}) {
        this.view.eventMode = "static"
        this.view.on("pointerdown", this.onDown)
        this.view.on("globalpointermove", this.onMove)
        this.view.on("pointerup", this.onUp)
        this.view.on("pointerupoutside", this.onUp)
        this.view.on("wheel", this.onWheel)
        this.map.addChild(this.nodes)
    }

    async load(): Promise<void> {
        const [background, ground] = await Promise.all([createBackground(), createGround()])
        this.background = background
        this.view.addChildAt(background, 0)
        this.map.addChildAt(ground, 0)
        this.view.addChild(this.map)
        this.resize(this.width, this.height)
        this.centerOnTile(START_TILE)
    }

    /** Fits the world to the window. Keeps the tile in the middle of the screen where it was. */
    resize(width: number, height: number): void {
        const centre = this.tileAtCentre()
        this.width = width
        this.height = height
        this.view.hitArea = new Rectangle(0, 0, width, height)
        if (this.background) {
            // The sky covers the window.
            const cover = Math.max(width / this.background.texture.orig.width, height / this.background.texture.orig.height)
            this.background.scale.set(cover)
            this.background.position.set((width - this.background.width) / 2, (height - this.background.height) / 2)
        }
        this.applyScale()
        this.centerOnTile(centre)
    }

    /** Pixels per map point: the points-to-window factor of the 480 x 320 design times the zoom. */
    private get scale() {
        return Math.min(this.width / DESIGN.width, this.height / DESIGN.height) * this.zoom
    }

    private applyScale() {
        this.map.scale.set(this.scale)
    }

    centerOnTile(tile: Point): void {
        const pixel = tileToPixel(tile.x, tile.y)
        this.map.position.set(this.width / 2 - pixel.x * this.scale, this.height / 2 - pixel.y * this.scale)
    }

    tileAtCentre(): Point {
        const x = (this.width / 2 - this.map.x) / this.scale
        const y = (this.height / 2 - this.map.y) / this.scale
        // Continuous coordinates, not ceiled, so re-centring is exact.
        return { x: (y / 13.5 + x / 27) / 2, y: (y / 13.5 - x / 27) / 2 }
    }

    /** Replaces the buildings with `list`; art is loaded as it arrives. */
    async setBuildings(list: WorldBuilding[]): Promise<void> {
        this.clearDragons()
        for (const { node } of this.buildings.values()) node.removeFromParent()
        this.buildings.clear()
        await Promise.all(list.map((building) => this.addBuilding(building)))
    }

    private async addBuilding(building: WorldBuilding): Promise<void> {
        const art = await loadBuildingArt(building.itemId)
        const sourceWidth = art.texture.orig.width / PIXELS_PER_POINT
        const sourceHeight = art.texture.orig.height / PIXELS_PER_POINT
        const mask = art.placeholder ? null : await loadTouchMask(building.itemId, sourceWidth)
        const node = new Container({ label: `building ${building.id}` })
        const feet = tileToPixel(building.x, building.y)
        node.position.set(feet.x, feet.y)
        node.zIndex = nodeZIndex(building.x, building.y, building.width)

        if (this.options.debugFootprints) {
            const near = tileToPixel(0, 0)
            const east = tileToPixel(0, -building.height)
            const far = tileToPixel(-building.width, -building.height)
            const west = tileToPixel(-building.width, 0)
            node.addChild(
                new Graphics()
                    .poly([near.x, near.y, east.x, east.y, far.x, far.y, west.x, west.y])
                    .fill({ color: 0xffffff, alpha: 0.25 })
                    .stroke({ color: 0xffff00, width: 1 }),
            )
        }

        const sprite = new Sprite(art.texture)
        sprite.anchor.set(0.5, 1)
        sprite.scale.set(art.placeholder ? 0.5 : 1 / PIXELS_PER_POINT)
        node.addChild(sprite)

        if (this.options.debugMasks && mask) {
            const overlay = new Sprite(this.maskTexture(mask))
            overlay.position.set(-sourceWidth / 2, -sourceHeight)
            overlay.alpha = 0.45
            overlay.tint = 0xff0000
            node.addChild(overlay)
        }

        this.nodes.addChild(node)
        this.buildings.set(building.id, { building, node, sprite, itemId: building.itemId, sourceWidth, sourceHeight, mask })
        if (this.selected === building.id) sprite.tint = SELECTED_TINT
    }

    private maskTexture(mask: TouchMask): Texture {
        const canvas = document.createElement("canvas")
        canvas.width = mask.width
        canvas.height = mask.height
        const context = canvas.getContext("2d")!
        const image = context.createImageData(mask.width, mask.height)
        image.data.set(mask.toRgba())
        context.putImageData(image, 0, 0)
        return Texture.from(canvas)
    }

    private clearDragons() {
        for (const { actor } of this.dragons) actor.skeleton.removeFromParent()
        this.dragons = []
    }

    /** Puts dragons into their habitats, walking the paths of the original game. Dragons without art are skipped. */
    async setDragons(list: WorldDragon[]): Promise<void> {
        this.clearDragons()
        const perHabitat = new Map<string, WorldDragon[]>()
        for (const dragon of list) perHabitat.set(dragon.habitatId, [...(perHabitat.get(dragon.habitatId) ?? []), dragon])

        await Promise.all(
            [...perHabitat].flatMap(([habitatId, residents]) => {
                const habitat = this.buildings.get(habitatId)
                if (!habitat) return []
                return residents.map(async (dragon, index) => {
                    const [art, path] = await Promise.all([loadDragonArt(dragon.itemId), loadHabitatPath(habitat.itemId)])
                    if (!art || !path) return
                    const skeleton = createDragonSkeleton(art)
                    // The path is measured from the top-left corner of the building image, y up.
                    const actor = new DragonActor(skeleton, path, { x: -habitat.sourceWidth / 2, y: -habitat.sourceHeight }, index / residents.length)
                    actor.skeleton.zIndex = 1
                    habitat.node.addChild(actor.skeleton)
                    this.dragons.push({ actor, dragon })
                })
            }),
        )
    }

    /** Advances the animations; call once per frame with the elapsed seconds. */
    update(deltaSeconds: number): void {
        for (const { actor } of this.dragons) actor.update(deltaSeconds)
    }

    private onDown = (event: FederatedPointerEvent) => {
        this.dragging = { x: event.global.x, y: event.global.y, moved: false, pointer: event.pointerId }
        const move = this.move
        const entry = move && this.buildings.get(move.id)
        if (move && entry) {
            const hit = this.hitTest(event.global)
            if (hit.kind === "building" && hit.building.id === move.id) {
                // Grabbing the building: it keeps the point under the finger.
                const pointer = this.continuousTile(event.global)
                this.dragging.building = { x: move.current.x - pointer.x, y: move.current.y - pointer.y }
            }
        }
    }

    /** Continuous tile coordinates under a window position (not ceiled, unlike `pixelToTile`). */
    private continuousTile(global: Point): Point {
        const local = this.map.toLocal(global)
        return { x: (local.y / 13.5 + local.x / 27) / 2, y: (local.y / 13.5 - local.x / 27) / 2 }
    }

    private onMove = (event: FederatedPointerEvent) => {
        const drag = this.dragging
        if (!drag || drag.pointer !== event.pointerId) return
        const dx = event.global.x - drag.x
        const dy = event.global.y - drag.y
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        drag.moved = true
        if (drag.building && this.move) {
            this.moveTo(snapMove(this.continuousTile(event.global), drag.building))
            return
        }
        this.map.position.set(this.map.x + dx, this.map.y + dy)
        drag.x = event.global.x
        drag.y = event.global.y
    }

    private onUp = (event: FederatedPointerEvent) => {
        const drag = this.dragging
        this.dragging = null
        if (!drag || drag.moved) return
        // While a building is being moved, taps do not select anything else.
        if (this.move) return

        const hit = this.hitTest(event.global)
        if (hit.kind === "dragon") this.options.onDragonTap?.(hit.dragon)
        else if (hit.kind === "building") {
            this.select(hit.building.id)
            this.options.onBuildingTap?.(hit.building)
        } else {
            this.select(null)
            this.options.onEmptyTileTap?.(hit.tile)
        }
    }

    /**
     * What a tap at window position `global` touches (`GraphicScene::performMaskBasedTouchDetection`): buildings are
     * tried from the front, each by the pixels of its mask, or by the tiles it covers when it has none.
     */
    hitTest(global: Point): WorldHit {
        for (const { actor, dragon } of this.dragons) {
            if (actor.skeleton.getBounds().containsPoint(global.x, global.y)) return { kind: "dragon", dragon }
        }

        const local = this.map.toLocal(global)
        const tile = pixelToTile(local.x, local.y)
        const front = [...this.buildings.values()].sort((a, b) => b.node.zIndex - a.node.zIndex)
        for (const entry of front) {
            if (entry.mask) {
                // The mask is aligned with the top-left corner of the building image; the node stands on its bottom centre.
                const x = Math.floor(local.x - entry.node.x + entry.sourceWidth / 2)
                const y = Math.floor(local.y - entry.node.y + entry.sourceHeight)
                if (entry.mask.isTouchable(x, y)) return { kind: "building", building: entry.building }
            } else if (coversTile(entry.building, tile)) {
                return { kind: "building", building: entry.building }
            }
        }
        return { kind: "tile", tile }
    }

    get moving(): MoveState | null {
        return this.move
    }

    /** Starts dragging a building. Its footprint is checked against the others while it moves. */
    beginMove(id: string): boolean {
        const entry = this.buildings.get(id)
        if (!entry || this.move) return false
        const at = { x: entry.building.x, y: entry.building.y }
        this.move = { id, original: at, current: at, valid: true }
        this.select(id)
        this.options.onMoveChange?.(this.move)
        return true
    }

    private moveTo(tile: Point) {
        const move = this.move
        const entry = move && this.buildings.get(move.id)
        if (!move || !entry || (tile.x === move.current.x && tile.y === move.current.y)) return

        const candidate: Footprint = { ...entry.building, x: tile.x, y: tile.y }
        const valid = ![...this.buildings.values()].some((other) => other !== entry && overlaps(candidate, other.building))
        const feet = tileToPixel(tile.x, tile.y)
        entry.node.position.set(feet.x, feet.y)
        entry.node.zIndex = nodeZIndex(tile.x, tile.y, entry.building.width)
        entry.sprite.tint = valid ? SELECTED_TINT : INVALID_TINT
        this.move = { ...move, current: tile, valid }
        this.options.onMoveChange?.(this.move)
    }

    /** Drops the building where it is. Returns null (and keeps moving) when that place is taken. */
    commitMove(): { id: string; x: number; y: number } | null {
        const move = this.move
        const entry = move && this.buildings.get(move.id)
        if (!move || !entry || !move.valid) return null
        entry.building.x = move.current.x
        entry.building.y = move.current.y
        entry.sprite.tint = SELECTED_TINT
        this.move = null
        this.options.onMoveChange?.(null)
        return { id: move.id, x: move.current.x, y: move.current.y }
    }

    /** Puts the building back where it was. */
    cancelMove(): void {
        const move = this.move
        const entry = move && this.buildings.get(move.id)
        if (!move || !entry) return
        const feet = tileToPixel(move.original.x, move.original.y)
        entry.node.position.set(feet.x, feet.y)
        entry.node.zIndex = nodeZIndex(move.original.x, move.original.y, entry.building.width)
        entry.sprite.tint = SELECTED_TINT
        this.move = null
        this.options.onMoveChange?.(null)
    }

    /** Highlights one building (or none). */
    select(id: string | null): void {
        if (this.selected) {
            const previous = this.buildings.get(this.selected)
            if (previous) previous.sprite.tint = 0xffffff
        }
        this.selected = id
        const current = id ? this.buildings.get(id) : undefined
        if (current) current.sprite.tint = SELECTED_TINT
    }

    private onWheel = (event: FederatedWheelEvent) => {
        const factor = Math.exp(-event.deltaY * 0.001)
        this.zoomAt(this.zoom * factor, event.global)
    }

    /** Zooms keeping the map point under `anchor` where it is. */
    zoomAt(zoom: number, anchor: Point): void {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
        const before = this.scale
        const mapX = (anchor.x - this.map.x) / before
        const mapY = (anchor.y - this.map.y) / before
        this.zoom = next
        this.applyScale()
        this.map.position.set(anchor.x - mapX * this.scale, anchor.y - mapY * this.scale)
    }
}
