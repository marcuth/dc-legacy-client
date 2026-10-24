import { fetchAssetBuffer, findAssets } from "../atlas/assetFiles"
import { TouchMask } from "./touchMask"

const cache = new Map<string, Promise<TouchMask | null>>()

/**
 * The mask of a building item (`Engine/NNNN_name.mask`), or null when the APK has none (the original then falls back
 * to tile based detection). `width` is the building image width in points.
 */
export const loadTouchMask = (itemId: number, width: number): Promise<TouchMask | null> => {
    const key = `${itemId}:${width}`
    let entry = cache.get(key)
    if (!entry) {
        const file = findAssets(`Engine/${String(itemId).padStart(4, "0")}_`).find((path) => path.endsWith(".mask"))
        entry = file
            ? fetchAssetBuffer(file).then((buffer) => new TouchMask(new Uint8Array(buffer), Math.round(width)))
            : Promise.resolve(null)
        entry = entry.catch((error) => {
            console.warn(`No touch mask for item ${itemId}:`, error)
            return null
        })
        cache.set(key, entry)
    }
    return entry
}
