import { Assets, Texture } from "pixi.js"
import type { UiChar, UiLayout } from "../../core/uiLayout"

const UI_BASE = "/assets/ui"
export const UI_FONT = "Curse Casual JVE"

/** The Flash client's UI art (see tools/extract_ui.py): layout, textures and the "Curse Casual" font. */
export class UiAssets {
  readonly layout: UiLayout
  private textures: Map<number, Texture>

  private constructor(layout: UiLayout, textures: Map<number, Texture>) {
    this.layout = layout
    this.textures = textures
  }

  static async load(): Promise<UiAssets> {
    const response = await fetch(`${UI_BASE}/layout.json`, { credentials: "same-origin" })
    if (!response.ok) throw new Error(`Failed to fetch the UI layout: ${response.status}`)
    const layout = (await response.json()) as UiLayout

    const font = new FontFace(UI_FONT, `url(${UI_BASE}/CurseCasual.ttf)`)
    const fontLoaded = font.load().then((face) => document.fonts.add(face))

    const textures = new Map<number, Texture>()
    const textureLoads = Object.entries(layout.chars)
      .filter(([, char]) => char.kind === "image")
      .map(async ([id]) => {
        textures.set(Number(id), await Assets.load<Texture>({ src: `${UI_BASE}/${id}.png`, loadParser: "loadTextures" }))
      })

    await Promise.all([fontLoaded, ...textureLoads])
    return new UiAssets(layout, textures)
  }

  texture(id: number): Texture | undefined {
    return this.textures.get(id)
  }

  char(id: number): UiChar | undefined {
    return this.layout.chars[String(id)]
  }
}
