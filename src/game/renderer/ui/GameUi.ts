import { Container } from "pixi.js"
import type { GameStore } from "../../core/gameStore"
import { TopBar, type TopBarAction } from "./TopBar"
import { UiAssets } from "./UiAssets"

/** The Flash client lays its GUI out in a 760px column centred on the stage (GUI.widescreen). */
const GUI_WIDTH = 760

export type UiAction = TopBarAction

/** Screen-space interface drawn over the world, rebuilt from the original Flash art. */
export class GameUi extends Container {
  private unsubscribe: (() => void) | null = null

  async init(store: GameStore, onAction: (action: UiAction) => void): Promise<void> {
    const assets = await UiAssets.load()
    const topBar = new TopBar(assets, onAction)
    // The Flash GUI sits one pixel above the stage's top edge.
    topBar.y = -1
    this.addChild(topBar)

    const refresh = () => {
      const resources = store.getSnapshot()
      if (resources) topBar.update(resources)
    }
    refresh()
    this.unsubscribe = store.subscribe(refresh)
  }

  resize(screenWidth: number): void {
    this.x = Math.trunc(screenWidth / 2 - GUI_WIDTH / 2)
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    super.destroy(options)
  }
}
