import { Application, Container } from "pixi.js"
import { useEffect, useRef } from "react"

import { fetchAssetBuffer } from "@/game/atlas/assetFiles"
import { buildCCB } from "@/game/ccb/build"
import { parseCCB } from "@/game/ccb/reader"
import { loadCCBResources } from "@/game/ccb/resources"
import { boot } from "@/game/boot"
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

    const view = new Container()
    app.stage.addChild(view)
    fitTo(app, view)
    const bootHost = new Container()
    view.addChild(bootHost)

    const layer = new PopupLayer(DESIGN)
    let hud: Awaited<ReturnType<typeof createHud>> | undefined

    const onTick = (callback: (deltaSeconds: number) => void) => {
        const tick = (ticker: { deltaMS: number }) => callback(ticker.deltaMS / 1000)
        app.ticker.add(tick)
        return () => app.ticker.remove(tick)
    }

    await boot({ context, host: bootHost, onTick, autoLogin: remembered() && !params.has("fresh") }, session, async (report) => {
        report(0.2, "Loading")
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
    ;(window as unknown as { game: unknown }).game = { session, layer, hud, context }
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
            await (params.has("ccb") ? viewer(app, params) : game(app, params))
        }
        void start().catch((error) => console.error(error))
        return () => {
            disposed = true
        }
    }, [])

    return <div ref={host} style={{ width: "100%", height: "100%" }} />
}
