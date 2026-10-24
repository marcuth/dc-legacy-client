import type { GameConfig, ItemConfig, LevelConfig, PlayerSaveData, RawMapItem } from "./types"

// Mirrors the server (src/game/levels.py and src/commands/collect.py): the server only bounds
// the claimed gold, so the client has to compute it with the same formula.
const MAX_DRAGON_LEVEL = 40
const MAX_ACCRUAL_SECONDS = 7 * 86400

export interface PlayerResources {
  name: string
  level: number
  xp: number
  /** XP needed to reach the current level. */
  levelFloorXp: number
  /** XP needed to reach the next level, or null at the maximum level. */
  levelCeilXp: number | null
  gold: number
  food: number
  cash: number
  /** Dragons the player owns (the Flash HUD shows it on the book icon). */
  dragons: number
}

export const dragonLevel = (xp: number): number => Math.min(MAX_DRAGON_LEVEL, Math.floor(Math.max(0, xp) / 4) + 1)

export const findItem = (config: GameConfig | undefined, itemId: number): ItemConfig | undefined => {
  const items = config?.items
  if (!items) return undefined
  if (Array.isArray(items)) return items.find((item) => Number(item.id) === itemId)
  return items[String(itemId)]
}

export const lastCollectedAt = (item: RawMapItem): number => {
  const attributes = item[6]
  const lat = typeof attributes?.lat === "number" ? attributes.lat : 0
  return Math.max(Number(item[3]) || 0, lat)
}

/** Gold a habitat's dragons produce per minute. */
export const habitatGoldPerMinute = (isoId: string, save: PlayerSaveData, config?: GameConfig): number => {
  let rate = 0
  for (const dragon of save.map?.dragons ?? []) {
    if (String(dragon.habitatId) !== isoId) continue
    const dragonConfig = findItem(config, dragon.type)
    if (!dragonConfig) continue
    const level = dragonLevel(dragon.xp || 0)
    rate += (dragonConfig.starting_coins ?? 0) + (dragonConfig.coins_added ?? 0) * (level - 1)
  }
  return rate
}

/** Gold waiting to be collected from a habitat at `nowSeconds`. */
export const habitatPendingGold = (
  isoId: string,
  save: PlayerSaveData,
  config: GameConfig | undefined,
  nowSeconds: number,
): number => {
  const item = save.map?.items?.[isoId]
  if (!item) return 0
  const last = lastCollectedAt(item)
  if (!last) return 0
  const elapsed = Math.min(MAX_ACCRUAL_SECONDS, Math.max(0, nowSeconds - last))
  return Math.floor(habitatGoldPerMinute(isoId, save, config) * (elapsed / 60))
}

export const buildResources = (save: PlayerSaveData, levels: LevelConfig[] = []): PlayerResources => {
  const info = save.playerInfo
  const level = Math.max(1, Number(info.level) || 1)
  const floor = levels.find((entry) => entry.level === level)
  const ceil = levels.find((entry) => entry.level === level + 1)
  return {
    name: info.name,
    level,
    xp: Number(info.xp) || 0,
    levelFloorXp: floor?.xp_required ?? 0,
    levelCeilXp: ceil?.xp_required ?? null,
    gold: Number(info.gold) || 0,
    food: Number(info.food) || 0,
    cash: Number(info.cash) || 0,
    dragons: save.map?.dragons?.length ?? 0,
  }
}
