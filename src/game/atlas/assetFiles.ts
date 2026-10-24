/**
 * Access to the official APK assets shipped in src/assets.
 * Paths are relative to src/assets (e.g. "HD/Engine/night_islands.plist") and matched case-insensitively,
 * because the APK mixes ".dds"/".DDS" and the plists reference the lowercase form.
 */
const loaders = import.meta.glob("/src/assets/**/*.{png,jpg,dds,plist,xml,ccbi,fnt,txt}", {
    query: "?url",
    import: "default",
})

const PREFIX = "/src/assets/"

const index = new Map<string, () => Promise<unknown>>()
for (const [key, load] of Object.entries(loaders)) index.set(key.slice(PREFIX.length).toLowerCase(), load)

export const hasAsset = (path: string) => index.has(normalize(path))

function normalize(path: string) {
    return path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase()
}

export const assetUrl = async (path: string): Promise<string> => {
    const load = index.get(normalize(path))
    if (!load) throw new Error(`Asset not found: ${path}`)
    return (await load()) as string
}

export const fetchAssetText = async (path: string): Promise<string> => (await fetch(await assetUrl(path))).text()

export const fetchAssetBuffer = async (path: string): Promise<ArrayBuffer> => (await fetch(await assetUrl(path))).arrayBuffer()

export const dirname = (path: string) => {
    const cut = path.lastIndexOf("/")
    return cut < 0 ? "" : path.slice(0, cut)
}

export const joinPath = (...parts: string[]) => parts.filter(Boolean).join("/").replace(/\/{2,}/g, "/")
