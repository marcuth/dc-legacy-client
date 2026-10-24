import type { CCBKeyframe, CCBKeyframeValue } from "./types"

/** CocosBuilder easing ids: 0 instant, 1 linear, 2-4 cubic, 5-7 elastic, 8-10 bounce, 11-13 back. */
export const ease = (type: number, t: number, opt: number): number => {
    const inOut = (fn: (x: number) => number) => (t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2)
    const bounceOut = (x: number) => {
        if (x < 1 / 2.75) return 7.5625 * x * x
        if (x < 2 / 2.75) return 7.5625 * (x -= 1.5 / 2.75) * x + 0.75
        if (x < 2.5 / 2.75) return 7.5625 * (x -= 2.25 / 2.75) * x + 0.9375
        return 7.5625 * (x -= 2.625 / 2.75) * x + 0.984375
    }
    const elasticIn = (x: number) => {
        if (x === 0 || x === 1) return x
        const period = opt || 0.3
        x -= 1
        return -(2 ** (10 * x)) * Math.sin(((x - period / 4) * Math.PI * 2) / period)
    }
    const elasticOut = (x: number) => {
        if (x === 0 || x === 1) return x
        const period = opt || 0.3
        return 2 ** (-10 * x) * Math.sin(((x - period / 4) * Math.PI * 2) / period) + 1
    }
    const backIn = (x: number) => x * x * (2.70158 * x - 1.70158)
    const backOut = (x: number) => (x -= 1) * x * (2.70158 * x + 1.70158) + 1
    switch (type) {
        case 0:
            return t >= 1 ? 1 : 0
        case 2:
            return t ** (opt || 1)
        case 3:
            return 1 - (1 - t) ** (opt || 1)
        case 4:
            return inOut((x) => x ** (opt || 1))
        case 5:
            return elasticIn(t)
        case 6:
            return elasticOut(t)
        case 7:
            return inOut(elasticIn)
        case 8:
            return 1 - bounceOut(1 - t)
        case 9:
            return bounceOut(t)
        case 10:
            return inOut((x) => 1 - bounceOut(1 - x))
        case 11:
            return backIn(t)
        case 12:
            return backOut(t)
        case 13:
            return inOut(backIn)
        default:
            return t
    }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Value of an animated property at `time`, or undefined when it has no keyframes. */
export const sampleKeyframes = (keyframes: CCBKeyframe[], time: number): CCBKeyframeValue | undefined => {
    if (keyframes.length === 0) return undefined
    if (time <= keyframes[0].time) return keyframes[0].value
    const last = keyframes[keyframes.length - 1]
    if (time >= last.time) return last.value

    let index = 0
    while (keyframes[index + 1].time <= time) index++
    const from = keyframes[index]
    const to = keyframes[index + 1]
    const span = to.time - from.time
    const t = span > 0 ? ease(from.easing, (time - from.time) / span, from.easingOpt) : 1
    const a = from.value
    const b = to.value

    if (a.kind === "float" && b.kind === "float") return { kind: "float", value: lerp(a.value, b.value, t) }
    if (a.kind === "xy" && b.kind === "xy") return { kind: "xy", x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
    if (a.kind === "byte" && b.kind === "byte") return { kind: "byte", value: lerp(a.value, b.value, t) }
    if (a.kind === "color3" && b.kind === "color3") {
        return { kind: "color3", value: { r: lerp(a.value.r, b.value.r, t), g: lerp(a.value.g, b.value.g, t), b: lerp(a.value.b, b.value.b, t) } }
    }
    // Discrete values (bool, sprite frame) switch at the next keyframe.
    return t >= 1 ? b : a
}
