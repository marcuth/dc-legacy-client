import { Assets, Texture } from "pixi.js"
import type { GameConfig, ItemConfig, PlacedDragon } from "../core/types"

export class AssetManager {
  private itemIndex = new Map<number, ItemConfig>()
  private textureCache = new Map<string, Texture | null>()

  constructor(config?: GameConfig) {
    if (config?.items) {
      if (Array.isArray(config.items)) {
        for (const item of config.items) {
          if (item?.id != null) {
            this.itemIndex.set(Number(item.id), item)
          }
        }
      } else {
        for (const [key, item] of Object.entries(config.items)) {
          const id = Number(item?.id ?? key)
          if (!isNaN(id)) {
            this.itemIndex.set(id, item)
          }
        }
      }
    }
  }

  getItem(itemId: number): ItemConfig | undefined {
    return this.itemIndex.get(itemId)
  }

  getBuildingImageUrl(itemId: number): string | null {
    const item = this.getItem(itemId)
    if (!item?.img_name) return null
    return `/assets/thumbs/${item.img_name}.jpg`
  }

  getDragonStage(xp: number, level = 1): 0 | 1 | 2 | 3 {
    // Stage 0: Egg (hatchery)
    // Stage 1: Baby (level 1-3)
    // Stage 2: Young (level 4-6)
    // Stage 3: Adult (level 7+)
    const effectiveLevel = level > 1 ? level : Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1)
    if (effectiveLevel >= 7) return 3
    if (effectiveLevel >= 4) return 2
    return 1
  }

  getDragonImageUrl(dragon: PlacedDragon): string | null {
    const item = this.getItem(dragon.type)
    if (!item?.img_name) return null
    const stage = this.getDragonStage(dragon.xp || 0)
    return `/assets/thumbs/${item.img_name}_${stage}.jpg`
  }

  getEggImageUrl(typeId: number): string | null {
    const item = this.getItem(typeId)
    if (!item?.img_name) return null
    return `/assets/thumbs/${item.img_name}_0.jpg`
  }

  async loadTexture(url: string | null): Promise<Texture | null> {
    if (!url) return null

    if (this.textureCache.has(url)) {
      return this.textureCache.get(url) ?? null
    }

    try {
      const texture = await Assets.load<Texture>({
        src: url,
        loadParser: "loadTextures",
      })
      this.textureCache.set(url, texture)
      return texture
    } catch {
      // Mark as failed in cache to avoid refetching
      this.textureCache.set(url, null)
      return null
    }
  }
}
