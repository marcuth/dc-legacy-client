import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type FederatedPointerEvent,
  type Ticker,
} from "pixi.js"
import { Viewport } from "pixi-viewport"
import { habitatPendingGold } from "../core/economy"
import type { GameStore } from "../core/gameStore"
import { getDepth, gridToScreen, screenToGrid, TILE_HEIGHT, TILE_WIDTH } from "../core/isometric"
import type { GameConfig, PlacedDragon, PlayerSaveData, RawMapItem } from "../core/types"
import { AssetManager } from "./AssetManager"
import { GameUi } from "./ui/GameUi"

export interface WorldOptions {
  container: HTMLElement
  saveData: PlayerSaveData
  config?: GameConfig
  onSelectItem?: (isoId: string, item: RawMapItem) => void
  /** Resources shown by the Flash-style HUD; without it the HUD is not drawn. */
  store?: GameStore
  onUiAction?: (action: string) => void
  /** Sends the collect command; rejecting makes the world roll the habitat back. */
  onCollectGold?: (isoId: string, gold: number) => Promise<void>
}

interface HabitatEntry {
  coin: Container
  amountText: Text
}

interface Particle {
  container: Container
  vx: number
  vy: number
  age: number
  life: number
}

const COIN_REFRESH_SECONDS = 1
const TAP_TOLERANCE_PX = 6

interface AnimatedDragonEntry {
  container: Container
  baseY: number
  phase: number
  speed: number
}

export class PixiWorld {
  private app: Application | null = null
  private viewport: Viewport | null = null
  private assetManager: AssetManager | null = null
  private groundLayer = new Container()
  private objectsLayer = new Container()
  private dragonsLayer = new Container()
  private effectsLayer = new Container()
  private hoverGraphics = new Graphics()
  private saveData: PlayerSaveData | null = null
  private config: GameConfig | undefined
  private onCollectGold: WorldOptions["onCollectGold"]
  private habitats = new Map<string, HabitatEntry>()
  private collecting = new Set<string>()
  private particles: Particle[] = []
  private animatedDragons: AnimatedDragonEntry[] = []
  private tickerCallback: ((ticker: Ticker) => void) | null = null
  private isDestroyed = false

