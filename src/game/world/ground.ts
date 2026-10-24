import { Container, Sprite } from "pixi.js"

import { loadAtlas } from "../atlas/AtlasLoader"
import { tileToPixel } from "./iso"

/** `MapLayer::init` always builds the ground from the atlas named "night_islands" (libdc.so @0x4485b4). */
const GROUND_ATLAS = "HD/Engine/s3tc/night_islands.plist"
const BACKGROUND_ATLAS = "HD/Engine/s3tc/night_background.plist"

/** `MapPartManager::placeMap` @0x446ad8: an 11 x 11 grid of parts, 128 points apart ("all_islands_<column><row>.png"). */
const GRID = 11
const PART_STEP = 128
/** Row index whose bottom edge sits on the batch origin; rows above it have a larger y in cocos coordinates. */
const BOTTOM_ROW = 8
/** `MapPartManager::setScaleMap(3.6)` @0x4485d0. */
const GROUND_SCALE = 3.6
/** `LoadState::createGraphicScene` places the batch at tileToPixel(96.9, 168.7) (literals 0x42c1cccd, 0x4328b333). */
const GROUND_ORIGIN = tileToPixel(96.9, 168.7)
/** The HD atlas stores 2 pixels per point. */
const PIXELS_PER_POINT = 2

/** The ground of the main island, in map pixels (points, y down). */
export const createGround = async (): Promise<Container> => {
    const atlas = await loadAtlas(GROUND_ATLAS)
    const ground = new Container({ label: "ground" })
    const step = PART_STEP * GROUND_SCALE

    for (let column = 0; column < GRID; column++) {
        for (let row = 0; row < GRID; row++) {
            const name = `all_islands_${column}${row}.png`
            if (!atlas.has(name)) continue
            const part = new Sprite(atlas.get(name))
            part.anchor.set(0, 1)
            part.scale.set(GROUND_SCALE / PIXELS_PER_POINT)
            part.position.set(GROUND_ORIGIN.x + column * step, GROUND_ORIGIN.y - (BOTTOM_ROW - row) * step)
            ground.addChild(part)
        }
    }
    return ground
}

/** The sky behind the map (`BackgroundLayer`), a single 1024 x 576 image. */
export const createBackground = async (): Promise<Sprite> => {
    const atlas = await loadAtlas(BACKGROUND_ATLAS)
    return new Sprite(atlas.get("background"))
}
