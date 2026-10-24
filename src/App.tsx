import { Application, Container, Sprite } from "pixi.js"
import { useEffect, useRef } from "react"

import { fetchAssetBuffer } from "@/game/atlas/assetFiles"
import { loadAtlas } from "@/game/atlas/AtlasLoader"
import { buildCCB } from "@/game/ccb/build"
import { parseCCB } from "@/game/ccb/reader"
import { loadCCBResources } from "@/game/ccb/resources"
import { boot } from "@/game/boot"
import { IsoWorld } from "@/game/world/IsoWorld"
import { buildingsFromMap, dragonsFromMap } from "@/game/world/mapItems"
import { loadLocale, type LocaleCode } from "@/game/locale/loadLocale"
import { createHud } from "@/game/screens/hud"
import { GameSession } from "@/game/session/GameSession"
import { PopupLayer } from "@/game/screens/PopupLayer"
import { breedingSpeedUp, confirmAccount } from "@/game/screens/popups"

const DESIGN = { width: 480, height: 320 }

/** Fits the 480x320 design space into the window. */
const fitTo = (app: Application, view: Container) => {
    const fit = () => {
        const s = Math.min(app.screen.width / DESIGN.width, app.screen.height / DESIGN.height)
        view.scale.set(s)
        view.position.set((app.screen.width - DESIGN.width * s) / 2, (app.screen.height - DESIGN.height * s) / 2)
    }
    fit()
    app.renderer.on("resize", fit)
}

const localeOf = (params: URLSearchParams) => loadLocale((params.get("lang") as LocaleCode) ?? "en")

/** /?atlas=HD/Engine/s3tc/night_islands.plist : lays every frame of an atlas out on a grid. */
const atlasViewer = async (app: Application, path: string) => {
    const atlas = await loadAtlas(path)
    const view = new Container()
    app.stage.addChild(view)
    let x = 0, y = 0, row = 0
    for (const name of atlas.names()) {
        const sprite = new Sprite(atlas.get(name))
        if (x + sprite.width > app.screen.width) { x = 0; y += row + 4; row = 0 }
        sprite.position.set(x, y)
        view.addChild(sprite)
        x += sprite.width + 4
        row = Math.max(row, sprite.height)
    }
}

/** /?world&tile=22,63 : the island with a few test buildings and their footprints. */
const worldViewer = async (app: Application, params: URLSearchParams) => {
    const world = new IsoWorld({
        debugFootprints: true,
        debugMasks: params.has("masks"),
        onBuildingTap: (building) => console.log("building", building.id, building.itemId),
        onDragonTap: (dragon) => console.log("dragon", dragon.id),
        onEmptyTileTap: (tile) => console.log("tile", tile.x, tile.y),
    })
    app.stage.addChild(world.view)
    await world.load()
    const [tx, ty] = (params.get("tile") ?? "22,63").split(",").map(Number)
    world.centerOnTile({ x: tx, y: ty })
    await world.setBuildings([
        { id: "a", itemId: 16, x: tx, y: ty, width: 3, height: 3 },
        { id: "b", itemId: 26, x: tx + 6, y: ty, width: 4, height: 4 },
        { id: "c", itemId: 1, x: tx, y: ty + 8, width: 6, height: 6 },
        { id: "d", itemId: 999, x: tx + 8, y: ty + 8, width: 2, height: 2 },
    ])
    await world.setDragons([
        { id: "d1", itemId: 1011, habitatId: "b" },
        { id: "d2", itemId: 1011, habitatId: "b" },
    ])
    app.renderer.on("resize", () => world.resize(app.screen.width, app.screen.height))
    world.resize(app.screen.width, app.screen.height)
    app.ticker.add((ticker) => world.update(ticker.deltaMS / 1000))
    ;(window as unknown as { world: unknown }).world = world
}

