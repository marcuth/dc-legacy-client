import { Container, Matrix, Sprite, type Texture } from "pixi.js"

import { frameAt, type SkeletonAnimation, type SkeletonFrame } from "./anim"

/**
 * Frames per second. `CCBaseSkeleton::update` advances one frame per call and the frame delay stays 0, so this is the
 * game's update rate; 30 is an assumption [?] (the animation interval is set from Java).
 */
export const SKELETON_FPS = 30
/** The HD atlases store two pixels per point. */
const PIXELS_PER_POINT = 2

type Part = { name: string; layer: number; sprite: Sprite; part: SkeletonAnimation["parts"][number] }

const radians = (degrees: number) => (degrees * Math.PI) / 180

/**
 * The transform of one part frame (`CCNode::nodeToParentTransform`, cocos2d-x 2.2 style: separate x and y rotations),
 * converted from y-up to Pixi's y-down.
 */
export const partMatrix = (frame: SkeletonFrame, texturePointScale: number): Matrix => {
    const rx = -radians(frame.rotationX)
    const ry = -radians(frame.rotationY)
    const cx = Math.cos(rx)
    const sx = Math.sin(rx)
    const cy = Math.cos(ry)
    const sy = Math.sin(ry)
    const k = texturePointScale
    return new Matrix(cy * frame.scaleX * k, -sy * frame.scaleX * k, sx * frame.scaleY * k, cx * frame.scaleY * k, frame.x, -frame.y)
}

/** A character made of image parts that move along recorded frames (`CCBatchSkeleton`). */
export class Skeleton extends Container {
    private sets = new Map<string, Part[]>()
    private animations = new Map<string, SkeletonAnimation>()
    private current: SkeletonAnimation | null = null
    private active: Part[] = []
    private time = 0
    private looping = true
    private finished = false

    constructor(
        private readonly textures: { has(name: string): boolean; get(name: string): Texture },
        animations: Iterable<SkeletonAnimation>,
    ) {
        super({ label: "Skeleton", sortableChildren: true })
        for (const animation of animations) {
            this.animations.set(animation.name, animation)
            this.sets.set(animation.name, this.buildParts(animation))
        }
    }

    get animation(): string | undefined {
        return this.current?.name
    }

    get isFinished() {
        return this.finished
    }

    has(name: string) {
        return this.animations.has(name)
    }

    private buildParts(animation: SkeletonAnimation): Part[] {
        const parts: Part[] = []
        for (const part of animation.parts) {
            // Parts that never show have no image in the atlas.
            if (!this.textures.has(part.name)) continue
            const sprite = new Sprite(this.textures.get(part.name))
            sprite.visible = false
            sprite.zIndex = part.layer
            this.addChild(sprite)
            parts.push({ name: part.name, layer: part.layer, sprite, part })
        }
        return parts
    }

    play(name: string, options: { loop?: boolean; frame?: number } = {}): void {
        const animation = this.animations.get(name)
        if (!animation) throw new Error(`Unknown animation ${name}`)
        for (const part of this.active) part.sprite.visible = false
        this.active = this.sets.get(name)!
        this.current = animation
        this.looping = options.loop ?? true
        this.finished = false
        this.time = (options.frame ?? 0) / SKELETON_FPS
        this.apply()
    }

    update(deltaSeconds: number): void {
        if (!this.current || this.finished) return
        this.time += deltaSeconds
        const length = this.current.length
        if (this.time * SKELETON_FPS >= length) {
            if (this.looping) this.time %= length / SKELETON_FPS
            else {
                this.time = (length - 1) / SKELETON_FPS
                this.finished = true
            }
        }
        this.apply()
    }

    get frame(): number {
        return Math.floor(this.time * SKELETON_FPS)
    }

    private apply() {
        const frameNumber = this.frame
        for (const { sprite, part } of this.active) {
            const frame = frameAt(part, frameNumber)
            if (!frame || frame.alpha <= 0) {
                sprite.visible = false
                continue
            }
            sprite.visible = true
            sprite.alpha = Math.min(1, frame.alpha)
            sprite.anchor.set(frame.anchorX, 1 - frame.anchorY)
            sprite.setFromMatrix(partMatrix(frame, 1 / PIXELS_PER_POINT))
        }
    }
}
