/**
 * Game configuration the mock server sends in the login `config` node.
 *
 * The real catalog only ever came from the server and is not in the APK, so this is a hand-made stand-in:
 * keys follow the parsers recovered from libdc.so (docs/re-output/config-keys.txt), values are invented.
 */

export const MAX_LEVEL = 100

/** XP needed to *reach* `level` (cumulative), for a gentle quadratic curve. */
export const xpForLevel = (level: number): number => (level <= 1 ? 0 : 50 * (level - 1) * level)

const levels = () => {
    const table: Record<string, Record<string, unknown>> = {}
    for (let level = 1; level <= MAX_LEVEL; level++) {
        table[String(level)] = {
            name: `Level ${level}`,
            xp_needed: xpForLevel(level),
            xp_required: xpForLevel(level),
            reward: { g: level * 100, c: level % 5 === 0 ? 1 : 0, f: 0 },
        }
    }
    return table
}

/**
 * Item ids and footprints (in tiles) follow the art the APK ships: the engine zips are named after the item id and
 * a footprint is as many tiles wide as the sprite is wide in 54-point tile diamonds.
 */
/** Gold paid back for selling a building: half its cost **[?]** (the real rule lives on the server). */
export const sellValue = (itemId: number): number => {
    const item = (items as Record<string, { costs?: { g?: number } }>)[String(itemId)]
    return Math.floor((item?.costs?.g ?? 0) / 2)
}

const items = {
    "1": { id: 1, name: "Hatchery", group_type: "incubator", costs: { g: 0 }, width: 6, height: 6 },
    "16": { id: 16, name: "Farm", group_type: "farm", costs: { g: 100 }, width: 3, height: 3 },
    "26": { id: 26, name: "Earth Habitat", group_type: "habitat", type: "earth", costs: { g: 100 }, capacity: 2, width: 4, height: 4 },
    "1011": { id: 1011, name: "Terra Dragon", group_type: "dragon", type: "earth", img_name: "dragon_earth_a", starting_coins: 5, coins_added: 1 },
    "1012": { id: 1012, name: "Flame Dragon", group_type: "dragon", type: "fire", img_name: "dragon_fire_a", starting_coins: 6, coins_added: 1 },
}

export const buildConfig = (staticUrl: string): Record<string, unknown> => ({
    STATIC_URL: staticUrl,
    LIMITS: { max_dragons: { value: 100 }, max_level: { value: MAX_LEVEL } },
    ISLANDS_COSTS: [],
    items,
    levels: levels(),
    sounds: [],
    expansion_prices: [],
    expansions: [],
    tournaments: [],
    attacks: [],
    opposite_elements: [],
    breed_oposite: [],
    goals: [],
    treasure_items: [],
    iphone_config: [],
    iphone_tutorial: [],
    iphone_non_blocking_tutorial: [],
    android_store_packs: [],
    android_promotions: [],
    resource_gifts: [],
    requests: {},
    collections: [],
    dragon_feed_costs: [],
    payment_products_offers: [],
    collect_game_items: {},
    collect_game_quests: [],
    collect_game_probabilities: [],
    collect_game_item_containers: [],
    collect_game_i18n: {},
})
