/**
 * HMAC-SHA256 signing used by `hydra::ValidateHttpClient` (libdc.so @0x5fead0).
 * The server signs every response body and sends the hex digest in `x-sp-sign`.
 */

/** Key passed to `DCValidateHttpClient` in `ServiceLocator::loadAppServices` (libdc.so rodata 0x8a4b87). */
export const DEFAULT_HMAC_KEY = "RGhXbiy4xEeDnSNX1oBG"

export const SIGN_REQUEST_HEADER = "X-Accept"
export const SIGN_REQUEST_VALUE = "sp-sign"
export const SIGN_RESPONSE_HEADER = "x-sp-sign"

const encoder = new TextEncoder()

export async function hmacSha256Hex(key: string, body: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const data = typeof body === "string" ? encoder.encode(body) : body
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data))
  let hex = ""
  for (const byte of signature) hex += byte.toString(16).padStart(2, "0")
  return hex
}

export async function verifySignature(key: string, body: string | Uint8Array<ArrayBuffer>, received: string | null): Promise<boolean> {
  if (!received) return false
  const expected = await hmacSha256Hex(key, body)
  const given = received.trim().toLowerCase()
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0
}
