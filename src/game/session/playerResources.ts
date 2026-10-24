import type { PlayerResources } from "../core/economy"

type Dict = Record<string, unknown>

const dict = (value: unknown): Dict => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : {})
const num = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback)

/** XP needed to reach `level`, from the config `levels` node (`xp_required`, or `xp_needed` in older entries). */
const xpToReach = (levels: Dict, level: number): number | null => {
    const entry = levels[String(level)]
    if (entry === undefined) return null
    const { xp_required, xp_needed } = dict(entry)
    return num(xp_required ?? xp_needed)
}

/**
 * Builds the HUD figures from the login `user` and `config` nodes (docs/protocol.md sections 5 and 6).
 * `gold` is read from `playerInfo` like the other resources, which is an assumption: the recovered
 * PlayerInfo parser does not list a key for it.
 */
export const resourcesFromUser = (user: Dict | undefined, config: Dict | undefined): PlayerResources => {
    const info = dict(user?.playerInfo)
    const levels = dict(config?.levels)
    const level = Math.max(1, num(info.level, 1))
    return {
        name: String(info.name ?? ""),
        level,
        xp: num(info.xp),
        levelFloorXp: xpToReach(levels, level) ?? 0,
        levelCeilXp: xpToReach(levels, level + 1),
        gold: num(info.gold),
        food: num(info.food),
        cash: num(info.cash),
        dragons: Object.keys(dict(dict(user?.map).ownedDragons)).length,
    }
}
