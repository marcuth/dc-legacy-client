import {
    CCBPropType,
    type CCBColor3,
    type CCBDocument,
    type CCBKeyframe,
    type CCBKeyframeValue,
    type CCBNode,
    type CCBPlatform,
    type CCBProperty,
    type CCBSequence,
    type CCBSequenceProperty,
    type CCBTargetType,
    type CCBValue,
} from "./types"

const SUPPORTED_VERSION = 3
const MAGIC = "ibcc"

/** Easings 2..7 (cubic and elastic) carry an extra float option. */
const easingHasOption = (easing: number) => easing >= 2 && easing <= 7

class CCBReader {
    private pos = 0
    private bit = 0
    private strings: string[] = []
    private view: DataView

    constructor(private bytes: Uint8Array) {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    }

    get position() {
        return this.pos
    }

    get length() {
        return this.bytes.length
    }

    readDocument(): CCBDocument {
        const magic = String.fromCharCode(...this.bytes.subarray(0, 4))
        if (magic !== MAGIC) throw new Error(`Not a ccbi file (magic "${magic}")`)
        this.pos = 4

        const version = this.readInt(false)
        if (version !== SUPPORTED_VERSION) throw new Error(`Unsupported ccbi version ${version}`)

        const stringCount = this.readInt(false)
        for (let i = 0; i < stringCount; i++) this.strings.push(this.readUtf8())

        const sequences = this.readSequences()
        const autoPlaySequenceId = this.readInt(true)
        const root = this.readNode()
        return { version, sequences, autoPlaySequenceId, root }
    }

    private readSequences(): CCBSequence[] {
        const count = this.readInt(false)
        const sequences: CCBSequence[] = []
        for (let i = 0; i < count; i++) {
            const duration = this.readFloat()
            const name = this.readCachedString()
            const id = this.readInt(false)
            const chainedSequenceId = this.readInt(true)
            sequences.push({ id, name, duration, chainedSequenceId })
        }
        return sequences
    }

    private readNode(): CCBNode {
        const className = this.readCachedString()
        const target = this.readInt(false) as CCBTargetType
        const node: CCBNode = { className, properties: [], animations: new Map(), children: [] }
        if (target !== 0) node.memberVar = { target, name: this.readCachedString() }

        const sequenceCount = this.readInt(false)
        for (let i = 0; i < sequenceCount; i++) {
            const sequenceId = this.readInt(false)
            const propCount = this.readInt(false)
            const props: CCBSequenceProperty[] = []
            for (let j = 0; j < propCount; j++) {
                const name = this.readCachedString()
                const type = this.readInt(false) as CCBPropType
                const keyframeCount = this.readInt(false)
                const keyframes: CCBKeyframe[] = []
                for (let k = 0; k < keyframeCount; k++) keyframes.push(this.readKeyframe(type))
                props.push({ name, type, keyframes })
            }
            node.animations.set(sequenceId, props)
        }

        const regularCount = this.readInt(false)
        const extraCount = this.readInt(false)
        for (let i = 0; i < regularCount + extraCount; i++) {
            node.properties.push(this.readProperty(i >= regularCount))
        }

        const childCount = this.readInt(false)
        for (let i = 0; i < childCount; i++) node.children.push(this.readNode())
        return node
    }

    private readProperty(extra: boolean): CCBProperty {
        const type = this.readInt(false) as CCBPropType
        const name = this.readCachedString()
        const platform = this.readByte() as CCBPlatform
        return { name, platform, extra, value: this.readValue(type) }
    }

