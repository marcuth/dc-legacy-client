import { Container, Graphics, Rectangle, Sprite, type FederatedPointerEvent, type FederatedWheelEvent } from "pixi.js"

import { loadBuildingArt } from "./buildingArt"
import { createBackground, createGround } from "./ground"
import { DragonActor } from "./DragonActor"
import { createDragonSkeleton, loadDragonArt } from "./skeleton/dragonArt"
import { loadHabitatPath } from "./skeleton/habitatPath"
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
    onBuildingTap?(building: WorldBuilding): void
    onEmptyTileTap?(tile: Point): void
}

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
    private buildings = new Map<string, { node: Container; itemId: number; sourceWidth: number; sourceHeight: number }>()
    private dragons: DragonActor[] = []
    private dragging: { x: number; y: number; moved: boolean; pointer: number } | null = null

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

        node.eventMode = "static"
        node.cursor = "pointer"
        node.on("pointertap", (event: FederatedPointerEvent) => {
            if (this.dragging?.moved) return
            event.stopPropagation()
            this.options.onBuildingTap?.(building)
        })
        this.nodes.addChild(node)
        this.buildings.set(building.id, {
            node,
            itemId: building.itemId,
            sourceWidth: art.texture.orig.width / PIXELS_PER_POINT,
            sourceHeight: art.texture.orig.height / PIXELS_PER_POINT,
        })
    }

    private clearDragons() {
        for (const dragon of this.dragons) dragon.skeleton.removeFromParent()
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
                    this.dragons.push(actor)
                })
            }),
        )
    }

    /** Advances the animations; call once per frame with the elapsed seconds. */
    update(deltaSeconds: number): void {
        for (const dragon of this.dragons) dragon.update(deltaSeconds)
    }

    private onDown = (event: FederatedPointerEvent) => {
        this.dragging = { x: event.global.x, y: event.global.y, moved: false, pointer: event.pointerId }
    }

    private onMove = (event: FederatedPointerEvent) => {
        const drag = this.dragging
        if (!drag || drag.pointer !== event.pointerId) return
        const dx = event.global.x - drag.x
        const dy = event.global.y - drag.y
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        drag.moved = true
        this.map.position.set(this.map.x + dx, this.map.y + dy)
        drag.x = event.global.x
        drag.y = event.global.y
    }

    private onUp = (event: FederatedPointerEvent) => {
        const drag = this.dragging
        this.dragging = null
        if (!drag || drag.moved) return
        const local = this.map.toLocal(event.global)
        this.options.onEmptyTileTap?.(pixelToTile(local.x, local.y))
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
