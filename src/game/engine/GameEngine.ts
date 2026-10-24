import { buildResources } from "../core/economy"
import { DragonCityApiClient } from "../network/dragonCityApi"
import { PixiWorld } from "../renderer/PixiWorld"
import type { GameConfig } from "../core/types"
import type { GameBootstrapOptions } from "./types"

export class GameEngine {
  private world: PixiWorld | null = null
  private client: DragonCityApiClient | null = null
  private config: GameConfig = {}
  private store: GameBootstrapOptions["store"]

  async mount(container: HTMLElement, options: GameBootstrapOptions): Promise<void> {
    options.onStatusChange?.("loading", "Connecting to Dragon City services...")

    const client = new DragonCityApiClient(options.servicesPath)
    this.client = client
    this.store = options.store

    try {
      options.onStatusChange?.("loading", "Loading island data & config...")
      const [playerSave, gameConfig] = await Promise.all([
        client.fetchPlayerInfo(),
        client.fetchGameConfig().catch((): GameConfig => ({})),
      ])
      this.config = gameConfig
      this.store?.set(buildResources(playerSave, gameConfig.levels))

      options.onStatusChange?.("loading", "Rendering isometric world with PixiJS...")
      const world = new PixiWorld()
      await world.init({
        container,
        saveData: playerSave,
        config: gameConfig,
        store: options.store,
        onUiAction: options.onUiAction,
        onCollectGold: async (isoId, gold) => {
          await client.collectGold(isoId, gold)
          this.store?.addGold(gold)
        },
      })

      this.world = world
      options.onStatusChange?.("ready")
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      options.onStatusChange?.("error", err.message)
      throw err
    }
  }

  async refresh(): Promise<void> {
    if (!this.client || !this.world) return
    const save = await this.client.fetchPlayerInfo()
    this.world.syncSave(save)
    this.store?.set(buildResources(save, this.config.levels))
  }

  unmount(): void {
    if (this.world) {
      this.world.destroy()
      this.world = null
    }
    this.client = null
  }
}
