export type BMChar = {
    id: number
    x: number
    y: number
    width: number
    height: number
    xoffset: number
    yoffset: number
    xadvance: number
}

export type BMFont = {
    face: string
    size: number
    lineHeight: number
    base: number
    padding: [number, number, number, number]
    pageFile: string
    chars: Map<number, BMChar>
    kernings: Map<number, number>
}

const attrs = (line: string) => {
    const result: Record<string, string> = {}
    for (const m of line.matchAll(/(\w+)=("[^"]*"|\S*)/g)) result[m[1]] = m[2].replace(/^"|"$/g, "")
    return result
}

/** Text BMFont (.fnt). Values may be fractional in the shipped files. */
export const parseBMFont = (text: string): BMFont => {
    const font: BMFont = {
        face: "",
        size: 0,
        lineHeight: 0,
        base: 0,
        padding: [0, 0, 0, 0],
        pageFile: "",
        chars: new Map(),
        kernings: new Map(),
    }
    for (const line of text.split(/\r?\n/)) {
        const tag = line.split(/\s+/, 1)[0]
        const a = attrs(line)
        if (tag === "info") {
            font.face = a.face
            font.size = Number(a.size)
            font.padding = (a.padding ?? "0,0,0,0").split(",").map(Number) as BMFont["padding"]
        } else if (tag === "common") {
            font.lineHeight = Number(a.lineHeight)
            font.base = Number(a.base)
        } else if (tag === "page") {
            font.pageFile = a.file
        } else if (tag === "char") {
            const id = Number(a.id)
            font.chars.set(id, {
                id,
                x: Number(a.x),
                y: Number(a.y),
                width: Number(a.width),
                height: Number(a.height),
                xoffset: Number(a.xoffset),
                yoffset: Number(a.yoffset),
                xadvance: Number(a.xadvance),
            })
        } else if (tag === "kerning") {
            font.kernings.set(Number(a.first) * 65536 + Number(a.second), Number(a.amount))
        }
    }
    return font
}
