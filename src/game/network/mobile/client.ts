import type { Command } from "./commands"
import {
  DEFAULT_HMAC_KEY,
  SIGN_REQUEST_HEADER,
  SIGN_REQUEST_VALUE,
  SIGN_RESPONSE_HEADER,
  verifySignature,
} from "./signing"

/** `ServiceLocator::loadAppServices` calls `BaseServer::setBaseServerUrl` with this value. */
export const DEFAULT_BASE_URL = "http://dca.socialpointgames.com/"

export interface LoginParams {
  /** `not-fb` or `fb` (SPSocialConnection::loginWith[out]Facebook). */
  logintype: "not-fb" | "fb"
  /** Local mobile user id; empty on the first launch [?]. */
  mobileuser?: string
  language: string
  mobileBundleVersion: string
  os: string
  device: string
  deviceUid: string
  /** Facebook login only. */
  mobiletoken?: string
  mobilefacebooktoken?: string
  neighbors?: string
}

export interface LoginResult {
  /** `sp` in the response: the user id used as `USERID` afterwards. */
  userId: string
  sessionId: string
  /** `user` node: playerInfo / map / private state. Shape documented in docs/protocol.md section 5. */
  user: Record<string, unknown> | undefined
  /** `config` node: item catalog, levels, goals... (docs/protocol.md section 6). */
  config: Record<string, unknown> | undefined
  thirdPartyUserId: string | undefined
  raw: Record<string, unknown>
}

export interface CommandResponse {
  cmd?: string
  error?: unknown
  [key: string]: unknown
}

export interface MobileClientOptions {
  baseUrl?: string
  hmacKey?: string
  /** The original client rejects unsigned responses (HTTP 471). Disable only against servers that do not sign. */
  verifySignatures?: boolean
  platform?: string
  fetch?: typeof fetch
  /** Unix time source for `ts` and `time`; seconds are assumed [?]. */
  now?: () => number
}

export class SignatureError extends Error {
  constructor(public readonly path: string, reason: string) {
    super(`Validation error on ${path}: ${reason}`)
    this.name = "SignatureError"
  }
}

export class ProtocolError extends Error {
  constructor(message: string, public readonly detail?: unknown) {
    super(message)
    this.name = "ProtocolError"
  }
}

export class CommandError extends ProtocolError {
  constructor(public readonly command: Command, public readonly number: number, detail: unknown) {
    super(`Command error: ${command.cmd} ${number}`, detail)
    this.name = "CommandError"
  }
}

interface QueuedCommand {
  command: Command
  number: number
  time: number
}

export interface FlushResult {
  ok: boolean
  /** One entry per sent command, in order. */
  responses: CommandResponse[]
  /** Commands that failed on the server (`error` key); the original client asks to restart the game. */
  errors: CommandError[]
}

export class MobileClient {
  private readonly baseUrl: string
  private readonly hmacKey: string
  private readonly verifySignatures: boolean
  private readonly platform: string
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number

  private userId = ""
  private sessionId = ""
  private commandNumber = 0
  private pending: QueuedCommand[] = []
  private flushing: Promise<FlushResult> | null = null

