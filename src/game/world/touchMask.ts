/**
 * Touch masks of the engine (`TouchMask` / `TouchMaskManager`, libdc.so). A `.mask` file is one byte per pixel,
 * row after row from the top, 1 where the building can be touched and 0 on transparent areas. The size is in
 * points (half the HD image) and is not stored in the file: the manager is given it by the caller.
 */
export class TouchMask {
    readonly height: number

    constructor(
        private readonly data: Uint8Array,
        readonly width: number,
    ) {
        if (width <= 0) throw new Error("Touch mask width must be positive")
        // The files are cut from the top of the image, so the last row of the image can be missing.
        this.height = Math.floor(data.length / width)
    }

    /** True when pixel (x, y), counted from the top-left corner of the mask, can be touched. */
    isTouchable(x: number, y: number): boolean {
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) return false
        return this.data[y * this.width + x] !== 0
    }

    /** RGBA pixels (opaque white where touchable), handy to look at a mask. */
    toRgba(): Uint8Array<ArrayBuffer> {
        const pixels = new Uint8Array(this.width * this.height * 4)
        for (let i = 0; i < this.width * this.height; i++) {
            if (this.data[i] === 0) continue
            pixels.fill(255, i * 4, i * 4 + 4)
        }
        return pixels
    }
}
