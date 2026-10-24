const ENTRY = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g
const COMMENT = /\/\*[\s\S]*?\*\//g

const unescape = (text: string) =>
    text.replace(/\\(n|t|"|\\)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c))

/** Parses an iOS `.strings` style table: `"key" = "value";` with block comments. */
export const parseStrings = (text: string): Map<string, string> => {
    const table = new Map<string, string>()
    for (const match of text.replace(COMMENT, "").matchAll(ENTRY)) table.set(unescape(match[1]), unescape(match[2]))
    return table
}

/**
 * The game looks every UI string up by its English text, so a missing entry falls back to the key
 * itself. Values use printf conversions (`%d`, `%s`, `%@`).
 */
export class Locale {
    constructor(private readonly table: Map<string, string>) {}

    tr = (key: string): string => this.table.get(key) ?? key

    /** Looks `key` up and fills its placeholders in order (`%1$d` style positions are honoured). */
    format = (key: string, ...args: (string | number)[]): string => {
        let next = 0
        return this.tr(key).replace(/%(?:(\d+)\$)?[@sdif]/g, (_, position?: string) => {
            const value = args[position ? Number(position) - 1 : next++]
            return value === undefined ? "" : String(value)
        })
    }
}