  constructor(options: MobileClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    this.hmacKey = options.hmacKey ?? DEFAULT_HMAC_KEY
    this.verifySignatures = options.verifySignatures ?? true
    this.platform = options.platform ?? "android"
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000))
  }

  getUserId(): string {
    return this.userId
  }

  getSessionId(): string {
    return this.sessionId
  }

  /** Restores a session (e.g. from storage) without logging in again. */
  setSession(userId: string, sessionId: string, lastCommandNumber = 0): void {
    this.userId = userId
    this.sessionId = sessionId
    this.commandNumber = lastCommandNumber
  }

  /** `POST /game/config/prelogin_config` (SocialPointScreenController::checkSplashScreen). */
  prelogin(): Promise<Record<string, unknown>> {
    return this.post("/game/config/prelogin_config", { platform: this.platform })
  }

  /** `POST /mobile/aio/login`; the HTTP verb was not confirmed [?], the parameter names were. */
  async login(params: LoginParams): Promise<LoginResult> {
    const form: Record<string, string> = {
      logintype: params.logintype,
      mobileenv: this.platform,
      mobileuser: params.mobileuser ?? "",
      language: params.language,
      mobileBundleVersion: params.mobileBundleVersion,
      os: params.os,
      device: params.device,
      deviceUid: params.deviceUid,
    }
    if (params.logintype === "fb") {
      form.mobiletoken = params.mobiletoken ?? ""
      form.mobilefacebooktoken = params.mobilefacebooktoken ?? ""
      form.neighbors = params.neighbors ?? ""
    }

    const raw = await this.post("/mobile/aio/login", form)
    if (raw.error !== undefined) throw new ProtocolError("SP server error response", raw.error)

    const userId = String(raw.sp ?? "")
    const sessionId = String(raw.session_id ?? "")
    if (!userId || !sessionId) throw new ProtocolError("Login response without sp/session_id", raw)

    this.userId = userId
    this.sessionId = sessionId
    this.commandNumber = 0
    this.pending = []

    return {
      userId,
      sessionId,
      user: asRecord(raw.user),
      config: asRecord(raw.config),
      thirdPartyUserId: raw.mobile_user_tp === undefined ? undefined : String(raw.mobile_user_tp),
      raw,
    }
  }

  /** `POST /player/info` (PlayerInfoRetrieve::getPlayerInfo). `user` defaults to the logged-in user [?]. */
  playerInfo(user = this.userId): Promise<Record<string, unknown>> {
    this.requireSession()
    return this.post("/player/info", { USERID: this.userId, user, user_key: this.sessionId })
  }

  /** Queues a command and returns its sequence number. Nothing is sent until `flush`. */
  enqueue(command: Command): number {
    this.requireSession()
    const number = ++this.commandNumber
    this.pending.push({ command, number, time: this.now() })
    return number
  }

  /** Enqueues and sends in one call. */
  async execute(...list: Command[]): Promise<FlushResult> {
    for (const command of list) this.enqueue(command)
    return this.flush()
  }

  /** Sends the queued commands as one `POST /packet/execution` (CommandQueue::processCommandQueueWithUserId). */
  flush(): Promise<FlushResult> {
    // Like the original, only one batch is in flight at a time; later commands wait for the next flush.
    if (this.flushing) return this.flushing.then(() => this.flush())
    if (this.pending.length === 0) return Promise.resolve({ ok: true, responses: [], errors: [] })

    this.flushing = this.sendBatch().finally(() => {
      this.flushing = null
    })
    return this.flushing
  }

  /** Serializes a batch exactly like the original client (numbers and times are JSON strings). */
  static serializeBatch(batch: readonly { command: Command; number: number; time: number }[], ts: number): string {
    const commands = batch.map(({ command, number, time }) =>
      JSON.stringify({ cmd: command.cmd, number: String(number), time: String(time), args: command.args }),
    )
    return `{"first_number":${batch[0]?.number ?? 0},"ts":${ts},"commands":[${commands.join(",")}]}`
  }

  private async sendBatch(): Promise<FlushResult> {
    const batch = this.pending.slice()
    const data = MobileClient.serializeBatch(batch, this.now())

    // On failure the batch stays queued so a retry resends it (the original persists it to a pending-commands file).
    const raw = await this.post("/packet/execution", {
      USERID: this.userId,
      user_key: this.sessionId,
      platform: this.platform,
      data,
    })

    this.pending = this.pending.slice(batch.length)

    const responses = Array.isArray(raw.response) ? (raw.response as CommandResponse[]) : []
    const errors: CommandError[] = []
    batch.forEach(({ command, number }, index) => {
      const item = responses[index]
      if (item && item.error !== undefined) errors.push(new CommandError(command, number, item.error))
    })

    return { ok: errors.length === 0 && raw.result !== false, responses, errors }
  }

  private requireSession(): void {
    if (!this.userId || !this.sessionId) throw new ProtocolError("Not logged in")
  }

  private async post(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(this.baseUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        [SIGN_REQUEST_HEADER]: SIGN_REQUEST_VALUE,
      },
      body: new URLSearchParams(form).toString(),
    })

    const body = new Uint8Array(await response.arrayBuffer())
    if (!response.ok) throw new ProtocolError(`HTTP error: ${response.status}`, new TextDecoder().decode(body))

    if (this.verifySignatures) {
      const signature = response.headers.get(SIGN_RESPONSE_HEADER)
      if (signature === null) throw new SignatureError(path, "no signature header")
      if (!(await verifySignature(this.hmacKey, body, signature))) throw new SignatureError(path, "wrong signature")
    }

    const text = new TextDecoder().decode(body)
    try {
      const parsed: unknown = JSON.parse(text)
      return (asRecord(parsed) ?? { response: parsed }) as Record<string, unknown>
    } catch {
      throw new ProtocolError("SPSocial connection failed on parsing", text)
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}
