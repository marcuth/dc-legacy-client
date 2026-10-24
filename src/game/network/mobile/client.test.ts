import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { test } from "node:test"

import { MobileClient, SignatureError, commands, hmacSha256Hex, DEFAULT_HMAC_KEY } from "./index"

interface Call {
  path: string
  form: URLSearchParams
  headers: Record<string, string>
}

/** Stand-in for the game server: records requests and signs responses like x-sp-sign does. */
function fakeServer(handler: (path: string, form: URLSearchParams) => unknown, sign = true) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const form = new URLSearchParams(String(init.body))
    calls.push({ path, form, headers: init.headers as Record<string, string> })
    const body = JSON.stringify(handler(path, form))
    const headers = new Headers()
    if (sign) headers.set("x-sp-sign", createHmac("sha256", DEFAULT_HMAC_KEY).update(body).digest("hex"))
    return new Response(body, { status: 200, headers })
  }) as typeof fetch
  return { calls, fetchImpl }
}

const loginParams = {
  logintype: "not-fb",
  language: "en",
  mobileBundleVersion: "2.0",
  os: "4.1",
  device: "test",
  deviceUid: "uid-1",
} as const

const loginHandler = (path: string) => (path === "/mobile/aio/login" ? { sp: "42", session_id: "sess", user: { playerInfo: {} }, config: {} } : {})

test("hmacSha256Hex matches node's HMAC", async () => {
  assert.equal(await hmacSha256Hex(DEFAULT_HMAC_KEY, "hello"), createHmac("sha256", DEFAULT_HMAC_KEY).update("hello").digest("hex"))
})

test("login reads sp / session_id / user / config", async () => {
  const server = fakeServer(loginHandler)
  const client = new MobileClient({ fetch: server.fetchImpl })
  const result = await client.login(loginParams)
  assert.equal(result.userId, "42")
  assert.equal(result.sessionId, "sess")
  assert.deepEqual(result.user, { playerInfo: {} })
  assert.equal(server.calls[0].headers["X-Accept"], "sp-sign")
  assert.equal(server.calls[0].form.get("logintype"), "not-fb")
})

test("unsigned or badly signed responses are rejected", async () => {
  const unsigned = new MobileClient({ fetch: fakeServer(loginHandler, false).fetchImpl })
  await assert.rejects(unsigned.login(loginParams), SignatureError)

  const bad = (async () => new Response("{}", { headers: { "x-sp-sign": "0".repeat(64) } })) as typeof fetch
  await assert.rejects(new MobileClient({ fetch: bad }).prelogin(), SignatureError)
})

test("packet/execution wire format", async () => {
  const server = fakeServer((path, form) => {
    if (path === "/mobile/aio/login") return { sp: "42", session_id: "sess" }
    const batch = JSON.parse(form.get("data")!)
    return { result: true, response: batch.commands.map((c: { cmd: string }) => ({ cmd: c.cmd })) }
  })
  const client = new MobileClient({ fetch: server.fetchImpl, now: () => 1000 })
  await client.login(loginParams)

  const result = await client.execute(commands.buy(10, 3, 4), commands.collect(7))
  assert.equal(result.ok, true)

  const call = server.calls[1]
  assert.equal(call.path, "/packet/execution")
  assert.equal(call.form.get("USERID"), "42")
  assert.equal(call.form.get("user_key"), "sess")
  assert.equal(call.form.get("platform"), "android")
  assert.equal(
    call.form.get("data"),
    '{"first_number":1,"ts":1000,"commands":[' +
      '{"cmd":"buy","number":"1","time":"1000","args":[10,3,4,0]},' +
      '{"cmd":"collect","number":"2","time":"1000","args":[7]}]}',
  )
})

test("server-side command errors are reported per command", async () => {
  const server = fakeServer((path, form) =>
    path === "/mobile/aio/login" ? { sp: "1", session_id: "s" } : { result: true, response: [{ cmd: "sell" }, { error: "no_item" }] },
  )
  const client = new MobileClient({ fetch: server.fetchImpl })
  await client.login(loginParams)
  const result = await client.execute(commands.sell(1), commands.sell(2))
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].number, 2)
})

test("a failed flush keeps the batch queued for retry", async () => {
  let fail = true
  const server = fakeServer((path, form) => {
    if (path === "/mobile/aio/login") return { sp: "1", session_id: "s" }
    if (fail) throw new Error("down")
    return { result: true, response: [{}] }
  })
  const client = new MobileClient({ fetch: server.fetchImpl })
  await client.login(loginParams)
  client.enqueue(commands.levelUp(5))
  await assert.rejects(client.flush())
  fail = false
  const retry = await client.flush()
  assert.equal(retry.responses.length, 1)
  assert.equal(JSON.parse(server.calls.at(-1)!.form.get("data")!).first_number, 1)
})
