import { GameStore } from "../core/gameStore"
import { MobileClient, type LoginResult } from "../network/mobile"
import { resourcesFromUser } from "./playerResources"

const DEVICE_KEY = "dc.deviceUid"

const randomId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)

/** A stable id for this browser, standing in for the Android device uid the app sends. */
export const deviceUid = (storage: Pick<Storage, "getItem" | "setItem"> = localStorage): string => {
    try {
        let id = storage.getItem(DEVICE_KEY)
        if (!id) {
            id = randomId()
            storage.setItem(DEVICE_KEY, id)
        }
        return id
    } catch {
        return randomId()
    }
}

export type SessionOptions = {
    /** Server origin; empty means same origin (the Vite dev server hosts the mock). */
    baseUrl?: string
    language?: string
    verifySignatures?: boolean
    fetch?: typeof fetch
    deviceUid?: string
}

/** The logged-in player: protocol client, shared resource store and the config the server sent. */
export class GameSession {
    readonly store = new GameStore()
    config: Record<string, unknown> = {}
    user: Record<string, unknown> = {}

    private constructor(readonly client: MobileClient, private readonly options: SessionOptions) {}

    static create(options: SessionOptions = {}): GameSession {
        const client = new MobileClient({ baseUrl: options.baseUrl ?? "", fetch: options.fetch, verifySignatures: options.verifySignatures })
        return new GameSession(client, options)
    }

    /** `POST /game/config/prelogin_config`, what the splash controller asks before showing the login. */
    prelogin() {
        return this.client.prelogin()
    }

    /** Logs in without Facebook and fills the store from the answer. */
    async login(): Promise<LoginResult> {
        const result = await this.client.login({
            logintype: "not-fb",
            language: this.options.language ?? "en",
            mobileBundleVersion: "2.0",
            os: "web",
            device: "browser",
            deviceUid: this.options.deviceUid ?? deviceUid(),
        })
        this.user = result.user ?? {}
        this.config = result.config ?? {}
        this.store.set(resourcesFromUser(this.user, this.config))
        return result
    }

    /** Re-reads the player from the server (`/player/info`) after commands changed it. */
    async refresh(): Promise<void> {
        this.user = await this.client.playerInfo()
        this.store.set(resourcesFromUser(this.user, this.config))
    }
}
