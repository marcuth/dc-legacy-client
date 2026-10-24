/**
 * Isometric projection of the hydra engine (`hydra::GraphicScene`, libdc.so).
 *
 * `LoadState::createGraphicScene` calls `GraphicScene::init` with a tile size of 27 x 13.5 points, so a tile is a
 * 54 x 27 diamond. `tileToPixel` @0x600c48 gives (27 * (tx - ty), -13.5 * (tx + ty)) in cocos coordinates (y up);
 * here y points down like in Pixi, so the sign of y is flipped.
 *
 * `pixelToTile` @0x60088e ceils, so tile n covers the continuous range (n - 1, n]: `tileToPixel(n)` is the
 * *bottom* corner of tile n, and a node at world (x, y) with width w, height h covers the tiles
 * x - w + 1 .. x and y - h + 1 .. y, standing with its feet on `tileToPixel(x, y)`.
 */
export const TILE_HALF_WIDTH = 27
export const TILE_HALF_HEIGHT = 13.5

export type Point = { x: number; y: number }

/** Map pixel (points, y down) of the corner at continuous tile coordinates (tx, ty). */
export const tileToPixel = (tx: number, ty: number): Point => ({
    x: TILE_HALF_WIDTH * (tx - ty),
    y: TILE_HALF_HEIGHT * (tx + ty),
})

/** The tile under a map pixel. */
export const pixelToTile = (x: number, y: number): Point => {
    const sum = y / TILE_HALF_HEIGHT
    const diff = x / TILE_HALF_WIDTH
    return { x: Math.ceil((sum + diff) / 2), y: Math.ceil((sum - diff) / 2) }
}

/** `Map::calculateNodeZIndex` @0x602c08: worldX + worldY - width, truncated. */
export const nodeZIndex = (worldX: number, worldY: number, width: number): number => Math.trunc(worldX + worldY - width)
