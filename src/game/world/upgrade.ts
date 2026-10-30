/**
 * Building levels and what an upgrade costs. The APK has no table for this (the numbers came from the server), so
 * the curve is made up **[?]**; the level itself travels in the attributes slot of `map.items` (`[..., attributes]`).
 */

export const MAX_BUILDING_LEVEL = 5

/** Level of a `map.items` entry; buildings start at 1. */
export const buildingLevel = (raw: unknown): number => {
    const attributes = Array.isArray(raw) ? raw[6] : undefined
    const level = Number((attributes as { level?: unknown } | undefined)?.level)
    return Number.isFinite(level) && level >= 1 ? Math.min(level, MAX_BUILDING_LEVEL) : 1
}

/** Gems to go from `level` to the next one. */
export const upgradeGemCost = (level: number): number => 2 * level

/** What the building yields at `level`: food per harvest for farms, gold per hour for habitats; null when it yields nothing. */
export const earningsAt = (group: string | undefined, level: number): { kind: "food" | "gold"; amount: number } | null => {
    if (group === "farm") return { kind: "food", amount: 50 * level }
    if (group === "habitat") return { kind: "gold", amount: 20 * level }
    return null
}
