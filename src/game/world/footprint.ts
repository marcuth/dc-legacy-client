import type { Point } from "./iso"

/** A building as the map sees it: `x`, `y` is the front tile (the node's world position), see iso.ts. */
export type Footprint = { x: number; y: number; width: number; height: number }

/** First and last tile (inclusive) the footprint covers on each axis. */
export const tileRange = ({ x, y, width, height }: Footprint) => ({
    minX: x - width + 1,
    maxX: x,
    minY: y - height + 1,
    maxY: y,
})

export const coversTile = (footprint: Footprint, tile: Point): boolean => {
    const { minX, maxX, minY, maxY } = tileRange(footprint)
    return tile.x >= minX && tile.x <= maxX && tile.y >= minY && tile.y <= maxY
}

export const overlaps = (a: Footprint, b: Footprint): boolean => {
    const first = tileRange(a)
    const second = tileRange(b)
    return first.minX <= second.maxX && second.minX <= first.maxX && first.minY <= second.maxY && second.minY <= first.maxY
}

/** Front tile for a building grabbed at a point, keeping the grab offset (continuous tile coordinates, then snapped). */
export const snapMove = (pointer: Point, grabOffset: Point): Point => ({
    x: Math.round(pointer.x + grabOffset.x),
    y: Math.round(pointer.y + grabOffset.y),
})
