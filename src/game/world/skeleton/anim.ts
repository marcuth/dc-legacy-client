/**
 * Skeleton animations of the engine (`cocos2d::extension::skeleton`, libdc.so): `CCBinaryAnimParser::parseFile`
 * @0x62115c reads one or more animations from a `.bin`, each a set of parts with run-length coded frames.
 *
 * Layout (little endian; a string is an int16 length followed by UTF-16 code units):
 *
 *     animation* := string name, string atlas, int32 length, int32 partCount, part*partCount
 *     part       := string name, int32 layer, int32 frameLength, frame* (until the runs add up to frameLength)
 *     frame      := int32 start, int32 count, float alpha, anchorX, anchorY, x, y, scaleX, scaleY, rotationX, rotationY
 *
 * Positions are in points with y pointing up, rotations in degrees, anchors normalized to the part image.
 * A frame with alpha <= 0 hides the part. Habitat and building path files (`*_right.bin`) use the same format:
 * each part is a path and its frames are the points of that path.
 */
export type SkeletonFrame = {
    /** First frame number of the run. */
    start: number
    /** How many frames the run lasts. */
    count: number
    alpha: number
    anchorX: number
    anchorY: number
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotationX: number
    rotationY: number
}

export type SkeletonPart = {
    name: string
    /** Draw order: parts with a higher layer are drawn later (in front) [?]. */
    layer: number
    frameLength: number
    frames: SkeletonFrame[]
}

export type SkeletonAnimation = {
    name: string
    atlas: string
    /** Number of frames before the animation loops. */
    length: number
    parts: SkeletonPart[]
}

const FRAME_BYTES = 44

export const parseSkeletonAnimations = (buffer: ArrayBuffer): SkeletonAnimation[] => {
    const view = new DataView(buffer)
    let cursor = 0

    const int32 = () => {
        const value = view.getInt32(cursor, true)
        cursor += 4
        return value
    }
    const string = () => {
        const length = view.getInt16(cursor, true)
        cursor += 2
        if (length < 0) throw new Error(`Unsupported animation file version ${-length}`)
        let text = ""
        for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint16(cursor + i * 2, true))
        cursor += length * 2
        return text
    }

    const animations: SkeletonAnimation[] = []
    while (cursor < buffer.byteLength) {
        const name = string()
        const atlas = string()
        const length = int32()
        const partCount = int32()
        if (length <= 0) throw new Error(`Animation ${name} has no frames`)

        const parts: SkeletonPart[] = []
        for (let p = 0; p < partCount; p++) {
            const partName = string()
            const layer = int32()
            const frameLength = int32()
            if (frameLength <= 0) throw new Error(`Part ${partName} of ${name} has no frames`)

            const frames: SkeletonFrame[] = []
            for (let covered = 0; covered < frameLength; ) {
                const start = int32()
                const count = int32()
                const f = (index: number) => view.getFloat32(cursor + index * 4, true)
                frames.push({
                    start,
                    count,
                    alpha: f(0),
                    anchorX: f(1),
                    anchorY: f(2),
                    x: f(3),
                    y: f(4),
                    scaleX: f(5),
                    scaleY: f(6),
                    rotationX: f(7),
                    rotationY: f(8),
                })
                cursor += FRAME_BYTES - 8
                covered += count
            }
            parts.push({ name: partName, layer, frameLength, frames })
        }
        animations.push({ name, atlas, length, parts })
    }
    return animations
}

/** The run that covers `frame` (looping), or undefined when the part has no frames. */
export const frameAt = (part: SkeletonPart, frame: number): SkeletonFrame | undefined => {
    const wanted = ((frame % part.frameLength) + part.frameLength) % part.frameLength
    let low = 0
    let high = part.frames.length - 1
    while (low <= high) {
        const middle = (low + high) >> 1
        const run = part.frames[middle]
        if (wanted < run.start) high = middle - 1
        else if (wanted >= run.start + run.count) low = middle + 1
        else return run
    }
    return undefined
}
