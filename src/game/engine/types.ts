import type { GameStore } from "../core/gameStore"

export interface GameBootstrapOptions {
  playerId: string
  playerName: string
  loader: string
  servicesPath: string
  flashVars: Record<string, string | boolean>
  legacyHosts: string[]
  origin: string
  /** Shared with the React HUD; tracks the player's resources to keep it up to date. */
  store?: GameStore
  /** A control of the in-engine interface that has no implementation yet (e.g. "buyGold"). */
  onUiAction?: (action: string) => void
  onSaved?: () => void
  onError?: (error: Error) => void
  onStatusChange?: (status: "loading" | "ready" | "error", message?: string) => void
}

export interface GameEngineAdapter {
  readonly id: "pixi"
  readonly name: string
  mount(container: HTMLElement, options: GameBootstrapOptions): Promise<void>
  unmount(): void
  /** Re-reads the save after the server reports a saved packet. */
  refresh?(): Promise<void>
}
