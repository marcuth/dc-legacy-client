/**
 * Access to the official APK assets shipped in src/assets.
 * Paths are relative to src/assets (e.g. "HD/Engine/night_islands.plist") and matched case-insensitively,
 * because the APK mixes ".dds"/".DDS" and the plists reference the lowercase form.
 */
const loaders = import.meta.glob("/src/assets/**/*.{png,jpg,dds,plist,xml,ccbi,fnt,txt,zip,bin,mask}", {
    query: "?url",
    import: "default",
})

const PREFIX = "/src/assets/"

const index = new Map<string, () => Promise<unknown>>()
const originals = new Map<string, string>()
for (const [key, load] of Object.entries(loaders)) {
    const path = key.slice(PREFIX.length)
    index.set(path.toLowerCase(), load)
    originals.set(path.toLowerCase(), path)
}

/** Paths (original case) of the shipped files that start with `prefix`. */
export const findAssets = (prefix: string): string[] => {
    const wanted = normalize(prefix)
    return [...originals].filter(([lower]) => lower.startsWith(wanted)).map(([, path]) => path)
}

export const hasAsset = (path: string) => index.has(normalize(path))

function normalize(path: string) {
    return path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase()
}

export const assetUrl = async (path: string): Promise<string> => {
    const key = normalize(path)
    const load = index.get(key)
    if (!load) throw new Error(`Asset not found: ${path}`)
    // The dev server serves the files where they are; importing each one as a module only adds a request per asset.
    if (import.meta.env.DEV) return encodeURI(`/src/assets/${originals.get(key)}`)
    return (await load()) as string
}

export const fetchAssetText = async (path: string): Promise<string> => (await fetch(await assetUrl(path))).text()

export const fetchAssetBuffer = async (path: string): Promise<ArrayBuffer> => (await fetch(await assetUrl(path))).arrayBuffer()

export const dirname = (path: string) => {
    const cut = path.lastIndexOf("/")
    return cut < 0 ? "" : path.slice(0, cut)
}

export const joinPath = (...parts: string[]) => parts.filter(Boolean).join("/").replace(/\/{2,}/g, "/")
