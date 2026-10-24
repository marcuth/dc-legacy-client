export const TILE_WIDTH = 64
export const TILE_HEIGHT = 32

export interface ScreenCoord {
  x: number
  y: number
}

export interface GridCoord {
  tx: number
  ty: number
}

/**
 * Converts tile grid coordinates (tx, ty) to 2D isometric screen pixel coordinates.
 */
export const gridToScreen = (
  tx: number,
  ty: number,
  tileWidth = TILE_WIDTH,
  tileHeight = TILE_HEIGHT,
): ScreenCoord => {
  return {
    x: (tx - ty) * (tileWidth / 2),
    y: (tx + ty) * (tileHeight / 2),
  }
}

/**
 * Converts 2D screen coordinates back to tile grid coordinates.
 */
export const screenToGrid = (
  px: number,
  py: number,
  tileWidth = TILE_WIDTH,
  tileHeight = TILE_HEIGHT,
): GridCoord => {
  const halfW = tileWidth / 2
  const halfH = tileHeight / 2
  return {
    tx: Math.floor((px / halfW + py / halfH) / 2),
    ty: Math.floor((py / halfH - px / halfW) / 2),
  }
}

/**
 * Calculates rendering z-order / depth so objects in front are rendered after objects in back.
 */
export const getDepth = (tx: number, ty: number, zOffset = 0): number => {
  return (tx + ty) * 100 + zOffset
}
