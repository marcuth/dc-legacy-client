import type { GameConfig, PlayerSaveData } from "../core/types"

/**
 * Decodes the Dragon City server response envelope (<sha256_hash>;<json_payload>)
 */
export const decodeSignedPayload = <T>(text: string): T => {
  const semicolonIndex = text.indexOf(";")
  const jsonString = semicolonIndex >= 0 ? text.slice(semicolonIndex + 1) : text
  return JSON.parse(jsonString) as T
}

export interface CommandPacket {
  cmd: string
  number: number
  args: unknown[]
}

export class DragonCityApiClient {
  private servicesPath: string

  constructor(servicesPath = "/static/dragoncity/") {
    this.servicesPath = servicesPath.endsWith("/") ? servicesPath : `${servicesPath}/`
  }

  async fetchPlayerInfo(): Promise<PlayerSaveData> {
    const url = `${this.servicesPath}srv/get_player_info.php`
    const response = await fetch(url, { credentials: "same-origin" })
    if (!response.ok) {
      throw new Error(`Failed to fetch player info: ${response.status}`)
    }
    const text = await response.text()
    const save = decodeSignedPayload<PlayerSaveData>(text)
    if (!save?.playerInfo || !save.map) {
      throw new Error("The server did not return a game save.")
    }
    return save
  }

  async fetchGameConfig(): Promise<GameConfig> {
    const url = `${this.servicesPath}srv/get_game_config.php`
    const response = await fetch(url, { credentials: "same-origin" })
    if (!response.ok) {
      throw new Error(`Failed to fetch game config: ${response.status}`)
    }
    const text = await response.text()
    return decodeSignedPayload<GameConfig>(text)
  }

  /** Claims `gold` from a habitat; the server caps it to what the dragons could have produced. */
  async collectGold(isoId: string, gold: number): Promise<void> {
    await this.sendCommands([{ cmd: "collect", number: Date.now(), args: [isoId, gold] }])
  }

  async sendCommands(commands: CommandPacket[]): Promise<unknown> {
    const payload = JSON.stringify({ commands })
    const body = new URLSearchParams()
    body.set("data", `dummy_signature;${payload}`)

    const url = `${this.servicesPath}packet.php`
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      credentials: "same-origin",
    })

    if (!response.ok) {
      throw new Error(`Packet dispatch failed: ${response.status}`)
    }

    const text = await response.text()
    try {
      return decodeSignedPayload(text)
    } catch {
      return text
    }
  }
}
