import assert from "node:assert/strict"
import { test } from "node:test"

import { MobileClient, SignatureError } from "../src/game/network/mobile/index.ts"
import { MockServer } from "./server.ts"

/** A fetch that talks to the mock directly, with the same wire format the browser would use. */
const connect = (server: MockServer, tamper = false): typeof fetch =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")))
        const result = server.handle(path, form)
        const headers = new Headers(result.headers)
        if (tamper) headers.set("x-sp-sign", "0".repeat(64))
        return new Response(result.body, { status: result.status, headers })
    }) as typeof fetch

const login = { logintype: "not-fb" as const, language: "en", mobileBundleVersion: "1", os: "web", device: "test", deviceUid: "device-1" }

test("login returns a signed user and config the client accepts", async () => {
    const client = new MobileClient({ baseUrl: "", fetch: connect(new MockServer()) })
    const result = await client.login(login)
    assert.equal(result.userId, "10000001")
    assert.equal((result.user!.playerInfo as Record<string, unknown>).level, 1)
    assert.ok(Object.keys(result.config!.levels as object).length >= 50)
})

test("the same device gets the same account back", async () => {
    const server = new MockServer()
    const first = await new MobileClient({ baseUrl: "", fetch: connect(server) }).login(login)
    const second = await new MobileClient({ baseUrl: "", fetch: connect(server) }).login(login)
    assert.equal(first.userId, second.userId)
    assert.notEqual(first.sessionId, second.sessionId)
})

test("a response with a wrong signature is rejected", async () => {
    const client = new MobileClient({ baseUrl: "", fetch: connect(new MockServer(), true) })
    await assert.rejects(client.login(login), SignatureError)
})

test("commands change the state that /player/info reports", async () => {
    const client = new MobileClient({ baseUrl: "", fetch: connect(new MockServer()) })
    await client.login(login)
    const flushed = await client.execute({ cmd: "level_up", args: [5] }, { cmd: "win_daily_bonus", args: [1] })
    assert.equal(flushed.ok, true)
    assert.equal(flushed.responses.length, 2)

    const info = (await client.playerInfo()).playerInfo as Record<string, number>
    assert.equal(info.level, 5)
    assert.equal(info.food, 550)
})

test("moving a building changes the map that /player/info reports", async () => {
    const client = new MobileClient({ baseUrl: "", fetch: connect(new MockServer()) })
    await client.login(login)
    await client.execute({ cmd: "move", args: ["2", 40, 50, 0] })
    const map = (await client.playerInfo()).map as { items: Record<string, number[]> }
    assert.deepEqual(map.items["2"].slice(0, 3), [16, 40, 50])
})

test("a resent batch is not applied twice", async () => {
    const server = new MockServer()
    const client = new MobileClient({ baseUrl: "", fetch: connect(server) })
    await client.login(login)
    await client.execute({ cmd: "win_daily_bonus", args: [1] })
    // Same number again, as after a lost response.
    client.setSession(client.getUserId(), client.getSessionId(), 0)
    await client.execute({ cmd: "win_daily_bonus", args: [1] })
    const info = (await client.playerInfo()).playerInfo as Record<string, number>
    assert.equal(info.food, 550)
})

test("requests with a wrong session are refused", async () => {
    const client = new MobileClient({ baseUrl: "", fetch: connect(new MockServer()) })
    await client.login(login)
    client.setSession(client.getUserId(), "forged")
    await assert.rejects(client.playerInfo(), /HTTP error: 403/)
})
