import { BufferImageSource, Texture } from "pixi.js"

import { decodeDds } from "./dds"

/** A Pixi texture from the bytes of a DXT `.dds` file, decoded on the CPU (see dds.ts). */
export const textureFromDds = (buffer: ArrayBuffer): Texture => {
    const { width, height, data } = decodeDds(buffer)
    // Pixi blends premultiplied colours and cannot premultiply typed-array uploads itself.
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255
        data[i] = Math.round(data[i] * alpha)
        data[i + 1] = Math.round(data[i + 1] * alpha)
        data[i + 2] = Math.round(data[i + 2] * alpha)
    }
    return new Texture({
        source: new BufferImageSource({ resource: data, width, height, format: "rgba8unorm", alphaMode: "premultiplied-alpha" }),
    })
}
