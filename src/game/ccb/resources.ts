import { Assets, Rectangle, Texture } from "pixi.js"

import { fetchAssetText, assetUrl, hasAsset } from "../atlas/assetFiles"
import { loadAtlas, type AtlasTextures } from "../atlas/AtlasLoader"
import { parseBMFont, type BMFont } from "./bmfont"
import { CCBPropType, type CCBDocument, type CCBNode } from "./types"

/** Font used for button titles (the ttf the editor names is baked into this distance-field font). */
export const DEFAULT_FONT = "Fonts/CurseCasualDF.fnt"

/** Images DCBackgroundPopup adds from code: gradient, tiled background, frame. */
export const POPUP_BACKGROUND_FILES = ["Backgrounds/bg-gradient.png", "Backgrounds/bg-popup.png", "Frames/fr-popup.png"] as const

export type Variant = "HD" | "SD"

export type LabelStyle = {
    fill: number
    gradientTop?: number
    gradientBottom?: number
    stroke?: number
    /** Distance-field offset for the outline, 0..0.5. */
    strokeWidth: number
}

/**
 * A BMFont. Distance-field pages (greyscale, no alpha) are baked into coloured glyph pages on demand;
 * ordinary pages are used as they are and coloured by tinting.
 */
export class LoadedFont {
    private baked = new Map<string, Texture>()

    constructor(
        readonly font: BMFont,
        private readonly gray: Uint8Array,
        private readonly width: number,
        private readonly height: number,
        /** Set for ordinary (non distance-field) fonts. */
        private readonly page: Texture | null,
    ) {}

    get isDistanceField() {
        return this.page === null
    }

    glyph(char: number, style: LabelStyle): Texture | null {
        const info = this.font.chars.get(char)
        if (!info) return null
        if (this.page) return new Texture({ source: this.page.source, frame: new Rectangle(info.x, info.y, info.width, info.height) })
        const key = JSON.stringify(style)
        let page = this.baked.get(key)
        if (!page) {
            page = this.bake(style)
            this.baked.set(key, page)
        }
        return new Texture({ source: page.source, frame: new Rectangle(info.x, info.y, info.width, info.height) })
    }

    private bake(style: LabelStyle): Texture {
        const { width, height, gray } = this
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")!
        const image = ctx.createImageData(width, height)
        const out = image.data

        const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
        const fill = rgb(style.fill)
        const top = rgb(style.gradientTop ?? style.fill)
        const bottom = rgb(style.gradientBottom ?? style.fill)
        const stroke = style.stroke === undefined ? undefined : rgb(style.stroke)
        const smooth = (edge: number, x: number) => {
            const t = Math.min(1, Math.max(0, (x - (edge - 0.06)) / 0.12))
            return t * t * (3 - 2 * t)
        }

        // Gradient position per pixel: 0 at the top of a glyph, 1 at its bottom.
        const rowT = new Float32Array(width * height)
        if (style.gradientTop !== undefined) {
            for (const c of this.font.chars.values()) {
                for (let y = 0; y < c.height; y++) {
                    for (let x = 0; x < c.width; x++) {
                        const px = Math.floor(c.x + x)
                        const py = Math.floor(c.y + y)
                        if (px < width && py < height) rowT[py * width + px] = y / Math.max(1, c.height - 1)
                    }
                }
            }
        }

        for (let i = 0; i < width * height; i++) {
            const d = gray[i] / 255
            const inner = smooth(0.5, d)
            const outer = stroke ? smooth(0.5 - style.strokeWidth, d) : inner
            const t = rowT[i]
            const base = [0, 1, 2].map((k) => (style.gradientTop !== undefined ? top[k] + (bottom[k] - top[k]) * t : fill[k]))
            const o = i * 4
            for (let k = 0; k < 3; k++) {
                out[o + k] = stroke ? stroke[k] * (1 - inner) + base[k] * inner : base[k]
            }
            out[o + 3] = Math.round(outer * 255)
        }
        ctx.putImageData(image, 0, 0)
        return Texture.from(canvas)
    }
}

export type CCBResources = {
    variant: Variant
    /** Texture pixels per design point (HD ships at 2x). */
    assetScale: number
    frame(sheet: string, file: string): Texture | null
    font(file: string): LoadedFont | null
    /** Everything that was referenced but not present in the APK. */
    missing: Set<string>
}

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1)