  async init(options: WorldOptions): Promise<void> {
    const { container, saveData, config } = options
    this.assetManager = new AssetManager(config)
    this.saveData = saveData
    this.config = config
    this.onCollectGold = options.onCollectGold

    const app = new Application()
    await app.init({
      resizeTo: container,
      backgroundColor: 0x090d16, // Rich dark fantasy void/sky
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    if (this.isDestroyed) {
      app.destroy(true, { children: true })
      return
    }

    this.app = app
    container.appendChild(app.canvas)

    // Viewport setup for drag, zoom, and limits
    const viewport = new Viewport({
      screenWidth: container.clientWidth || 800,
      screenHeight: container.clientHeight || 600,
      worldWidth: 4000,
      worldHeight: 4000,
      events: app.renderer.events,
    })

    viewport.drag().pinch().wheel({ percent: 0.1 }).decelerate()
    viewport.clampZoom({ minScale: 0.35, maxScale: 2.5 })
    viewport.moveCenter(0, 0)
    viewport.setZoom(0.85)

    app.stage.addChild(viewport)
    this.viewport = viewport

    // Layer ordering and sorting
    this.objectsLayer.sortableChildren = true
    this.dragonsLayer.sortableChildren = true

    viewport.addChild(this.groundLayer)
    viewport.addChild(this.objectsLayer)
    viewport.addChild(this.dragonsLayer)
    viewport.addChild(this.hoverGraphics)
    viewport.addChild(this.effectsLayer)

    // Render layers
    this.renderIslandTerrain()
    await this.renderPlacedBuildings(saveData)
    await this.renderDragons(saveData)
    this.updateCoins()
    await this.initUi(app, options)
    this.startAnimationLoop()
    this.setupInteractions(options.onSelectItem)
  }

  private async initUi(app: Application, options: WorldOptions): Promise<void> {
    if (!options.store) return
    const ui = new GameUi()
    try {
      await ui.init(options.store, (action) => options.onUiAction?.(action))
    } catch (error) {
      // The world stays playable without the HUD art (it comes from tools/extract_ui.py).
      console.warn("Could not load the game interface", error)
      ui.destroy({ children: true })
      return
    }
    if (this.isDestroyed) return
    ui.resize(app.screen.width)
    app.renderer.on("resize", (width) => ui.resize(width))
    app.stage.addChild(ui)
  }

  private renderIslandTerrain(): void {
    const islandSize = 34
    const offset = Math.floor(islandSize / 2)
    const gridGraphics = new Graphics()

    for (let tx = 0; tx < islandSize; tx++) {
      for (let ty = 0; ty < islandSize; ty++) {
        const gridX = tx - offset
        const gridY = ty - offset
        const screen = gridToScreen(gridX, gridY)

        const isAlternate = (tx + ty) % 2 === 0
        const fillColor = isAlternate ? 0x2e7d32 : 0x388e3c
        const strokeColor = 0x1b5e20

        const halfW = TILE_WIDTH / 2
        const halfH = TILE_HEIGHT / 2

        const points = [
          screen.x,
          screen.y - halfH,
          screen.x + halfW,
          screen.y,
          screen.x,
          screen.y + halfH,
          screen.x - halfW,
          screen.y,
        ]

        gridGraphics
          .poly(points)
          .fill({ color: fillColor, alpha: 0.95 })
          .stroke({ color: strokeColor, width: 1, alpha: 0.35 })
      }
    }

    this.groundLayer.addChild(gridGraphics)
  }

  private async renderPlacedBuildings(saveData: PlayerSaveData): Promise<void> {
    const items = saveData.map?.items ?? {}

    for (const [isoId, rawItem] of Object.entries(items)) {
      const [itemId, tx, ty, , , , attributes] = rawItem
      const itemConfig = this.assetManager?.getItem(itemId)
      const buildingName = itemConfig?.name ?? `Item #${itemId}`
      const size = Number(itemConfig?.size || itemConfig?.width || 3)

      const screen = gridToScreen(tx, ty)
      const buildingContainer = new Container()
      buildingContainer.label = isoId
      buildingContainer.x = screen.x
      buildingContainer.y = screen.y
      buildingContainer.zIndex = getDepth(tx, ty)

      // Isometric tile base diamond
      const halfW = (TILE_WIDTH * size) / 2
      const halfH = (TILE_HEIGHT * size) / 2
      const height3D = 24

      const baseGfx = new Graphics()
      const baseColor = this.getBuildingColor(buildingName)

      // Isometric footprint shadow & border
      baseGfx
        .poly([0, -halfH, halfW, 0, 0, halfH, -halfW, 0])
        .fill({ color: baseColor, alpha: 0.55 })
        .stroke({ color: 0x000000, width: 2, alpha: 0.6 })

      // Extruded front rim
      baseGfx
        .poly([-halfW, 0, 0, halfH, 0, halfH + height3D, -halfW, height3D])
        .fill({ color: this.darkenColor(baseColor, 30), alpha: 0.6 })
      baseGfx
        .poly([0, halfH, halfW, 0, halfW, height3D, 0, halfH + height3D])
        .fill({ color: this.darkenColor(baseColor, 45), alpha: 0.6 })

      buildingContainer.addChild(baseGfx)

      // Attempt to load and render the real texture from /assets/thumbs/
      const imgUrl = this.assetManager?.getBuildingImageUrl(itemId)
      const texture = await this.assetManager?.loadTexture(imgUrl ?? null)

      if (texture) {
        const sprite = new Sprite(texture)
        sprite.anchor.set(0.5, 0.85)

        // Scale proportionally to fit building footprint
        const maxDimension = Math.max(texture.width, texture.height)
        const targetSize = halfW * 2.2
        const scale = Math.min(1.4, targetSize / maxDimension)
        sprite.scale.set(scale)
        sprite.y = 4

        buildingContainer.addChild(sprite)
      } else {
        // Fallback 3D geometric representation
        const fallback3D = new Graphics()
        fallback3D
          .poly([0, -halfH - height3D, halfW, -height3D, 0, halfH - height3D, -halfW, -height3D])
          .fill({ color: this.lightenColor(baseColor, 25) })
          .stroke({ color: 0x000000, width: 2, alpha: 0.3 })

        buildingContainer.addChild(fallback3D)
      }

      // Building Name and Status Badge
      const style = new TextStyle({
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
        align: "center",
      })

      const text = new Text({ text: buildingName, style })
      text.anchor.set(0.5, 1)
      text.y = -halfH - height3D - 8
      buildingContainer.addChild(text)

      // Under-construction indicator if 'tb' is in the future
      if (attributes && typeof attributes.tb === "number" && attributes.tb > Date.now() / 1000) {
        const buildBadge = new Text({
          text: "🔨 Building...",
          style: new TextStyle({ fontFamily: "Inter, sans-serif", fontSize: 9, fill: 0xf59e0b }),
        })
        buildBadge.anchor.set(0.5, 0)
        buildBadge.y = 2
        buildingContainer.addChild(buildBadge)
      }

      if (itemConfig?.group_type === "HABITAT") {
        this.attachHabitatInteraction(isoId, buildingContainer, -halfH - height3D - 34)
      }

      this.objectsLayer.addChild(buildingContainer)
    }
  }

  private attachHabitatInteraction(isoId: string, buildingContainer: Container, coinY: number): void {
    const coin = new Container()
    coin.y = coinY
    coin.visible = false
    coin.cursor = "pointer"
    coin.addChild(new Graphics().circle(0, 0, 13).fill({ color: 0xfacc15 }).stroke({ color: 0xa16207, width: 3 }))
    coin.addChild(new Graphics().circle(0, 0, 8).stroke({ color: 0xca8a04, width: 2 }))

    const amountText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Inter, sans-serif",
        fontSize: 10,
        fontWeight: "700",
        fill: 0xfef08a,
        stroke: { color: 0x000000, width: 3 },
      }),
    })
    amountText.anchor.set(0.5, 0)
    amountText.y = 16
    coin.addChild(amountText)
    buildingContainer.addChild(coin)

    this.habitats.set(isoId, { coin, amountText })

    // A drag pans the camera, so only a press that barely moved counts as a click.
    let pressX = 0
    let pressY = 0
    const onDown = (event: FederatedPointerEvent) => {
      pressX = event.global.x
      pressY = event.global.y
    }
    const onTap = (event: FederatedPointerEvent) => {
      if (Math.hypot(event.global.x - pressX, event.global.y - pressY) > TAP_TOLERANCE_PX) return
      event.stopPropagation()
      void this.collectFromHabitat(isoId)
    }

    for (const target of [buildingContainer, coin]) {
      target.eventMode = "static"
      target.on("pointerdown", onDown)
      target.on("pointertap", onTap)
    }
    buildingContainer.cursor = "pointer"
  }

  private async collectFromHabitat(isoId: string): Promise<void> {
    const entry = this.habitats.get(isoId)
    const save = this.saveData
    const item = save?.map.items[isoId]
    if (!entry || !save || !item || this.collecting.has(isoId)) return

    const now = Math.floor(Date.now() / 1000)
    const gold = habitatPendingGold(isoId, save, this.config, now)
    if (gold < 1) return

    // Optimistic: restart the habitat's timer now, put it back if the server call fails.
    const previousTimestamp = item[3]
    const previousAttributes = item[6]
    item[3] = now
    item[6] = { ...(previousAttributes ?? {}), lat: now }
    this.collecting.add(isoId)
    entry.coin.visible = false
    this.spawnGoldEffect(entry.coin, gold)

    try {
      await this.onCollectGold?.(isoId, gold)
    } catch {
      item[3] = previousTimestamp
      item[6] = previousAttributes
    } finally {
      this.collecting.delete(isoId)
      this.updateCoins()
    }
  }

  /** Shows or hides each habitat's coin according to the gold its dragons have produced. */
  private updateCoins(): void {
    const save = this.saveData
    if (!save) return
    const now = Math.floor(Date.now() / 1000)
    for (const [isoId, entry] of this.habitats) {
      if (this.collecting.has(isoId)) continue
      const gold = habitatPendingGold(isoId, save, this.config, now)
      entry.coin.visible = gold >= 1
      entry.amountText.text = String(gold)
    }
  }

  private spawnGoldEffect(origin: Container, gold: number): void {
    const start = this.effectsLayer.toLocal(origin.getGlobalPosition())

    const label = new Container()
    label.position.copyFrom(start)
    const labelText = new Text({
      text: `+${gold} Gold`,
      style: new TextStyle({
        fontFamily: "Inter, sans-serif",
        fontSize: 16,
        fontWeight: "800",
        fill: 0xfacc15,
        stroke: { color: 0x000000, width: 4 },
      }),
    })
    labelText.anchor.set(0.5)
    label.addChild(labelText)
    this.addParticle(label, 0, -38, 1.3)

    for (let index = 0; index < 7; index++) {
      const piece = new Container()
      piece.position.copyFrom(start)
      piece.addChild(new Graphics().circle(0, 0, 6).fill({ color: 0xfacc15 }).stroke({ color: 0xa16207, width: 2 }))
      this.addParticle(piece, (Math.random() - 0.5) * 70, -55 - Math.random() * 45, 0.9 + Math.random() * 0.3)
    }
  }

  private addParticle(container: Container, vx: number, vy: number, life: number): void {
    this.effectsLayer.addChild(container)
    this.particles.push({ container, vx, vy, age: 0, life })
  }

  private updateParticles(dt: number): void {
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]
      particle.age += dt
      if (particle.age >= particle.life) {
        particle.container.destroy({ children: true })
        this.particles.splice(index, 1)
        continue
      }
      particle.container.x += particle.vx * dt
      particle.container.y += particle.vy * dt
      particle.container.alpha = Math.min(1, (particle.life - particle.age) / (particle.life * 0.4))
    }
  }

  /** Adopts a freshly fetched save (after the server announced a saved packet). */
  syncSave(save: PlayerSaveData): void {
    this.saveData = save
    this.updateCoins()
  }

  private async renderDragons(saveData: PlayerSaveData): Promise<void> {
    const dragons = saveData.map?.dragons ?? []
    const items = saveData.map?.items ?? {}

    for (let index = 0; index < dragons.length; index++) {
      const dragon: PlacedDragon = dragons[index]
      const habitatIso = String(dragon.habitatId)
      const habitat = items[habitatIso]
      if (!habitat) continue

      const [, tx, ty] = habitat
      const basePos = gridToScreen(tx, ty)

      // Distribute dragons inside the habitat footprint
      const angle = (index * 2.1) % (Math.PI * 2)
      const radius = 28
      const offsetX = Math.cos(angle) * radius
      const offsetY = Math.sin(angle) * (radius * 0.5)

      const dragonContainer = new Container()
      dragonContainer.x = basePos.x + offsetX
      dragonContainer.y = basePos.y + offsetY
      dragonContainer.zIndex = getDepth(tx, ty, 50 + index)

      // Dragon ground shadow
      const shadowGfx = new Graphics()
      shadowGfx.ellipse(0, 0, 16, 8).fill({ color: 0x000000, alpha: 0.4 })
      dragonContainer.addChild(shadowGfx)

      // Load dragon sprite texture for their current stage
      const dragonImgUrl = this.assetManager?.getDragonImageUrl(dragon)
      const texture = await this.assetManager?.loadTexture(dragonImgUrl ?? null)

      if (texture) {
        const sprite = new Sprite(texture)
        sprite.anchor.set(0.5, 0.9)
        const scale = 0.55
        sprite.scale.set(scale)
        dragonContainer.addChild(sprite)
      } else {
        // Fallback dragon indicator dot
        const dot = new Graphics()
        dot.circle(0, -12, 10).fill({ color: 0xf43f5e }).stroke({ color: 0xffffff, width: 2 })
        dragonContainer.addChild(dot)
      }

      // Name label
      const nameStyle = new TextStyle({
        fontFamily: "Inter, sans-serif",
        fontSize: 10,
        fill: 0xfef08a,
        stroke: { color: 0x000000, width: 2 },
        align: "center",
      })
      const nameText = new Text({ text: dragon.name || "Dragon", style: nameStyle })
      nameText.anchor.set(0.5, 1)
      nameText.y = -36
      dragonContainer.addChild(nameText)

      this.dragonsLayer.addChild(dragonContainer)

      // Register dragon for idle floating / breathing animation
      this.animatedDragons.push({
        container: dragonContainer,
        baseY: dragonContainer.y,
        phase: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 0.8,
      })
    }
  }

  private startAnimationLoop(): void {
    if (!this.app) return

    let time = 0
    let sinceCoinRefresh = 0
    this.tickerCallback = (ticker) => {
      const dt = ticker.deltaTime / 60
      time += dt

      sinceCoinRefresh += dt
      if (sinceCoinRefresh >= COIN_REFRESH_SECONDS) {
        sinceCoinRefresh = 0
        this.updateCoins()
      }
      for (const entry of this.habitats.values()) {
        if (entry.coin.visible) entry.coin.scale.set(1 + Math.sin(time * 4) * 0.06)
      }
      this.updateParticles(dt)

      for (const entry of this.animatedDragons) {
        entry.container.y = entry.baseY + Math.sin(time * entry.speed + entry.phase) * 3.5
      }
    }

    this.app.ticker.add(this.tickerCallback)
  }

  private setupInteractions(onSelectItem?: (isoId: string, item: RawMapItem) => void): void {
    if (!this.viewport) return

    this.viewport.on("pointermove", (e) => {
      if (!this.viewport) return
      const worldPos = this.viewport.toWorld(e.global)
      const grid = screenToGrid(worldPos.x, worldPos.y)
      const screen = gridToScreen(grid.tx, grid.ty)

      this.hoverGraphics.clear()
      const halfW = TILE_WIDTH / 2
      const halfH = TILE_HEIGHT / 2

      this.hoverGraphics
        .poly([screen.x, screen.y - halfH, screen.x + halfW, screen.y, screen.x, screen.y + halfH, screen.x - halfW, screen.y])
        .fill({ color: 0xffffff, alpha: 0.25 })
        .stroke({ color: 0xfacc15, width: 2, alpha: 0.8 })
    })

    if (onSelectItem) {
      // Future item picking support
    }
  }

  private getBuildingColor(name: string): number {
    const lower = name.toLowerCase()
    if (lower.includes("flame") || lower.includes("fire")) return 0xd97706
    if (lower.includes("nature") || lower.includes("plant")) return 0x16a34a
    if (lower.includes("sea") || lower.includes("water")) return 0x0284c7
    if (lower.includes("terra") || lower.includes("earth")) return 0x854d0e
    if (lower.includes("electric")) return 0xeab308
    if (lower.includes("ice")) return 0x38bdf8
    if (lower.includes("metal")) return 0x94a3b8
    if (lower.includes("dark")) return 0x475569
    if (lower.includes("farm")) return 0xc2410c
    if (lower.includes("hatchery")) return 0x9333ea
    return 0x3b82f6
  }

  private lightenColor(color: number, percent: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + percent * 2)
    const g = Math.min(255, ((color >> 8) & 0xff) + percent * 2)
    const b = Math.min(255, (color & 0xff) + percent * 2)
    return (r << 16) | (g << 8) | b
  }

  private darkenColor(color: number, percent: number): number {
    const r = Math.max(0, ((color >> 16) & 0xff) - percent * 2)
    const g = Math.max(0, ((color >> 8) & 0xff) - percent * 2)
    const b = Math.max(0, (color & 0xff) - percent * 2)
    return (r << 16) | (g << 8) | b
  }

  destroy(): void {
    this.isDestroyed = true
    if (this.app) {
      if (this.tickerCallback) {
        this.app.ticker.remove(this.tickerCallback)
        this.tickerCallback = null
      }
      this.app.destroy(true, { children: true })
      this.app = null
      this.viewport = null
      this.animatedDragons = []
      this.habitats.clear()
      this.particles = []
    }
  }
}
