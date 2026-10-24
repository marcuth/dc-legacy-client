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

const palette = new Uint8Array(16)
const alphaTable = new Uint8Array(8)

/** Fills `palette` with the four RGBA colours of a DXT colour block. */
const fillPalette = (c0: number, c1: number, allowTransparent: boolean) => {
    const r0 = Math.round((((c0 >> 11) & 31) * 255) / 31)
    const g0 = Math.round((((c0 >> 5) & 63) * 255) / 63)
    const b0 = Math.round(((c0 & 31) * 255) / 31)
    const r1 = Math.round((((c1 >> 11) & 31) * 255) / 31)
    const g1 = Math.round((((c1 >> 5) & 63) * 255) / 63)
    const b1 = Math.round(((c1 & 31) * 255) / 31)
    palette.set([r0, g0, b0, 255, r1, g1, b1, 255])
    if (c0 > c1 || !allowTransparent) {
        palette.set([Math.round((2 * r0 + r1) / 3), Math.round((2 * g0 + g1) / 3), Math.round((2 * b0 + b1) / 3), 255], 8)
        palette.set([Math.round((r0 + 2 * r1) / 3), Math.round((g0 + 2 * g1) / 3), Math.round((b0 + 2 * b1) / 3), 255], 12)
    } else {
        palette.set([Math.round((r0 + r1) / 2), Math.round((g0 + g1) / 2), Math.round((b0 + b1) / 2), 255], 8)
        palette.set([0, 0, 0, 0], 12)
    }
}

/** Fills `alphaTable` with the eight alpha values of a DXT5 alpha block. */
const fillAlphaTable = (a0: number, a1: number) => {
    alphaTable[0] = a0
    alphaTable[1] = a1
    if (a0 > a1) {
        for (let k = 1; k <= 6; k++) alphaTable[k + 1] = Math.round(((7 - k) * a0 + k * a1) / 7)
    } else {
        for (let k = 1; k <= 4; k++) alphaTable[k + 1] = Math.round(((5 - k) * a0 + k * a1) / 5)
        alphaTable[6] = 0
        alphaTable[7] = 255
    }
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
                fillAlphaTable(view.getUint8(offset), view.getUint8(offset + 1))
                // Sixteen three-bit indices in 6 bytes: two groups of 24 bits.
                const low = view.getUint8(offset + 2) | (view.getUint8(offset + 3) << 8) | (view.getUint8(offset + 4) << 16)
                const high = view.getUint8(offset + 5) | (view.getUint8(offset + 6) << 8) | (view.getUint8(offset + 7) << 16)
                for (let i = 0; i < 8; i++) {
                    alpha[i] = alphaTable[(low >> (3 * i)) & 7]
                    alpha[i + 8] = alphaTable[(high >> (3 * i)) & 7]
                }
                color += 8
            }

            fillPalette(view.getUint16(color, true), view.getUint16(color + 2, true), format === DXT1)
            const indices = view.getUint32(color + 4, true)
            for (let i = 0; i < 16; i++) {
                const x = bx * 4 + (i & 3)
                const y = by * 4 + (i >> 2)
                if (x >= width || y >= height) continue
                const source = ((indices >> (2 * i)) & 3) * 4
                const target = (y * width + x) * 4
                out[target] = palette[source]
                out[target + 1] = palette[source + 1]
                out[target + 2] = palette[source + 2]
                out[target + 3] = format === DXT1 ? palette[source + 3] : alpha[i]
            }
        }
    }
    return { width, height, data: out }
}
