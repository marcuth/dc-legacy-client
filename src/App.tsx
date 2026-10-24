import { Application, Container } from "pixi.js"
import { useEffect, useRef } from "react"

import { fetchAssetBuffer } from "@/game/atlas/assetFiles"
import { buildCCB } from "@/game/ccb/build"
import { parseCCB } from "@/game/ccb/reader"
import { loadCCBResources } from "@/game/ccb/resources"
import { GameStore } from "@/game/core/gameStore"
import { loadLocale, type LocaleCode } from "@/game/locale/loadLocale"
import { createHud } from "@/game/screens/hud"
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

/** Default: the HUD bound to a store, with popups opened from its buttons. */
const demo = async (app: Application, params: URLSearchParams) => {
    const context = { locale: await localeOf(params), design: DESIGN }
    const store = new GameStore()
    store.set({ name: "Player", level: 12, xp: 5400, levelFloorXp: 5000, levelCeilXp: 6000, gold: 25_000, food: 3200, cash: 48, dragons: 7 })

    const layer = new PopupLayer(DESIGN)
    const view = new Container()
    app.stage.addChild(view)
    fitTo(app, view)

    const hud = await createHud(context, store, {
        onGems: () =>
            void breedingSpeedUp(context, layer, { secondsLeft: 1740, gemCost: 3, gems: store.getSnapshot()?.cash ?? 0 }).then((r) =>
                console.log("breeding popup:", r),
            ),
        onGold: () => void confirmAccount(context, layer, { chosen: 12, other: 30 }).then((r) => console.log("account popup:", r)),
        onFood: () => {
            const now = store.getSnapshot()!
            store.set({ ...now, food: now.food + 100, xp: now.xp + 100 })
        },
    })
    view.addChild(hud.view.root, layer.root)
    ;(window as unknown as { demo: unknown }).demo = { store, layer, hud, context }
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
            await (params.has("ccb") ? viewer(app, params) : demo(app, params))
        }
        void start().catch((error) => console.error(error))
        return () => {
            disposed = true
        }
    }, [])

    return <div ref={host} style={{ width: "100%", height: "100%" }} />
}
