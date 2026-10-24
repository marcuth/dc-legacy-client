import { join } from "node:path"

import type { Plugin } from "vite"

import { MockServer, type Form } from "./server"

const PATHS = ["/game/", "/mobile/", "/packet/", "/player/", "/pvp/", "/users/", "/merge/", "/requests"]

/** Serves the mock game server from the Vite dev server so the browser client can call it same-origin. */
export const mockServerPlugin = (root: string): Plugin => ({
    name: "dragon-city-mock-server",
    configureServer(server) {
        const mock = new MockServer({ storePath: join(root, "mock-server", "data", "accounts.json") })

        server.middlewares.use((request, response, next) => {
            const url = new URL(request.url ?? "/", "http://localhost")
            if (request.method !== "POST" || !PATHS.some((prefix) => url.pathname.startsWith(prefix))) return next()

            const chunks: Buffer[] = []
            request.on("data", (chunk: Buffer) => chunks.push(chunk))
            request.on("end", () => {
                const form: Form = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")))
                const result = mock.handle(url.pathname, form)
                response.statusCode = result.status
                for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value)
                response.end(result.body)
            })
        })
    },
})
