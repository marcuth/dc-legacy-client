import { Assets, Texture } from "pixi.js"

import { fetchAssetBuffer, findAssets, hasAsset, assetUrl } from "../atlas/assetFiles"
import { parseAtlasPlist } from "../atlas/atlas"
import { texturesFromSheet } from "../atlas/AtlasLoader"
import { textureFromDds } from "../atlas/ddsTexture"
import { unzip } from "./zip"

const ART_FOLDER = "HD/Engine/s3tc"

export type BuildingArt = {
    /** Frame of the building, anchored by its source rectangle (untrimmed). */
    texture: Texture
    /** True when the APK has no art for this item and a placeholder stands in. */
    placeholder: boolean
}

const cache = new Map<number, Promise<BuildingArt>>()

const placeholder = async (): Promise<BuildingArt> => ({
    texture: await Assets.load<Texture>(await assetUrl("HD/Engine/defaultBuilding.png")),
    placeholder: true,
})

/** Items are drawn from `NNNN_name.zip` in the engine folder (the number is the item id); the rest comes from the server. */
const archiveFor = (itemId: number): string | undefined => {
    const prefix = `${ART_FOLDER}/${String(itemId).padStart(4, "0")}_`
    return findAssets(prefix).find((path) => path.endsWith(".zip"))
}

const load = async (itemId: number): Promise<BuildingArt> => {
    const archive = archiveFor(itemId)
    if (!archive || !hasAsset(archive)) return placeholder()

    const files = await unzip(await fetchAssetBuffer(archive))
    const plistName = [...files.keys()].find((name) => name.endsWith(".plist"))
    const sheetName = [...files.keys()].find((name) => name.endsWith(".dds"))
    if (!plistName || !sheetName) return placeholder()

    const atlas = parseAtlasPlist(new TextDecoder().decode(files.get(plistName)))
    const bytes = files.get(sheetName)!
    const sheet = textureFromDds(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    const textures = texturesFromSheet(atlas, sheet, archive)
    return { texture: textures.get(textures.names()[0]), placeholder: false }
}

/** Art for an item id, loaded once. */
export const loadBuildingArt = (itemId: number): Promise<BuildingArt> => {
    let entry = cache.get(itemId)
    if (!entry) {
        entry = load(itemId).catch((error) => {
            console.warn(`No art for item ${itemId}:`, error)
            return placeholder()
        })
        cache.set(itemId, entry)
    }
    return entry
}