/** /?ccb=CCB/SplashScreen.ccbi&seq=show_gift : shows one ccbi as it is stored. */
const viewer = async (app: Application, params: URLSearchParams) => {
    const doc = parseCCB(await fetchAssetBuffer(params.get("ccb")!))
    const resources = await loadCCBResources([doc], "HD")
    console.log("missing assets", [...resources.missing])
    const locale = await localeOf(params)
    const scene = buildCCB(doc, resources, { size: DESIGN, localize: locale.tr })
    const seq = params.get("seq")
    if (seq) scene.play(seq)

    const size = scene.sizeOf(scene.root)
    scene.root.position.set(
        DESIGN.width / 2 + (scene.root.pivot.x - size.width / 2),
        DESIGN.height / 2 + (scene.root.pivot.y - size.height / 2),
    )
    const view = new Container()
    view.addChild(scene.root)
    app.stage.addChild(view)
    fitTo(app, view)
    app.ticker.add((t) => scene.update(t.deltaMS / 1000))
}

const AUTO_LOGIN_KEY = "dc.autoLogin"

const remembered = () => {
    try {
        return localStorage.getItem(AUTO_LOGIN_KEY) === "1"
    } catch {
        return false
    }
}

/** Default: boot (logo, splash with login and loading bar), then the HUD bound to the session. */
const game = async (app: Application, params: URLSearchParams) => {
    const language = (params.get("lang") as LocaleCode) ?? "en"
    const context = { locale: await loadLocale(language), design: DESIGN }
    const session = GameSession.create({ language })

    // The island fills the window; the 480 x 320 interface sits above it.
    const world = new IsoWorld({
        debugFootprints: params.has("debug"),
        debugMasks: params.has("masks"),
        onBuildingTap: (building) => console.log("building", building),
        onEmptyTileTap: (tile) => console.log("tile", tile.x, tile.y),
    })
    const view = new Container()
    app.stage.addChild(world.view, view)
    fitTo(app, view)
    const bootHost = new Container()
    view.addChild(bootHost)
    app.renderer.on("resize", () => world.resize(app.screen.width, app.screen.height))
    app.ticker.add((ticker) => world.update(ticker.deltaMS / 1000))

    const layer = new PopupLayer(DESIGN)
    let hud: Awaited<ReturnType<typeof createHud>> | undefined

    const onTick = (callback: (deltaSeconds: number) => void) => {
        const tick = (ticker: { deltaMS: number }) => callback(ticker.deltaMS / 1000)
        app.ticker.add(tick)
        return () => app.ticker.remove(tick)
    }

    await boot({ context, host: bootHost, onTick, autoLogin: remembered() && !params.has("fresh") }, session, async (report) => {
        report(0.1, "Loading")
        await world.load()
        world.resize(app.screen.width, app.screen.height)
        await world.setBuildings(buildingsFromMap(session.user, session.config))
        await world.setDragons(dragonsFromMap(session.user))
        report(0.7)
        hud = await createHud(context, session.store, {
            onFood: () => {
                // A round trip through /packet/execution and /player/info: the server adds food, the HUD follows.
                void session.client.execute({ cmd: "win_daily_bonus", args: [1] }).then(() => session.refresh())
            },
            onGems: () =>
                void breedingSpeedUp(context, layer, {
                    secondsLeft: 1740,
                    gemCost: 3,
                    gems: session.store.getSnapshot()?.cash ?? 0,
                }).then((result) => {
                    if (result === "speedUp") void session.client.execute({ cmd: "speed_breeding", args: [1] })
                }),
            onGold: () => void confirmAccount(context, layer, { chosen: 12, other: 30 }),
        })
        report(1)
    })
    try {
        localStorage.setItem(AUTO_LOGIN_KEY, "1")
    } catch {
        // Storage can be unavailable (private windows); the login choice is then asked every time.
    }

    view.addChild(hud!.view.root, layer.root)
    ;(window as unknown as { game: unknown }).game = { session, layer, hud, context, world }
}

export default function App() {
    const host = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const app = new Application()
        let disposed = false
        const start = async () => {
            await app.init({ resizeTo: window, background: "#1b3a4b", antialias: true })
            if (disposed) return app.destroy(true)
            host.current?.appendChild(app.canvas)
            const params = new URLSearchParams(location.search)
            await (params.has("world") ? worldViewer(app, params) : params.has("atlas") ? atlasViewer(app, params.get("atlas")!) : params.has("ccb") ? viewer(app, params) : game(app, params))
        }
        void start().catch((error) => console.error(error))
        return () => {
            disposed = true
        }
    }, [])

    return <div ref={host} style={{ width: "100%", height: "100%" }} />
}
