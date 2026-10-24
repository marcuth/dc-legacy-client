import { createHmac, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import { DEFAULT_HMAC_KEY } from "../src/game/network/mobile/signing.ts"
import { buildConfig } from "./catalog.ts"

export type Form = Record<string, string>

export type MockResponse = {
    status: number
    body: string
    headers: Record<string, string>
}

type UserNode = {
    timestamp: number
    playerInfo: Record<string, number | string>
    map: Record<string, unknown>
    [key: string]: unknown
}

type Account = {
    id: string
    /** Last command number applied, so a resent batch is not applied twice. */
    lastCommand: number
    user: UserNode
}

type Sessions = Map<string, { userId: string }>

export type MockServerOptions = {
    /** JSON file the accounts are kept in; omit to keep them in memory only. */
    storePath?: string
    hmacKey?: string
    /** Unix time in seconds. */
    now?: () => number
    staticUrl?: string
}

type Command = { cmd: string; number: string; time: string; args: unknown[] }

const STARTING = { gold: 1000, cash: 20, food: 500 }
const FIRST_USER_ID = 10_000_001

/**
 * A stand-in for the Social Point server: the paths and payload shapes follow docs/protocol.md, the game data is
 * made up (see catalog.ts). It signs every response like the original (`x-sp-sign`, HMAC-SHA256).
 */
export class MockServer {
    private accounts = new Map<string, Account>()
    private deviceToAccount = new Map<string, string>()
    private sessions: Sessions = new Map()
    private readonly hmacKey: string
    private readonly now: () => number

    constructor(private readonly options: MockServerOptions = {}) {
        this.hmacKey = options.hmacKey ?? DEFAULT_HMAC_KEY
        this.now = options.now ?? (() => Math.floor(Date.now() / 1000))
        this.load()
    }

    /** Dispatches one POST by path, returning the signed response. */
    handle(path: string, form: Form): MockResponse {
        try {
            switch (path) {
                case "/game/config/prelogin_config":
                    return this.json(this.prelogin())
                case "/mobile/aio/login":
                    return this.json(this.login(form))
                case "/player/info":
                    return this.json(this.playerInfo(form))
                case "/packet/execution":
                    return this.json(this.execute(form))
                case "/mobile/crash":
                case "/mobile/notifications":
                case "/mobile/tutorial":
                    return this.json({ result: true })
                default:
                    return this.plain(404, `No mock for ${path}`)
            }
        } catch (error) {
            if (error instanceof HttpError) return this.plain(error.status, error.message)
            throw error
        }
    }

    private prelogin() {
        // Only the platform is sent; the real answer drives the splash screen variant [?].
        return { result: true, splash_type: 1, maintenance: false }
    }

    private login(form: Form) {
        const deviceUid = form.deviceUid || form.mobileuser
        if (!deviceUid) throw new HttpError(400, "Missing deviceUid")

        let account = this.accounts.get(this.deviceToAccount.get(deviceUid) ?? "")
        if (!account) {
            account = this.createAccount(form.mobileuser || undefined)
            this.deviceToAccount.set(deviceUid, account.id)
            this.save()
        }

        const sessionId = randomBytes(16).toString("hex")
        this.sessions.set(sessionId, { userId: account.id })
        account.lastCommand = 0
        account.user.timestamp = this.now()
        this.save()

        return {
            sp: account.id,
            session_id: sessionId,
            mobile_user_tp: `mock-${account.id}`,
            user: account.user,
            config: buildConfig(this.options.staticUrl ?? "/dragoncity/web"),
        }
    }

    private playerInfo(form: Form) {
        const account = this.authorize(form)
        account.user.timestamp = this.now()
        return account.user
    }

    private execute(form: Form) {
        const account = this.authorize(form)
        let batch: { first_number: number; ts: number; commands: Command[] }
        try {
            batch = JSON.parse(form.data ?? "")
        } catch {
            throw new HttpError(400, "VALIDATION ERROR")
        }

        const response = batch.commands.map((command) => {
            const number = Number(command.number)
            // A batch the client had to resend must not be applied twice.
            const fresh = number > account.lastCommand
            if (fresh) {
                this.apply(account, command)
                account.lastCommand = number
            }
            return { cmd: command.cmd, number: command.number, result: true }
        })
        this.save()
        return { result: true, response }
    }

    /** The few commands whose effect the client shows; everything else is acknowledged unchanged. */
    private apply(account: Account, command: Command) {
        const info = account.user.playerInfo
        const [first] = command.args
        switch (command.cmd) {
            case "level_up":
                info.level = Number(first) || info.level
                break
            case "complete_tutorial":
                info.completed_tutorial = Number(first) || 0
                break
            case "win_daily_bonus":
                info.food = Number(info.food) + 50
                break
            case "set_login_rewarded":
                account.user.mobileFbLoginRewarded = true
                break
            default:
                break
        }
    }

    private authorize(form: Form): Account {
        const session = this.sessions.get(form.user_key ?? "")
        const account = session && this.accounts.get(session.userId)
        if (!session || !account || form.USERID !== account.id) throw new HttpError(403, "Invalid session")
        return account
    }

    private createAccount(mobileUser?: string): Account {
        const id = String(FIRST_USER_ID + this.accounts.size)
        const now = this.now()
        const account: Account = {
            id,
            lastCommand: 0,
            user: {
                timestamp: now,
                playerInfo: {
                    pid: id,
                    name: mobileUser ?? `Player ${id}`,
                    ...STARTING,
                    xp: 0,
                    level: 1,
                    completed_tutorial: 0,
                    pvpLevel: 1,
                    tsReg: now,
                },
                map: {
                    // [itemId, x, y, parentId, frame, flag, attributes]; x, y is the front corner of the footprint.
                    items: {
                        "1": [1, 22, 71, 0, 0, 0, {}],
                        "2": [16, 22, 63, 0, 0, 0, {}],
                        "3": [26, 28, 63, 0, 0, 0, {}],
                    },
                    eggs: {},
                    islandNumber: 1,
                    work: {},
                    resourceAlliesMarket: {},
                    // Dragons by uid: `type` is the item id and `habitatId` the uid of the building they live in [?].
                    ownedDragons: {
                        "1": { type: 1011, habitatId: "3", name: "Terra", xp: 0, nbKill: 0, work_id: 0, attack: [] },
                        "2": { type: 1011, habitatId: "3", name: "Rocky", xp: 0, nbKill: 0, work_id: 0, attack: [] },
                    },
                    store: {},
                    universAttackWin: 0,
                    receivedAssists: [],
                },
                // Private state [?]: where these keys live inside `user` was not confirmed.
                bonusNextId: 1,
                goals: [],
                completedGoals: [],
                gifts: {},
                mobileFbLoginRewarded: false,
                starterPackageOwned: false,
            },
        }
        this.accounts.set(id, account)
        return account
    }

    private json(payload: unknown): MockResponse {
        const body = JSON.stringify(payload)
        return {
            status: 200,
            body,
            headers: {
                "content-type": "application/json",
                "x-sp-sign": createHmac("sha256", this.hmacKey).update(body).digest("hex"),
            },
        }
    }

    private plain(status: number, body: string): MockResponse {
        return { status, body, headers: { "content-type": "text/plain" } }
    }

    private load() {
        const path = this.options.storePath
        if (!path || !existsSync(path)) return
        const saved = JSON.parse(readFileSync(path, "utf8")) as { accounts: Account[]; devices: [string, string][] }
        for (const account of saved.accounts) this.accounts.set(account.id, account)
        for (const [device, id] of saved.devices) this.deviceToAccount.set(device, id)
    }

    private save() {
        const path = this.options.storePath
        if (!path) return
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, JSON.stringify({ accounts: [...this.accounts.values()], devices: [...this.deviceToAccount] }, null, 2))
    }
}

class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message)
    }
}