    private readValue(type: CCBPropType): CCBValue {
        switch (type) {
            case CCBPropType.Position:
            case CCBPropType.Size:
                return { type, x: this.readFloat(), y: this.readFloat(), unit: this.readInt(false) }
            case CCBPropType.Point:
            case CCBPropType.PointLock:
                return { type, x: this.readFloat(), y: this.readFloat() }
            case CCBPropType.ScaleLock:
                return { type, x: this.readFloat(), y: this.readFloat(), lock: this.readInt(false) }
            case CCBPropType.Degrees:
            case CCBPropType.Float:
                return { type, value: this.readFloat() }
            case CCBPropType.Integer:
            case CCBPropType.IntegerLabeled:
                return { type, value: this.readInt(true) }
            case CCBPropType.FloatVar:
                return { type, value: this.readFloat(), variance: this.readFloat() }
            case CCBPropType.Check:
                return { type, value: this.readByte() !== 0 }
            case CCBPropType.SpriteFrame:
                return { type, sheet: this.readCachedString(), file: this.readCachedString() }
            case CCBPropType.Byte:
                return { type, value: this.readByte() }
            case CCBPropType.Color3:
                return { type, value: this.readColor3() }
            case CCBPropType.Color4Var:
                return { type, value: { ...this.readColor3(), a: this.readByte() }, variance: { ...this.readColor3(), a: this.readByte() } }
            case CCBPropType.Flip:
                return { type, x: this.readByte() !== 0, y: this.readByte() !== 0 }
            case CCBPropType.Blendmode:
                return { type, src: this.readInt(false), dst: this.readInt(false) }
            case CCBPropType.Texture:
            case CCBPropType.FntFile:
            case CCBPropType.Text:
            case CCBPropType.FontTTF:
            case CCBPropType.CCBFile:
            case CCBPropType.String:
                return { type, value: this.readCachedString() }
            case CCBPropType.Block:
                return { type, selector: this.readCachedString(), target: this.readInt(false) }
            case CCBPropType.BlockCCControl:
                return { type, selector: this.readCachedString(), target: this.readInt(false), controlEvents: this.readInt(false) }
            case CCBPropType.Animation:
                return { type, file: this.readCachedString(), sequence: this.readCachedString() }
            case CCBPropType.FloatScale:
                return { type, value: this.readFloat(), scaleType: this.readInt(false) }
            default:
                throw new Error(`Unknown ccbi property type ${type} at byte ${this.pos}`)
        }
    }

    private readKeyframe(type: CCBPropType): CCBKeyframe {
        const time = this.readFloat()
        const easing = this.readInt(false)
        const easingOpt = easingHasOption(easing) ? this.readFloat() : 0
        return { time, easing, easingOpt, value: this.readKeyframeValue(type) }
    }

    private readKeyframeValue(type: CCBPropType): CCBKeyframeValue {
        switch (type) {
            case CCBPropType.Check:
                return { kind: "bool", value: this.readByte() !== 0 }
            case CCBPropType.Byte:
                return { kind: "byte", value: this.readByte() }
            case CCBPropType.Color3:
                return { kind: "color3", value: this.readColor3() }
            case CCBPropType.Degrees:
                return { kind: "float", value: this.readFloat() }
            case CCBPropType.ScaleLock:
            case CCBPropType.Position:
                return { kind: "xy", x: this.readFloat(), y: this.readFloat() }
            case CCBPropType.SpriteFrame:
                return { kind: "spriteFrame", sheet: this.readCachedString(), file: this.readCachedString() }
            default:
                throw new Error(`Unsupported keyframe property type ${type} at byte ${this.pos}`)
        }
    }

    private readColor3(): CCBColor3 {
        return { r: this.readByte(), g: this.readByte(), b: this.readByte() }
    }

    private readUtf8(): string {
        const length = (this.readByte() << 8) | this.readByte()
        const text = new TextDecoder().decode(this.bytes.subarray(this.pos, this.pos + length))
        this.pos += length
        return text
    }

    private readCachedString(): string {
        const index = this.readInt(false)
        const value = this.strings[index]
        if (value === undefined) throw new Error(`String index ${index} out of range at byte ${this.pos}`)
        return value
    }

    private readByte(): number {
        return this.bytes[this.pos++]
    }

    private readFloat(): number {
        const type = this.readByte()
        switch (type) {
            case 0:
                return 0
            case 1:
                return 1
            case 2:
                return -1
            case 3:
                return 0.5
            case 4:
                return this.readInt(true)
            case 5: {
                const value = this.view.getFloat32(this.pos, true)
                this.pos += 4
                return value
            }
            default:
                throw new Error(`Unknown float encoding ${type} at byte ${this.pos - 1}`)
        }
    }

    private getBit(): number {
        const value = (this.bytes[this.pos] >> this.bit) & 1
        if (++this.bit >= 8) {
            this.bit = 0
            this.pos++
        }
        return value
    }

    private alignBits() {
        if (this.bit) {
            this.bit = 0
            this.pos++
        }
    }

    /** Elias-gamma style varint, LSB-first bit stream, byte aligned afterwards. */
    private readInt(signed: boolean): number {
        let bits = 0
        while (!this.getBit()) bits++
        let current = 0
        for (let a = bits - 1; a >= 0; a--) {
            if (this.getBit()) current += 2 ** a
        }
        current += 2 ** bits
        this.alignBits()
        if (signed) return current % 2 ? Math.floor(current / 2) : -Math.floor(current / 2)
        return current - 1
    }
}

export const parseCCB = (data: ArrayBuffer | Uint8Array): CCBDocument => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const reader = new CCBReader(bytes)
    const document = reader.readDocument()
    if (reader.position !== reader.length) {
        throw new Error(`ccbi parse ended at byte ${reader.position} of ${reader.length}`)
    }
    return document
}
