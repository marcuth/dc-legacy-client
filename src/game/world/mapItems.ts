import type { WorldBuilding } from "./IsoWorld"

type Dict = Record<string, unknown>

const dict = (value: unknown): Dict => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Dict) : {})

/** Item groups that stand on the map as buildings (dragons and eggs are drawn by their habitat). */
const NOT_BUILDINGS = new Set(["dragon", "egg"])

/**
 * Turns `user.map.items` into world buildings. Each entry is `[itemId, x, y, parentId, frame, flag, attributes]`
 * (the shape the old Flash server used; the mobile one was not confirmed), sized by the `width` and `height`
 * of its item in `config.items`.
 */
export const buildingsFromMap = (user: Dict | undefined, config: Dict | undefined): WorldBuilding[] => {
    const items = dict(dict(user?.map).items)
    const catalog = dict(config?.items)
    const buildings: WorldBuilding[] = []

    for (const [id, raw] of Object.entries(items)) {
        if (!Array.isArray(raw)) continue
        const [itemId, x, y] = raw.map(Number)
        if (![itemId, x, y].every(Number.isFinite)) continue

        const item = dict(catalog[String(itemId)])
        if (NOT_BUILDINGS.has(String(item.group_type))) continue
        buildings.push({
            id,
            itemId,
            x,
            y,
            width: Math.max(1, Number(item.width) || 1),
            height: Math.max(1, Number(item.height) || 1),
        })
    }
    return buildings
}
