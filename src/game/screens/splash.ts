import { loadScreen, type CCBView, type ScreenContext } from "./CCBView"

export type LoginChoice = "facebook" | "standalone"

/** Share of the bar between the empty and full states, 0..1. */
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * CCB/SplashScreen: first the login choice, then the loading bar while the game starts.
 * `loginLayer` and `progressLayer` are alternatives; the gift banner belongs to the login state.
 */
export class SplashScreen {
    private emptyWidth = 0
    private startX = 0
    private height = 0

    private constructor(readonly view: CCBView) {
        const { scene } = view
        const empty = view.node("progressEmpty")
        const fill = view.node("progressSprite")
        this.emptyWidth = scene.sizeOf(empty).width
        this.height = scene.sizeOf(fill).height
        this.startX = fill.x
        view.node("backgroundVisitLayer").visible = false
    }

    static async load(context: ScreenContext): Promise<SplashScreen> {
        return new SplashScreen(await loadScreen("SplashScreen", context))
    }

    /** Shows the login buttons and resolves with the one the player pressed. */
    chooseLogin(options: { facebookAvailable: boolean }): Promise<LoginChoice> {
        const { view } = this
        view.node("loginLayer").visible = true
        view.node("progressLayer").visible = false
        view.node("freeDragonLayer").visible = true
        view.scene.play("show_gift")
        view.button("fbNormalButton").setEnabled(options.facebookAvailable)

        return new Promise((resolve) => {
            const unbind = view.bind({
                onStandaloneLoginButtonClicked: () => finish("standalone"),
                onFacebookButtonClicked: () => finish("facebook"),
            })
            const finish = (choice: LoginChoice) => {
                unbind()
                resolve(choice)
            }
        })
    }

    /** Switches to the loading bar. */
    showProgress(): void {
        const { view } = this
        view.node("loginLayer").visible = false
        view.node("freeDragonLayer").visible = false
        view.node("progressLayer").visible = true
        this.setProgress(0, "Loading")
    }

    setProgress(fraction: number, message?: string): void {
        const { view } = this
        const done = clamp01(fraction)
        view.scene.scale9.get("progressSprite")?.setSize(Math.max(1, this.emptyWidth * done), this.height)
        view.label("progressLabel").setText(`${Math.round(done * 100)}%`, true)
        view.node("bocataLayer").x = this.startX + this.emptyWidth * done
        if (message !== undefined) view.label("messageLabel").setText(message)
    }
}
