import { Texture } from "pixi.js"

import { fetchAssetBuffer, findAssets } from "../../atlas/assetFiles"
import { parseStarlingAtlas } from "../../atlas/atlas"
import { texturesFromSheet } from "../../atlas/AtlasLoader"
import { textureFromDds } from "../../atlas/ddsTexture"
import { unzip } from "../zip"
import { parseSkeletonAnimations, type SkeletonAnimation } from "./anim"
import { Skeleton } from "./Skeleton"

const ART_FOLDER = "HD/Engine/s3tc"

/**
 * `<id>_<name>_<stage>.zip` holds a dragon: parts atlas for the map (`*_map.xml/.dds`) and the animation files
 * (`walk`, `breathe`, `levelup`, `special1`, `special2`). Stage 0 is the egg art, stage 1 the first dragon form;
 * the APK only ships stage 1 of the earth dragon (1011).
 */
export type DragonArt = {
    textures: { has(name: string): boolean; get(name: string): Texture }
    animations: Map<string, SkeletonAnimation>
}

const cache = new Map<string, Promise<DragonArt | null>>()

const archiveFor = (itemId: number, stage: number): string | undefined =>
    findAssets(`${ART_FOLDER}/${String(itemId).padStart(4, "0")}_`).find((path) => path.endsWith(`_${stage}.zip`))

const load = async (itemId: number, stage: number): Promise<DragonArt | null> => {
    const archive = archiveFor(itemId, stage)
    if (!archive) return null

    const files = await unzip(await fetchAssetBuffer(archive))
    const xml = [...files.keys()].find((name) => name.endsWith("_map.xml"))
    const sheet = [...files.keys()].find((name) => name.endsWith("_map.dds"))
    if (!xml || !sheet) return null

    const bytes = files.get(sheet)!
    const atlas = parseStarlingAtlas(new TextDecoder().decode(files.get(xml)))
    const textures = texturesFromSheet(atlas, textureFromDds(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), archive)

    const animations = new Map<string, SkeletonAnimation>()
    for (const [name, data] of files) {
        if (!name.endsWith(".bin")) continue
        for (const animation of parseSkeletonAnimations(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))) {
            animations.set(animation.name, animation)
        }
    }
    return { textures, animations }
}

/** Art of a dragon item at an evolution stage, or null when the APK does not ship it. */
export const loadDragonArt = (itemId: number, stage = 1): Promise<DragonArt | null> => {
    const key = `${itemId}:${stage}`
    let entry = cache.get(key)
    if (!entry) {
        entry = load(itemId, stage).catch((error) => {
            console.warn(`No dragon art for ${key}:`, error)
            return null
        })
        cache.set(key, entry)
    }
    return entry
}

export const createDragonSkeleton = (art: DragonArt): Skeleton => new Skeleton(art.textures, art.animations.values())
