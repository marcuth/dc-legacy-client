import { Assets, Rectangle, Texture } from "pixi.js"

import { parseAtlasPlist, parseStarlingAtlas, type Atlas } from "./atlas"
import { assetUrl, dirname, fetchAssetText, hasAsset, joinPath } from "./assetFiles"

export type AtlasTextures = {
    atlas: Atlas
    /** Frame name (e.g. "all_islands_02.png") to its texture. */
    get(name: string): Texture
    has(name: string): boolean
    names(): string[]
}

/** pixi's groupD8 value for "rotated 90 degrees clockwise in the sheet" (TexturePacker `rotated`). */
const ROTATED_CW = 2

const cache = new Map<string, Promise<AtlasTextures>>()

const loadSheetTexture = async (path: string): Promise<Texture> => {
    const texture = await Assets.load<Texture>(await assetUrl(path))
    return texture
}

const build = async (path: string): Promise<AtlasTextures> => {
    const xml = await fetchAssetText(path)
    const atlas = path.toLowerCase().endsWith(".xml") ? parseStarlingAtlas(xml) : parseAtlasPlist(xml)

    const folder = dirname(path)
    let sheetPath = joinPath(folder, atlas.textureFile)
    if (!hasAsset(sheetPath)) {
        // The plist may name the compressed file while only the png ships (and vice versa).
        const png = joinPath(folder, atlas.textureFile.replace(/\.\w+$/, ".png"))
        if (!hasAsset(png)) throw new Error(`Atlas ${path}: texture ${atlas.textureFile} not found`)
        sheetPath = png
    }

    const sheet = await loadSheetTexture(sheetPath)
    const textures = new Map<string, Texture>()
    for (const f of atlas.frames.values()) {
        textures.set(
            f.name,
            new Texture({
                source: sheet.source,
                frame: new Rectangle(f.x, f.y, f.w, f.h),
                orig: new Rectangle(0, 0, f.sourceW, f.sourceH),
                trim: new Rectangle(f.trimX, f.trimY, f.trimW, f.trimH),
                rotate: f.rotated ? ROTATED_CW : 0,
                label: f.name,
            }),
        )
    }

    return {
        atlas,
        get(name) {
            const texture = textures.get(name)
            if (!texture) throw new Error(`Atlas ${path}: no frame "${name}"`)
            return texture
        },
        has: (name) => textures.has(name),
        names: () => [...textures.keys()],
    }
}

/** Loads a plist (or Starling xml) atlas once; later calls share the same textures. */
export const loadAtlas = (path: string): Promise<AtlasTextures> => {
    const key = path.toLowerCase()
    let entry = cache.get(key)
    if (!entry) {
        entry = build(path)
        entry.catch(() => cache.delete(key))
        cache.set(key, entry)
    }
    return entry
}
