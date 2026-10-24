/** Shapes of `/assets/ui/layout.json`, produced by tools/extract_ui.py from the Flash client. */

export interface UiPlacement {
  id: number
  name: string | null
  depth: number
  x: number
  y: number
  sx: number
  sy: number
}

interface UiCharBounds {
  /** Top-left of the character's rendering in its own coordinate space (px). */
  x: number
  y: number
  w: number
  h: number
}

export interface UiImageChar extends UiCharBounds {
  kind: "image"
}

export interface UiTextChar extends UiCharBounds {
  kind: "text"
  size: number
  align: "left" | "right" | "center"
  color: string
  text: string
}

export type UiChar = UiImageChar | UiTextChar

export interface UiLayout {
  containers: Record<string, { children: UiPlacement[] }>
  chars: Record<string, UiChar>
}
