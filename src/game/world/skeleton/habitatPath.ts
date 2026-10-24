import { fetchAssetBuffer, findAssets } from "../../atlas/assetFiles"
import { frameAt, parseSkeletonAnimations } from "./anim"

/** One point of a walking path, relative to the top-left corner of the building image, y pointing up (points). */
export type PathPoint = { x: number; y: number }

export type HabitatPath = {
    /** One point per animation frame; the path loops. */
    points: PathPoint[]
}

const cache = new Map<number, Promise<HabitatPath | null>>()

const load = async (itemId: number): Promise<HabitatPath | null> => {
    // `Engine/NNNN_name_right.bin`: the path dragons walk inside that building (CCAnimPathParser).
    const file = findAssets(`Engine/${String(itemId).padStart(4, "0")}_`).find((path) => path.endsWith("_right.bin"))
    if (!file) return null

    const [animation] = parseSkeletonAnimations(await fetchAssetBuffer(file))
    const part = animation?.parts[0]
    if (!part) return null

    const points: PathPoint[] = []
    for (let frame = 0; frame < animation.length; frame++) {
        const run = frameAt(part, frame)
        points.push(run ? { x: run.x, y: run.y } : (points[points.length - 1] ?? { x: 0, y: 0 }))
    }
    return { points }
}

/** The walking path of a building item, or null when it has none (decorations, farms...). */
export const loadHabitatPath = (itemId: number): Promise<HabitatPath | null> => {
    let entry = cache.get(itemId)
    if (!entry) {
        entry = load(itemId).catch((error) => {
            console.warn(`No path for item ${itemId}:`, error)
            return null
        })
        cache.set(itemId, entry)
    }
    return entry
}
