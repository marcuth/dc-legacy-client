/**
 * Software decoder for the DXT1/DXT3/DXT5 textures of the APK (`.dds`, "s3tc" folders).
 *
 * WebGL refuses compressed uploads whose base size is not a multiple of 4 (some building sheets are 436 x 334) and
 * many mobile GPUs lack S3TC, so the first mip level is expanded to RGBA on the CPU instead.
 */
export type DecodedImage = {
    width: number
    height: number
    /** RGBA, straight (not premultiplied) alpha. */
    data: Uint8Array<ArrayBuffer>
}

const MAGIC = 0x20534444 // "DDS "
const fourCC = (text: string) => text.charCodeAt(0) | (text.charCodeAt(1) << 8) | (text.charCodeAt(2) << 16) | (text.charCodeAt(3) << 24)
const DXT1 = fourCC("DXT1")
const DXT3 = fourCC("DXT3")
const DXT5 = fourCC("DXT5")
const HEADER_SIZE = 128

const expand565 = (value: number) => [
    ((value >> 11) & 31) * 255 / 31,
    ((value >> 5) & 63) * 255 / 63,
    (value & 31) * 255 / 31,
]

/** The four colours of a DXT colour block, as [r, g, b, a] arrays. */
const colorPalette = (c0: number, c1: number, allowTransparent: boolean): number[][] => {
    const a = expand565(c0)
    const b = expand565(c1)
    const mix = (x: number[], y: number[], wx: number, wy: number, divisor: number) =>
        [0, 1, 2].map((i) => (x[i] * wx + y[i] * wy) / divisor)
    if (c0 > c1 || !allowTransparent) {
        return [[...a, 255], [...b, 255], [...mix(a, b, 2, 1, 3), 255], [...mix(a, b, 1, 2, 3), 255]]
    }
    return [[...a, 255], [...b, 255], [...mix(a, b, 1, 1, 2), 255], [0, 0, 0, 0]]
}

export const decodeDds = (buffer: ArrayBuffer): DecodedImage => {
    const view = new DataView(buffer)
    if (view.getUint32(0, true) !== MAGIC) throw new Error("Not a DDS file")
    const height = view.getUint32(12, true)
    const width = view.getUint32(16, true)
    const format = view.getUint32(84, true)
    if (format !== DXT1 && format !== DXT3 && format !== DXT5) throw new Error(`Unsupported DDS format 0x${format.toString(16)}`)

    const blockSize = format === DXT1 ? 8 : 16
    const blocksX = Math.ceil(width / 4)
    const blocksY = Math.ceil(height / 4)
    const out = new Uint8Array(width * height * 4)
    const alpha = new Uint8Array(16)

    let offset = HEADER_SIZE
    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++, offset += blockSize) {
            let color = offset
            if (format === DXT3) {
                for (let i = 0; i < 8; i++) {
                    const byte = view.getUint8(offset + i)
                    alpha[i * 2] = (byte & 15) * 17
                    alpha[i * 2 + 1] = (byte >> 4) * 17
                }
                color += 8
            } else if (format === DXT5) {
                const a0 = view.getUint8(offset)
                const a1 = view.getUint8(offset + 1)
                const table =
                    a0 > a1
                        ? [a0, a1, ...[1, 2, 3, 4, 5, 6].map((k) => ((7 - k) * a0 + k * a1) / 7)]
                        : [a0, a1, ...[1, 2, 3, 4].map((k) => ((5 - k) * a0 + k * a1) / 5), 0, 255]
                // 16 three-bit indices packed little-endian into 6 bytes.
                let bits = 0n
                for (let i = 0; i < 6; i++) bits |= BigInt(view.getUint8(offset + 2 + i)) << BigInt(8 * i)
                for (let i = 0; i < 16; i++) alpha[i] = table[Number((bits >> BigInt(3 * i)) & 7n)]
                color += 8
            }

            const palette = colorPalette(view.getUint16(color, true), view.getUint16(color + 2, true), format === DXT1)
            const indices = view.getUint32(color + 4, true)
            for (let i = 0; i < 16; i++) {
                const x = bx * 4 + (i & 3)
                const y = by * 4 + (i >> 2)
                if (x >= width || y >= height) continue
                const [r, g, b, a] = palette[(indices >> (2 * i)) & 3]
                const target = (y * width + x) * 4
                out[target] = Math.round(r)
                out[target + 1] = Math.round(g)
                out[target + 2] = Math.round(b)
                out[target + 3] = Math.round(format === DXT1 ? a : alpha[i])
            }
        }
    }
    return { width, height, data: out }
}
