import type { Point } from "./iso"
import type { HabitatPath } from "./skeleton/habitatPath"
import { SKELETON_FPS, type Skeleton } from "./skeleton/Skeleton"

/** A dragon walking round the path of its habitat while its walk animation plays. */
export class DragonActor {
    private time = 0
    private facing = 1

    /**
     * @param origin top-left corner of the building image in the building's own coordinates (y down)
     * @param phase where on the path to start, 0..1, so dragons of one habitat do not overlap
     */
    constructor(
        readonly skeleton: Skeleton,
        private readonly path: HabitatPath,
        private readonly origin: Point,
        phase = 0,
    ) {
        this.time = (phase * path.points.length) / SKELETON_FPS
        skeleton.play("walk", { loop: true, frame: Math.floor(phase * 25) })
        this.place()
    }

    update(deltaSeconds: number): void {
        this.time += deltaSeconds
        this.skeleton.update(deltaSeconds)
        this.place()
    }

    private place() {
        const { points } = this.path
        const index = Math.floor(this.time * SKELETON_FPS) % points.length
        const here = points[index]
        const ahead = points[(index + 1) % points.length]
        // Turn to the side the dragon is heading to; stand still keeps the last side.
        if (Math.abs(ahead.x - here.x) > 0.01) this.facing = ahead.x > here.x ? 1 : -1
        this.skeleton.scale.x = this.facing
        this.skeleton.position.set(this.origin.x + here.x, this.origin.y - here.y)
    }
}
