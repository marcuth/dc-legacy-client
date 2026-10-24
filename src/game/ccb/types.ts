/** Property types from the CocosBuilder ccbi format (reader version 3, as embedded in libdc.so). */
export enum CCBPropType {
    Position = 0,
    Size = 1,
    Point = 2,
    PointLock = 3,
    ScaleLock = 4,
    Degrees = 5,
    Integer = 6,
    Float = 7,
    FloatVar = 8,
    Check = 9,
    SpriteFrame = 10,
    Texture = 11,
    Byte = 12,
    Color3 = 13,
    Color4Var = 14,
    Flip = 15,
    Blendmode = 16,
    FntFile = 17,
    Text = 18,
    FontTTF = 19,
    IntegerLabeled = 20,
    Block = 21,
    Animation = 22,
    CCBFile = 23,
    String = 24,
    BlockCCControl = 25,
    FloatScale = 26,
}

export enum CCBPlatform {
    All = 0,
    IOS = 1,
    Mac = 2,
}

export enum CCBTargetType {
    None = 0,
    DocumentRoot = 1,
    Owner = 2,
}

export type CCBColor3 = { r: number; g: number; b: number }

export type CCBValue =
    | { type: CCBPropType.Position | CCBPropType.Size; x: number; y: number; unit: number }
    | { type: CCBPropType.Point | CCBPropType.PointLock; x: number; y: number }
    | { type: CCBPropType.ScaleLock; x: number; y: number; lock: number }
    | { type: CCBPropType.Degrees | CCBPropType.Float; value: number }
    | { type: CCBPropType.Integer | CCBPropType.IntegerLabeled; value: number }
    | { type: CCBPropType.FloatVar; value: number; variance: number }
    | { type: CCBPropType.Check; value: boolean }
    | { type: CCBPropType.SpriteFrame; sheet: string; file: string }
    | { type: CCBPropType.Byte; value: number }
    | { type: CCBPropType.Color3; value: CCBColor3 }
    | { type: CCBPropType.Color4Var; value: CCBColor3 & { a: number }; variance: CCBColor3 & { a: number } }
    | { type: CCBPropType.Flip; x: boolean; y: boolean }
    | { type: CCBPropType.Blendmode; src: number; dst: number }
    | { type: CCBPropType.Texture | CCBPropType.FntFile | CCBPropType.Text | CCBPropType.FontTTF | CCBPropType.CCBFile | CCBPropType.String; value: string }
    | { type: CCBPropType.Block; selector: string; target: number }
    | { type: CCBPropType.BlockCCControl; selector: string; target: number; controlEvents: number }
    | { type: CCBPropType.Animation; file: string; sequence: string }
    | { type: CCBPropType.FloatScale; value: number; scaleType: number }

export type CCBProperty = {
    name: string
    platform: CCBPlatform
    /** Extra properties override children of a nested ccb file. */
    extra: boolean
    value: CCBValue
}

export type CCBKeyframeValue =
    | { kind: "bool"; value: boolean }
    | { kind: "byte"; value: number }
    | { kind: "color3"; value: CCBColor3 }
    | { kind: "float"; value: number }
    | { kind: "xy"; x: number; y: number }
    | { kind: "spriteFrame"; sheet: string; file: string }

export type CCBKeyframe = {
    time: number
    easing: number
    easingOpt: number
    value: CCBKeyframeValue
}

export type CCBSequenceProperty = {
    name: string
    type: CCBPropType
    keyframes: CCBKeyframe[]
}

export type CCBSequence = {
    id: number
    name: string
    duration: number
    chainedSequenceId: number
}

export type CCBNode = {
    className: string
    memberVar?: { target: CCBTargetType; name: string }
    properties: CCBProperty[]
    /** sequence id -> animated properties of this node. */
    animations: Map<number, CCBSequenceProperty[]>
    children: CCBNode[]
}

export type CCBDocument = {
    version: number
    sequences: CCBSequence[]
    autoPlaySequenceId: number
    root: CCBNode
}
