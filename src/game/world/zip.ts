/** Reads a zip archive (stored or deflated entries) with the platform's DecompressionStream. */

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

const inflateRaw = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
    return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Returns every file of the archive by name. */
export const unzip = async (buffer: ArrayBuffer): Promise<Map<string, Uint8Array<ArrayBuffer>>> => {
    const bytes = new Uint8Array(buffer)
    const view = new DataView(buffer)

    let end = bytes.length - 22
    while (end >= 0 && view.getUint32(end, true) !== EOCD) end--
    if (end < 0) throw new Error("Not a zip archive")

    const count = view.getUint16(end + 10, true)
    let cursor = view.getUint32(end + 16, true)
    const files = new Map<string, Uint8Array<ArrayBuffer>>()

    for (let i = 0; i < count; i++) {
        if (view.getUint32(cursor, true) !== CENTRAL) throw new Error("Corrupt zip directory")
        const method = view.getUint16(cursor + 10, true)
        const compressed = view.getUint32(cursor + 20, true)
        const nameLength = view.getUint16(cursor + 28, true)
        const extraLength = view.getUint16(cursor + 30, true)
        const commentLength = view.getUint16(cursor + 32, true)
        const localOffset = view.getUint32(cursor + 42, true)
        const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
        cursor += 46 + nameLength + extraLength + commentLength

        if (view.getUint32(localOffset, true) !== LOCAL) throw new Error(`Corrupt zip entry ${name}`)
        const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
        const data = bytes.slice(dataStart, dataStart + compressed)

        if (name.endsWith("/")) continue
        if (method === 0) files.set(name, data)
        else if (method === 8) files.set(name, await inflateRaw(data))
        else throw new Error(`Unsupported zip method ${method} for ${name}`)
    }
    return files
}