const collect = (node: CCBNode, frames: Map<string, [string, string]>, fonts: Set<string>) => {
    if (node.className === "DCBackgroundPopup") {
        for (const file of POPUP_BACKGROUND_FILES) frames.set(`|${file}`, ["", file])
    }
    for (const p of node.properties) {
        const v = p.value
        if (v.type === CCBPropType.SpriteFrame && v.file) frames.set(`${v.sheet}|${v.file}`, [v.sheet, v.file])
        if (v.type === CCBPropType.FntFile && v.value) fonts.add(v.value)
    }
    for (const child of node.children) collect(child, frames, fonts)
}

/** Texture files named after their plist may sit in different engine folders. */
const sheetCandidates = (variant: Variant, sheet: string) => [
    `${variant}/${sheet}`,
    `${variant}/Engine/${basename(sheet)}`,
    `${variant}/Engine/s3tc/${basename(sheet)}`,
]

const withExtension = (name: string) => (/\.\w+$/.test(name) ? [name] : [name, `${name}.png`])

const loadFont = async (variant: Variant, file: string): Promise<LoadedFont | null> => {
    const path = [`${variant}/${file}`, file].find(hasAsset)
    if (!path) return null
    const font = parseBMFont(await fetchAssetText(path))
    const pagePath = `${path.slice(0, path.lastIndexOf("/") + 1)}${font.pageFile}`
    const bitmap = await createImageBitmap(await (await fetch(await assetUrl(pagePath))).blob())
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0)
    const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
    const gray = new Uint8Array(bitmap.width * bitmap.height)
    let opaque = true
    for (let i = 0; i < gray.length; i++) {
        gray[i] = rgba[i * 4]
        if (rgba[i * 4 + 3] !== 255) opaque = false
    }
    // Distance-field pages are fully opaque greyscale; ordinary glyph pages carry their own alpha.
    const page = opaque ? null : await Assets.load<Texture>(await assetUrl(pagePath))
    return new LoadedFont(font, gray, bitmap.width, bitmap.height, page)
}

/** Loads every texture and font a document references, so building the scene can stay synchronous. */
export const loadCCBResources = async (documents: CCBDocument[], variant: Variant = "HD"): Promise<CCBResources> => {
    const frameRefs = new Map<string, [string, string]>()
    const fontRefs = new Set<string>([DEFAULT_FONT])
    for (const doc of documents) collect(doc.root, frameRefs, fontRefs)

    const missing = new Set<string>()
    const atlases = new Map<string, AtlasTextures | null>()
    const textures = new Map<string, Texture | null>()
    const fonts = new Map<string, LoadedFont | null>()

    await Promise.all(
        [...frameRefs].map(async ([key, [sheet, file]]) => {
            if (!sheet) {
                const path = `${variant}/${file}`
                if (!hasAsset(path)) {
                    missing.add(path)
                    return void textures.set(key, null)
                }
                textures.set(key, await Assets.load<Texture>(await assetUrl(path)))
                return
            }
            if (!atlases.has(sheet)) {
                const path = sheetCandidates(variant, sheet).find(hasAsset)
                try {
                    atlases.set(sheet, path ? await loadAtlas(path) : null)
                } catch {
                    atlases.set(sheet, null)
                }
                if (!atlases.get(sheet)) missing.add(`${variant}/${sheet}`)
            }
            const atlas = atlases.get(sheet)
            const name = atlas && withExtension(file).find((n) => atlas.has(n))
            if (atlas && name) textures.set(key, atlas.get(name))
            else {
                textures.set(key, null)
                missing.add(`${sheet}#${file}`)
            }
        }),
    )

    await Promise.all(
        [...fontRefs].map(async (file) => {
            const font = await loadFont(variant, file)
            if (!font) missing.add(file)
            fonts.set(file, font)
        }),
    )

    return {
        variant,
        assetScale: variant === "HD" ? 2 : 1,
        frame: (sheet, file) => textures.get(`${sheet}|${file}`) ?? null,
        font: (file) => fonts.get(file) ?? null,
        missing,
    }
}
