export type RawMapItem = [
  itemId: number,
  tx: number,
  ty: number,
  parentId: number,
  frame: number,
  flag: number,
  attributes: Record<string, unknown>,
]

export interface PlacedBuilding {
  isoId: string
  itemId: number
  tx: number
  ty: number
  parentId: number
  frame: number
  flag: number
  attributes: Record<string, unknown>
  name?: string
  widthTiles: number
  heightTiles: number
}

export interface PlacedDragon {
  id: number
  type: number
  name: string
  xp: number
  habitatId: string | number
  [key: string]: unknown
}

export interface PlacedEgg {
  id: number
  type: number
  [key: string]: unknown
}

export interface PlayerInfo {
  name: string
  pid: string
  level: number
  xp: number
  gold: number
  cash: number
  food: number
  [key: string]: unknown
}

export interface PlayerSaveData {
  playerInfo: PlayerInfo
  map: {
    items: Record<string, RawMapItem>
    dragons?: PlacedDragon[]
    eggs?: PlacedEgg[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ItemConfig {
  id: number
  name: string
  group_type?: string
  type?: string
  img_name?: string
  img_name_mobile?: string
  costs?: {
    g?: number
    c?: number
    f?: number
  }
  starting_coins?: number
  coins_added?: number
  size?: number
  width?: number
  height?: number
  [key: string]: unknown
}

export interface LevelConfig {
  level: number
  xp_required: number
}

export type GameConfig = {
  items?: ItemConfig[] | Record<string, ItemConfig>
  levels?: LevelConfig[]
  [key: string]: unknown
}
