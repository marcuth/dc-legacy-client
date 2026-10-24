import type { Container } from "pixi.js"

import { loadScreen, type ScreenContext } from "./screens/CCBView"
import { SplashScreen } from "./screens/splash"
import type { GameSession } from "./session/GameSession"

export type BootEnvironment = {
    context: ScreenContext
    /** Where the boot screens are shown. */
    host: Container
    /** Registers a per-frame callback (seconds since the last frame). */
    onTick(callback: (deltaSeconds: number) => void): () => void
    /** Skips the login choice and logs in straight away (the player already chose before). */
    autoLogin?: boolean
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * What the app does from launch to the first game frame: the Social Point logo while the pre-login config is fetched,
 * then the splash screen with the login choice and a loading bar that follows the login and the asset loading.
 */
export const boot = async (
    env: BootEnvironment,
    session: GameSession,
    loadGame: (report: (fraction: number, message?: string) => void) => Promise<void>,
): Promise<void> => {
    const { host, context } = env

    const logo = await loadScreen("SocialPointScreenView", context)
    logo.scene.play(0)
    const stopLogo = env.onTick((dt) => logo.scene.update(dt))
    host.addChild(logo.center().root)
    await Promise.all([session.prelogin(), wait(1200)])
    stopLogo()
    // Not destroyed: destroying a screen's sprites stalled later texture loads (pending Assets.load).
    logo.root.removeFromParent()

    const splash = await SplashScreen.load(context)
    const stopSplash = env.onTick((dt) => splash.view.scene.update(dt))
    host.addChild(splash.view.root)

    if (!env.autoLogin) await splash.chooseLogin({ facebookAvailable: false })
    splash.showProgress()

    splash.setProgress(0.1, "Connecting")
    await session.login()
    splash.setProgress(0.4, "Loading")
    await loadGame((fraction, message) => splash.setProgress(0.4 + fraction * 0.6, message))
    splash.setProgress(1)

    await wait(250)
    stopSplash()
    splash.view.root.removeFromParent()
}
