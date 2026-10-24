import type { WorldBuilding, WorldDragon } from "./IsoWorld"

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

/**
 * Dragons from `user.map.ownedDragons`. Each value carries `habitatId` and `name` (the keys the recovered parser
 * reads); the item id is taken from `type` [?], which that parser does not list.
 */
export const dragonsFromMap = (user: Dict | undefined): WorldDragon[] => {
    const owned = dict(dict(user?.map).ownedDragons)
    const dragons: WorldDragon[] = []
    for (const [id, raw] of Object.entries(owned)) {
        const dragon = dict(raw)
        const itemId = Number(dragon.type)
        if (!Number.isFinite(itemId) || dragon.habitatId === undefined || dragon.habitatId === null) continue
        dragons.push({ id, itemId, habitatId: String(dragon.habitatId) })
    }
    return dragons
}
