import { parsePlist, type PlistValue } from "./plist"

export type AtlasFrame = {
    name: string
    /** Region on the texture, already in texture space (width/height swapped when rotated). */
    x: number
    y: number
    w: number
    h: number
    /** Stored rotated 90 degrees clockwise. */
    rotated: boolean
    /** Trimmed sprite rectangle inside the untrimmed source image (top-left origin). */
    trimX: number
    trimY: number
    trimW: number
    trimH: number
    /** Untrimmed source size. */
    sourceW: number
    sourceH: number
}

export type Atlas = {
    textureFile: string
    width: number
    height: number
    frames: Map<string, AtlasFrame>
}

type Dict = { [key: string]: PlistValue }

/** Parses "{{x,y},{w,h}}" and "{a,b}" strings into their numbers. */
const numbers = (text: PlistValue | undefined): number[] =>
    typeof text === "string" ? (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) : []

const asDict = (value: PlistValue | undefined): Dict => (value && typeof value === "object" && !Array.isArray(value) ? value : {})

/** TexturePacker/cocos2d plist, formats 0-3. */
export const parseAtlasPlist = (xml: string): Atlas => {
    const root = asDict(parsePlist(xml))
    const metadata = asDict(root.metadata)
    const format = Number(metadata.format ?? 0)
    const [width = 0, height = 0] = numbers(metadata.size)
    const frames = new Map<string, AtlasFrame>()

    for (const [name, raw] of Object.entries(asDict(root.frames))) {
        const f = asDict(raw)
        let x: number, y: number, w: number, h: number
        let offsetX = 0, offsetY = 0, sourceW: number, sourceH: number
        let rotated = false

        if (format === 3) {
            ;[x, y, w, h] = numbers(f.textureRect)
            ;[offsetX, offsetY] = numbers(f.spriteOffset)
            ;[sourceW, sourceH] = numbers(f.spriteSourceSize)
            rotated = f.textureRotated === true
            const [spriteW, spriteH] = numbers(f.spriteSize)
            if (!rotated) [w, h] = [spriteW, spriteH]
        } else if (format === 2) {
            ;[x, y, w, h] = numbers(f.frame)
            ;[offsetX, offsetY] = numbers(f.offset)
            ;[sourceW, sourceH] = numbers(f.sourceSize)
            rotated = f.rotated === true
        } else {
            x = Number(f.x)
            y = Number(f.y)
            w = Number(f.width)
            h = Number(f.height)
            offsetX = Number(f.offsetX ?? 0)
            offsetY = Number(f.offsetY ?? 0)
            sourceW = Number(f.originalWidth ?? w)
            sourceH = Number(f.originalHeight ?? h)
            if (sourceW < 0) sourceW = -sourceW
            if (sourceH < 0) sourceH = -sourceH
        }

        // cocos offset is the distance between trimmed and source centers, y up.
        frames.set(name, {
            name,
            x,
            y,
            w: rotated ? h : w,
            h: rotated ? w : h,
            rotated,
            trimX: (sourceW - w) / 2 + offsetX,
            trimY: (sourceH - h) / 2 - offsetY,
            trimW: w,
            trimH: h,
            sourceW,
            sourceH,
        })
    }

    const textureFile = String(metadata.textureFileName ?? metadata.realTextureFileName ?? "")
    return { textureFile, width, height, frames }
}

/** Starling/Sparrow XML (TextureAtlas > SubTexture), used by the dragon sheets. */
export const parseStarlingAtlas = (xml: string): Atlas => {
    const textureFile = /<TextureAtlas[^>]*imagePath="([^"]*)"/.exec(xml)?.[1] ?? ""
    const frames = new Map<string, AtlasFrame>()
    for (const tag of xml.matchAll(/<SubTexture\b([^>]*)\/?>/g)) {
        const attrs: Record<string, string> = {}
        for (const a of tag[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[a[1]] = a[2]
        const n = (key: string, fallback = 0) => (attrs[key] === undefined ? fallback : Number(attrs[key]))
        const w = n("width")
        const h = n("height")
        const frameX = n("frameX")
        const frameY = n("frameY")
        const sourceW = n("frameWidth", w)
        const sourceH = n("frameHeight", h)
        const name = attrs.name
        frames.set(name, {
            name,
            x: n("x"),
            y: n("y"),
            w,
            h,
            rotated: false,
            trimX: -frameX,
            trimY: -frameY,
            trimW: w,
            trimH: h,
            sourceW,
            sourceH,
        })
    }
    return { textureFile, width: 0, height: 0, frames }
}
