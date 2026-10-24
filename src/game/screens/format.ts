import type { PlayerResources } from "../core/economy"

/** 1234 -> "1,234". */
export const formatCount = (value: number) => Math.trunc(value).toLocaleString("en-US")

/** Share of the current level already earned, 0..1 (full at the maximum level). */
export const levelProgress = (r: Pick<PlayerResources, "xp" | "levelFloorXp" | "levelCeilXp">): number => {
    if (r.levelCeilXp === null) return 1
    const span = r.levelCeilXp - r.levelFloorXp
    return span <= 0 ? 1 : Math.min(1, Math.max(0, (r.xp - r.levelFloorXp) / span))
}

/** "1h 5m", "29m", "40s": the two largest non-zero units. */
export const formatDuration = (totalSeconds: number): string => {
    let rest = Math.max(0, Math.ceil(totalSeconds))
    const parts: string[] = []
    for (const [unit, size] of [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]] as const) {
        const count = Math.floor(rest / size)
        rest -= count * size
        if (count > 0) parts.push(`${count}${unit}`)
    }
    return parts.slice(0, 2).join(" ") || "0s"
}
