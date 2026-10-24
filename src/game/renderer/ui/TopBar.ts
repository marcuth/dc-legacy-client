import { Container, Sprite, Text, TextStyle } from "pixi.js"
import type { PlayerResources } from "../../core/economy"
import { formatAmount } from "../../core/format"
import type { UiPlacement, UiTextChar } from "../../core/uiLayout"
import { UI_FONT, type UiAssets } from "./UiAssets"

/** `parteArribaGui` in the Flash client: gold / food / gems, level + XP meter and the dragon book. */
const TOP_BAR_ID = 767
const EXPERIENCE_METER_ID = 734
/** Hidden by the client until a limited offer is running. */
const OFFER_COUNTDOWN = "offerCountdown"
/** Flash text fields keep a 2px gutter inside their box. */
const TEXT_GUTTER = 2

export type TopBarAction = "buyGold" | "buyFood" | "buyGems" | "dragonBook"

const BUTTON_ACTIONS: Record<string, TopBarAction> = {
  btnGold_: "buyGold",
  btnFood_: "buyFood",
  btnCash_: "buyGems",
  iconBook: "dragonBook",
}

export class TopBar extends Container {
  private texts = new Map<string, Text>()
  private xpMask: Sprite | null = null

  private assets: UiAssets

  constructor(assets: UiAssets, onAction: (action: TopBarAction) => void) {
    super()
    this.assets = assets
    this.build(TOP_BAR_ID, this, onAction)
  }

  private build(containerId: number, parent: Container, onAction?: (action: TopBarAction) => void): void {
    const placements = this.assets.layout.containers[String(containerId)]?.children ?? []
    let revealedBar: Sprite | null = null

    for (const placement of placements) {
      if (placement.name === OFFER_COUNTDOWN) continue

      if (placement.id === EXPERIENCE_METER_ID) {
        const meter = new Container()
        meter.position.set(placement.x, placement.y)
        this.build(EXPERIENCE_METER_ID, meter)
        parent.addChild(meter)
        continue
      }

      const char = this.assets.char(placement.id)
      if (!char) continue

      if (char.kind === "text") {
        const text = this.createText(placement, char)
        parent.addChild(text)
        if (placement.name) this.texts.set(placement.name, text)
        continue
      }

      const texture = this.assets.texture(placement.id)
      if (!texture) continue
      const sprite = new Sprite(texture)
      sprite.scale.set(placement.sx, placement.sy)
      sprite.position.set(placement.x + placement.sx * char.x, placement.y + placement.sy * char.y)

      if (placement.name === "expMask") {
        // The client reveals the bar by scaling this mask horizontally from its left edge.
        this.xpMask = sprite
        sprite.scale.x = 0
        parent.addChild(sprite)
        continue
      }

      // The first picture after the mask is the bar it uncovers.
      if (this.xpMask && containerId === EXPERIENCE_METER_ID && !revealedBar) {
        revealedBar = sprite
        sprite.mask = this.xpMask
      }

      const action = placement.name ? BUTTON_ACTIONS[placement.name] : undefined
      if (action && onAction) {
        sprite.eventMode = "static"
        sprite.cursor = "pointer"
        sprite.on("pointertap", () => onAction(action))
      }
      parent.addChild(sprite)
    }
  }

  private createText(placement: UiPlacement, char: UiTextChar): Text {
    const text = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: UI_FONT,
        fontSize: char.size,
        fill: char.color,
        // The Flash fields carry a hard white glow.
        stroke: { color: 0xffffff, width: 3, join: "round" },
      }),
    })
    const anchorX = char.align === "right" ? 1 : char.align === "center" ? 0.5 : 0
    text.anchor.set(anchorX, 0)
    const left = placement.x + char.x + TEXT_GUTTER
    const width = char.w - TEXT_GUTTER * 2
    text.position.set(left + width * anchorX, placement.y + char.y + TEXT_GUTTER)
    return text
  }

  update(resources: PlayerResources): void {
    this.setText("goldText", formatAmount(resources.gold))
    this.setText("foodText", formatAmount(resources.food))
    this.setText("cashText", formatAmount(resources.cash))
    this.setText("armyText", String(resources.dragons))
    this.setText("levelText", String(resources.level))

    // Same rule as the client: progress inside the current level, "MAX LEVEL!" past the last one.
    if (resources.levelCeilXp === null) {
      if (this.xpMask) this.xpMask.scale.x = 1
      this.setText("exp", "MAX LEVEL!")
      return
    }
    const span = resources.levelCeilXp - resources.levelFloorXp
    const progress = span > 0 ? Math.min(1, Math.max(0, (resources.xp - resources.levelFloorXp) / span)) : 0
    if (this.xpMask) this.xpMask.scale.x = progress
    this.setText("exp", `${Math.trunc(progress * 100)}%`)
  }

  private setText(name: string, value: string): void {
    const text = this.texts.get(name)
    if (text) text.text = value
  }
}
