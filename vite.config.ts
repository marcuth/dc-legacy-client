import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { mockServerPlugin } from "./mock-server/vitePlugin.ts"

export default defineConfig({
    plugins: [react(), mockServerPlugin(fileURLToPath(new URL(".", import.meta.url)))],
    build: { assetsInlineLimit: 0 },
    resolve: {
        alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
})
