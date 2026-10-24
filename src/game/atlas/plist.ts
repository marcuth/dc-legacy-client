export type PlistValue = string | number | boolean | PlistValue[] | { [key: string]: PlistValue }

const TOKEN = /<(\/?)(dict|array|key|string|integer|real|true|false)\s*(\/?)>|([^<]+)/g

const unescapeXml = (text: string) =>
    text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")

/** Minimal Apple XML plist reader (no DOM so it also runs under Node). */
export const parsePlist = (xml: string): PlistValue => {
    const body = xml.slice(xml.indexOf("<plist"))
    const tokens: { tag: string; close: boolean; self: boolean; text: string }[] = []
    for (const match of body.matchAll(TOKEN)) {
        if (match[4] !== undefined) {
            if (match[4].trim()) tokens.push({ tag: "", close: false, self: false, text: match[4] })
        } else {
            tokens.push({ tag: match[2], close: match[1] === "/", self: match[3] === "/", text: "" })
        }
    }

    let index = 0
    const peekText = () => (tokens[index]?.tag === "" ? tokens[index++].text : "")

    const readValue = (): PlistValue => {
        const token = tokens[index++]
        switch (token.tag) {
            case "true":
                if (!token.self) index++
                return true
            case "false":
                if (!token.self) index++
                return false
            case "string": {
                if (token.self) return ""
                const text = peekText()
                index++
                return unescapeXml(text)
            }
            case "integer":
            case "real": {
                const text = peekText()
                index++
                return Number(text.trim())
            }
            case "array": {
                const list: PlistValue[] = []
                if (token.self) return list
                while (!(tokens[index].close && tokens[index].tag === "array")) list.push(readValue())
                index++
                return list
            }
            case "dict": {
                const dict: { [key: string]: PlistValue } = {}
                if (token.self) return dict
                while (!(tokens[index].close && tokens[index].tag === "dict")) {
                    index++ // <key>
                    const key = unescapeXml(peekText())
                    index++ // </key>
                    dict[key] = readValue()
                }
                index++
                return dict
            }
            default:
                throw new Error(`Unexpected plist tag <${token.tag}>`)
        }
    }

    while (tokens[index] && (tokens[index].tag === "" || tokens[index].tag === "plist")) index++
    return readValue()
}
