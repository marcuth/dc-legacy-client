import type { PlayerResources } from "./economy"

type Listener = () => void

/** Minimal observable holder for the player's resources, shared by the renderer and the React HUD. */
export class GameStore {
  private resources: PlayerResources | null = null
  private listeners = new Set<Listener>()

  getSnapshot = (): PlayerResources | null => this.resources

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  set(resources: PlayerResources): void {
    this.resources = resources
    this.emit()
  }

  addGold(amount: number): void {
    if (!this.resources) return
    this.set({ ...this.resources, gold: this.resources.gold + amount })
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
