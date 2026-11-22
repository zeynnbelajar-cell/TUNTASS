/* eslint-disable */
// TUNTAS AI Truth Plate — adapted from the supplied Word Truth Heavy component

"use client"

import * as React from "react"
import { useEffect, useRef } from "react"


// ── moved controls (builder) ──
/**
 * Controls moved in the builder: into Advanced, out of it, or into groups of
 * their own. The code reads each one where it was first written, so the props
 * are put back in that shape before anything reads them.
 */
const MOVED_CONTROLS: { into: Record<string, string>; out: Record<string, string> } = {"into":{},"out":{"hover":"advanced"}}
const GROUP_FALLBACKS: Record<string, any> = {  }
function withMovedControls(props: any): any {
    const out = { ...props }
    for (const [k, g] of Object.entries(MOVED_CONTROLS.into)) out[k] = props?.[g]?.[k] ?? GROUP_FALLBACKS[g]?.[k]
    for (const [k, g] of Object.entries(MOVED_CONTROLS.out)) {
        if (out[k] !== undefined) out[g] = { ...(out[g] ?? {}), [k]: out[k] }
    }
    return out
}
// ── /moved controls ──

/**
 * CairnShade — a word laid out as flat letter plates, stacked straight down the
 * frame and seen from a steep angle. Every plate throws a soft shadow onto all
 * the plates beneath it, so the stack darkens as it descends: the top plate is
 * fully lit, the bottom one sits almost wholly in shade.
 *
 * Built after the user's "TRUTH" poster (white plates on near-black, grey-violet
 * shadows) and refined from their WordTRUTHHeavy component — every control of
 * that component is kept under its old key. Numbers measured from the poster
 * (unwarped into the plates' own plane):
 *  - Plate axes: letter width runs 27.0° below horizontal, letter height rises
 *    16.5° to the right; parallel across the whole poster (an affine view).
 *  - Letterforms: a heavy grotesque with sharp corners and a straight-legged R;
 *    the closest open face is Fira Sans Condensed Black thickened by a 6% stroke.
 *    Cap 43% of the stack height, width scale 36%.
 *  - Stacking: each plate sits 18.25% of the stack height straight below the one
 *    above it (192 px on the 1144 px poster), letters left-aligned on their ink.
 *  - Shadows: flat #5A5966 where full, edge σ ≈ 0.6% of the stack. Per level they
 *    reach 0.30 of a plate step onto the second plate and ~0.9 onto the last,
 *    the lengthening concentrated mid-stack, falling 10° right of straight down
 *    (fitted against the poster's shaded areas plate by plate).
 *  - Ground #000106, plates #FFFFFF.
 *
 * Rendering: Canvas 2D, bottom plate first so upper plates cover lower ones. Each
 * plate is crisp vector type under one affine. Its shadows are composed in the
 * plate's own flat plane at reduced resolution (they are soft anyway): pre-blurred
 * sprites of the plates above, placed by plain translation, clipped to the plate's
 * silhouette, then laid over it in one transformed draw. Blurring in the plane
 * keeps the penumbra round on the plate, as a real one is. Sprites are cached until
 * a control that shapes them changes.
 */

// ── Reference frame ─────────────────────────────────────────────────────────
const REF_W = 1200
const REF_H = 800
const REF_ASPECT = REF_W / REF_H

/** Glyphs are measured (and set) at this size; the plate affine scales them. */
const F = 200
const MAX_LETTERS = 16
/** Largest share of the frame the stack may take before it shrinks to fit. */
const FIT_H = 0.96
const FIT_W = 0.98
/**
 * Where down the stack the shadows lengthen. The poster's per-level reach is
 * 0.30, 0.36, 0.92, 0.91 of a step for its 2nd–5th plates: nearly all of the
 * growth happens across the middle, so it is eased over that span rather than
 * spread evenly.
 */
const GROWTH_EASE_START = 0.25
const GROWTH_EASE_END = 0.75
/** Shadow blur grows this much per extra plate-drop of reach (penumbra widens with distance). */
const BLUR_SPREAD = 0.1
/** Shadow sprites are cached at blur steps of this ratio and picked by nearest. */
const BLUR_LEVEL_STEP = 0.2
const BLUR_LEVELS = 5
/** Perspective for the Placement tilt, as a multiple of the frame's long side. */
const TILT_PERSPECTIVE = 1.5
/** Device-pixel budget for the plate canvas. */
const PIXEL_BUDGET = 4.2e6
/** Shadows are soft, so they are composed at this share of the plate canvas's resolution. */
const SHADOW_RES = 0.6
const QUALITY_FLOOR = 0.6
/** Longest the plates wait for their typeface before drawing in the fallback stack. */
const FONT_WAIT_MS = 1500

// ── Defaults ────────────────────────────────────────────────────────────────
interface FontValue {
    fontFamily?: string
    variant?: string
    fontWeight?: number | string
    fontStyle?: string
    fontSize?: string | number
    lineHeight?: string | number
    letterSpacing?: string | number
    textAlign?: string
}

const DEFAULT_TEXT = "TRUTH"
const DEFAULT_FONT: FontValue = {
    fontFamily: "Fira Sans Condensed",
    variant: "Black",
    fontWeight: 900,
    fontSize: "16px",
    lineHeight: "1.5em",
    letterSpacing: "0em",
    textAlign: "left",
}

/** Tuning constants behind the look. Out of the box these are the poster. */
const DEFAULT_ADVANCED = {
    tilt: 16.5,
    shear: 27,
    letterLength: 43,
    letterDepth: 36,
    pitch: 18.25,
    offsetX: 0,
    offsetY: -0.5,
    thicken: 6,
    shadowOffset: 6,
    shadowGrowth: 195,
    shadowAngle: 10,
    shadowBlur: 6,
    shadowOpacity: 100,
    floatMs: 6000,
    floatAmp: 12,
    staggerMs: 250,
    bob: 11,
    lightMs: 12000,
    lightSwing: 3,
    push: 4,
    pressDepth: 50,
    pressMs: 600,
    followMs: 170,
    wobble: 30,
    wobbleMs: 450,
    parallax: 12,
    grain: 0,
    vignette: 0,
    hover: 50,
}
type Advanced = typeof DEFAULT_ADVANCED

const DEFAULT_PLACEMENT = { x: 0, y: 0, angle: 0, tilt: 0 }
type Placement = typeof DEFAULT_PLACEMENT

export interface CairnShadeProps {
    /** The word, one plate per letter (up to 16). */
    text?: string
    /** Ground colour, painted on the root so Placement never moves it. */
    background?: string
    font?: FontValue
    /** Colour of the letter plates. */
    color?: string
    /** Colour each plate's shadow takes on the plates below. */
    shadowColor?: string
    /** How far apart the plates float: shadow reach and softness. 50 is the poster. */
    depth?: number
    /** Height of the stacked word in the 1200×800 reference frame; shrinks to fit. */
    size?: number
    placement?: Partial<Placement>
    /** Speed of the floating wave. 0 stops it. */
    speed?: number
    advanced?: Partial<Advanced>
    style?: React.CSSProperties
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function num(v: unknown, fallback: number): number {
    const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
    return Number.isFinite(n) ? n : fallback
}
function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v
}
function smoothstep(a: number, b: number, x: number): number {
    const t = clamp((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
}

const VARIANT_WEIGHTS: Record<string, number> = {
    thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400,
    medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
}
function fontFamilyOf(font: FontValue | undefined): string {
    const f = font || DEFAULT_FONT
    return typeof f.fontFamily === "string" && f.fontFamily.trim() ? f.fontFamily.trim() : (DEFAULT_FONT.fontFamily as string)
}
function fontWeightOf(font: FontValue | undefined): number {
    const f = font || DEFAULT_FONT
    const w = num(f.fontWeight, NaN)
    if (Number.isFinite(w)) return w
    const v = typeof f.variant === "string" ? f.variant.toLowerCase().replace(/[\s-]|italic/g, "") : ""
    return VARIANT_WEIGHTS[v] ?? 900
}
function fontItalicOf(font: FontValue | undefined): boolean {
    const f = font || DEFAULT_FONT
    return f.fontStyle === "italic" || (typeof f.variant === "string" && /italic/i.test(f.variant))
}
function fontString(font: FontValue | undefined, px: number): string {
    const fam = fontFamilyOf(font)
    const famCss = fam.includes(",") || /^["']/.test(fam) ? fam : `"${fam}"`
    return `${fontItalicOf(font) ? "italic" : "normal"} ${fontWeightOf(font)} ${px}px ${famCss}, "Helvetica Neue", Helvetica, Arial, sans-serif`
}

/**
 * Framer loads a font picked in its panel itself; a Next.js page does not. When
 * no @font-face for the family is registered, ask Google Fonts for it once (a
 * family it does not know just 400s, and the fallback stack stands).
 */
const requestedFonts = new Set<string>()
function ensureFont(font: FontValue | undefined, onReady: () => void): void {
    const fam = fontFamilyOf(font)
    const fonts = document.fonts
    // Generic families and CSS stacks need nothing loaded; report ready at once.
    if (!fonts || fam.includes(",") || /^["']/.test(fam) || /^(serif|sans-serif|monospace|system-ui)$/i.test(fam)) {
        onReady()
        return
    }
    const weight = fontWeightOf(font)
    const italic = fontItalicOf(font)
    const css = fontString(font, F)
    let registered = false
    fonts.forEach((face) => {
        if (face.family.replace(/^["']|["']$/g, "") === fam) registered = true
    })
    if (registered) {
        fonts.load(css, "TRUTH").then(onReady, onReady)
        return
    }
    const key = `${fam}|${weight}|${italic}`
    if (requestedFonts.has(key)) {
        fonts.load(css, "TRUTH").then(onReady, onReady)
        return
    }
    requestedFonts.add(key)
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`
    link.onload = () => fonts.load(css, "TRUTH").then(onReady, onReady)
    // Unknown to Google Fonts or offline: settle on the fallback stack now.
    link.onerror = onReady
    document.head.appendChild(link)
}

interface GlyphMetrics {
    ch: string
    l: number
    r: number
    asc: number
    desc: number
}

interface Sprite {
    canvas: HTMLCanvasElement
    /** Sprite pixel that sits on the glyph's ink-left baseline point. */
    ox: number
    oy: number
}

// ── Component ───────────────────────────────────────────────────────────────
/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 */
export default function CairnShade(props: CairnShadeProps) {
    props = withMovedControls(props)
    // Defaults sit in the signature; the loop reads live values through propsRef.
    const {
        text = "TEXT",
        background = "#000106",
        font = {"variant":"Black","fontSize":"16px","textAlign":"left","fontFamily":"Inter","fontWeight":900,"lineHeight":"1.5em","letterSpacing":"0em"},
        color = "#FFFFFF",
        shadowColor = "#5A5966",
        depth = 50,
        size = 556,
        speed = 26,
        style,
    } = props
    void [text, font, color, shadowColor, depth, size, speed]
    const adv: Advanced = { ...DEFAULT_ADVANCED, ...(props.advanced ?? {}) }

    const rootRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const grainRef = useRef<HTMLCanvasElement>(null)
    const propsRef = useRef(props)
    propsRef.current = props
    // Framer re-renders with identical values; only a real change wakes the loop.
    const keyRef = useRef("")
    const wakeRef = useRef<() => void>(() => {})
    const propKey = JSON.stringify([props.text, props.background, props.font, props.color, props.shadowColor, props.depth, props.size, props.placement, props.speed, props.advanced])
    if (propKey !== keyRef.current) {
        keyRef.current = propKey
        wakeRef.current()
    }

    useEffect(() => {
        const rootEl = rootRef.current
        const canvasEl = canvasRef.current
        const grainEl = grainRef.current
        if (!rootEl || !canvasEl || !grainEl) return
        // Re-bound so the hoisted draw/frame functions see them as non-null.
        const root: HTMLDivElement = rootEl
        const canvas: HTMLCanvasElement = canvasEl
        const grainCanvas: HTMLCanvasElement = grainEl
        let ctx = canvas.getContext("2d")
        const gctx = grainCanvas.getContext("2d")
        const temp = document.createElement("canvas")
        const tctx = temp.getContext("2d")
        const measure = document.createElement("canvas").getContext("2d")
        if (!ctx || !tctx || !measure) return

        const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null

        // ── Size: layout px from the ResizeObserver; on-screen scale read once per resize ──
        let W = 0
        let H = 0
        let shown = 1
        let quality = 1
        let bs = 1 // device px per CSS px on the plate canvas
        let bsFull = 1 // the same before the quality step
        let ovX = 1
        let ovY = 1
        let dirty = true
        // Resizing a canvas wipes it. If that happens outside a draw, the browser can
        // paint the empty buffer before the next frame lands: a blink. So nothing
        // resizes directly; it asks, and draw() applies the resize right before it
        // paints the new frame into the fresh buffer.
        let resizePending = true
        const requestResize = () => {
            resizePending = true
            dirty = true
        }
        const applyResize = () => {
            resizePending = false
            const dpr = Math.min(2, window.devicePixelRatio || 1)
            // Never fewer pixels than the layout box; grow (to 2×) when zoomed in.
            let s = dpr * clamp(shown, 1, 2)
            const px = W * ovX * H * ovY
            if (px * s * s > PIXEL_BUDGET) s = Math.sqrt(PIXEL_BUDGET / Math.max(1, px))
            // Shadow sprites follow the full scale, not the quality step: a step then
            // only resizes the canvas instead of re-blurring every sprite in one frame.
            bsFull = Math.max(0.5, s)
            bs = Math.max(0.5, s * quality)
            const cw = Math.max(1, Math.round(W * ovX * bs))
            const ch = Math.max(1, Math.round(H * ovY * bs))
            if (canvas.width !== cw || canvas.height !== ch) {
                canvas.width = cw
                canvas.height = ch
            }
            canvas.style.width = `${ovX * 100}%`
            canvas.style.height = `${ovY * 100}%`
            canvas.style.left = `${-(ovX - 1) * 50}%`
            canvas.style.top = `${-(ovY - 1) * 50}%`
            const gw = Math.max(1, Math.round((W * dpr) / 2))
            const gh = Math.max(1, Math.round((H * dpr) / 2))
            if (grainCanvas.width !== gw || grainCanvas.height !== gh) {
                grainCanvas.width = gw
                grainCanvas.height = gh
            }
            // Sprites are keyed on their own scale, so a resize rebuilds them only if it must.
        }
        const ro = new ResizeObserver((entries) => {
            const e = entries[entries.length - 1]
            W = e.contentRect.width
            H = e.contentRect.height
            const r = root.getBoundingClientRect()
            const s = W > 0 ? r.width / W : 1
            if (Math.abs(s - shown) / Math.max(shown, 1e-3) > 0.05) shown = s
            requestResize()
            // Resize and redraw together now, before this frame paints.
            draw(performance.now(), true)
        })

        // ── Pointer: record client coords only; the rect is read in the frame ──
        const ptr = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, over: 0, overT: 0, press: 0, pressT: 0, wobbleT: 1e9 }
        let cx = 0
        let cy = 0
        let moved = false
        let inside = false
        const onMove = (e: PointerEvent) => {
            if (e.clientX === cx && e.clientY === cy && inside) return
            cx = e.clientX
            cy = e.clientY
            moved = true
            if (!inside) {
                inside = true
                ptr.overT = 1
            }
            wake()
        }
        const onEnter = (e: PointerEvent) => {
            onMove(e)
            if (ptr.over < 0.01) snapPointer = true
        }
        const onLeave = () => {
            inside = false
            ptr.overT = 0
            ptr.pressT = 0
            wake()
        }
        const onDown = (e: PointerEvent) => {
            onMove(e)
            ptr.pressT = 1
            ptr.wobbleT = 0
            wake()
        }
        const onUp = (e: PointerEvent) => {
            ptr.pressT = 0
            if (e.pointerType === "touch") onLeave()
            wake()
        }
        const onScroll = () => {
            if (inside) moved = true
        }
        let snapPointer = false
        root.addEventListener("pointermove", onMove)
        root.addEventListener("pointerenter", onEnter)
        root.addEventListener("pointerleave", onLeave)
        root.addEventListener("pointerdown", onDown)
        window.addEventListener("pointerup", onUp)
        window.addEventListener("pointercancel", onUp)
        window.addEventListener("scroll", onScroll, { passive: true, capture: true })

        // ── Visibility, context loss ──
        let visible = true
        const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); wake() }) : null
        io?.observe(root)
        const onVis = () => wake()
        document.addEventListener("visibilitychange", onVis)
        let lost = false
        const onLost = (e: Event) => {
            e.preventDefault()
            lost = true
        }
        const onRestored = () => {
            lost = false
            ctx = canvas.getContext("2d")
            spriteKey = ""
            wake()
        }
        canvas.addEventListener("contextlost", onLost)
        canvas.addEventListener("contextrestored", onRestored)

        // ── Glyph metrics (rebuilt on text / font / font load) ──
        let fontTick = 0
        let metricsKey = ""
        let glyphs: GlyphMetrics[] = []
        let capRef = F * 0.72
        let fontCss = fontString(DEFAULT_FONT, F)
        // The face asked for, and the face actually drawn. They differ only while a new
        // face loads: plates never paint in the fallback face and then jump to the real
        // one (first load), and a font change keeps the old face until the new is ready.
        let wantCss = ""
        let activeCss = ""
        let fontTimer = 0
        const syncMetrics = (p: CairnShadeProps) => {
            const font = p.font ?? DEFAULT_FONT
            const css = fontString(font, F)
            if (css !== wantCss) {
                wantCss = css
                window.clearTimeout(fontTimer)
                fontTimer = window.setTimeout(() => {
                    if (wantCss === css && activeCss !== css) {
                        activeCss = css
                        wake()
                    }
                }, FONT_WAIT_MS)
                ensureFont(font, () => {
                    if (wantCss !== css) return
                    activeCss = css
                    fontTick++ // a late arrival after the timeout re-measures in the real face
                    wake()
                })
            }
            if (!activeCss) {
                glyphs = []
                return
            }
            const key = JSON.stringify([p.text ?? DEFAULT_TEXT, activeCss, fontTick])
            if (key === metricsKey) return
            metricsKey = key
            fontCss = activeCss
            measure.font = fontCss
            measure.textAlign = "left"
            measure.textBaseline = "alphabetic"
            const capM = measure.measureText("H")
            capRef = capM.actualBoundingBoxAscent > 1 ? capM.actualBoundingBoxAscent : F * 0.72
            glyphs = Array.from(String(p.text ?? DEFAULT_TEXT)).slice(0, MAX_LETTERS).map((ch) => {
                const m = measure.measureText(ch)
                return { ch, l: m.actualBoundingBoxLeft || 0, r: m.actualBoundingBoxRight || 0, asc: m.actualBoundingBoxAscent || 0, desc: m.actualBoundingBoxDescent || 0 }
            })
            spriteKey = ""
        }

        // ── Shadow sprites: each glyph flattened into the plane's own axes ──
        // Level -1 is the plain silhouette (the clip mask for shadows landing on that
        // plate); levels 0.. are the shadow it casts, blurred in the plane, as a real
        // penumbra is round on the surface it falls on. All at the reduced plane scale.
        let spriteKey = ""
        let sprites = new Map<string, Sprite>()
        let spriteScale = { sA: 1, sB: 1, thick: 0, sigma0: 0, color: "", q: 1 }
        const getSprite = (j: number, level: number): Sprite | null => {
            const id = `${j}|${level}`
            const hit = sprites.get(id)
            if (hit) return hit
            const g = glyphs[j]
            if (!g || !g.ch.trim()) return null
            const { sA, sB, thick, sigma0, color: shadowCol, q } = spriteScale
            const mask = level < 0
            const col = mask ? "#fff" : shadowCol
            const sig = mask ? 0 : sigma0 * (1 + BLUR_LEVEL_STEP * level) * q
            const tPad = (thick / 2) * Math.max(sA, sB) * q
            const pad = Math.ceil(3 * sig + tPad + 2)
            const w = Math.max(1, Math.ceil((g.l + g.r) * sA * q + 2 * pad))
            const h = Math.max(1, Math.ceil((g.asc + g.desc) * sB * q + 2 * pad))
            const ox = pad
            const oy = pad + g.asc * sB * q
            // Unblurred silhouette (fill + stroke) first, so the blur sees one shape.
            if (temp.width < w || temp.height < h) {
                temp.width = Math.max(temp.width, w)
                temp.height = Math.max(temp.height, h)
            }
            tctx.setTransform(1, 0, 0, 1, 0, 0)
            tctx.clearRect(0, 0, temp.width, temp.height)
            tctx.setTransform(sA * q, 0, 0, sB * q, ox, oy)
            tctx.font = fontCss
            tctx.textAlign = "left"
            tctx.textBaseline = "alphabetic"
            tctx.fillStyle = col
            tctx.fillText(g.ch, g.l, 0)
            if (thick > 0) {
                tctx.lineWidth = thick
                tctx.lineJoin = "miter"
                tctx.miterLimit = 4
                tctx.strokeStyle = col
                tctx.strokeText(g.ch, g.l, 0)
            }
            const c = document.createElement("canvas")
            c.width = w
            c.height = h
            const x = c.getContext("2d")
            if (!x) return null
            if (sig > 0.25) {
                // Canvas shadowBlur ≈ 2σ and is honoured everywhere (ctx.filter is not).
                // Draw the shape far off to the left and bring only its shadow back.
                const K = w + 64
                x.shadowColor = col
                x.shadowBlur = 2 * sig
                x.shadowOffsetX = K
                x.drawImage(temp, 0, 0, w, h, -K, 0, w, h)
            } else {
                x.drawImage(temp, 0, 0, w, h, 0, 0, w, h)
            }
            const sp: Sprite = { canvas: c, ox, oy }
            sprites.set(id, sp)
            return sp
        }
        // One plane canvas per plate, where its shadows are composed and clipped.
        const planes: HTMLCanvasElement[] = []
        const planeOf = (i: number, w: number, h: number): CanvasRenderingContext2D | null => {
            let c = planes[i]
            if (!c) {
                c = document.createElement("canvas")
                planes[i] = c
            }
            if (c.width !== w || c.height !== h) {
                c.width = w
                c.height = h
            }
            return c.getContext("2d")
        }

        // ── Grain tile, built once ──
        const noise = document.createElement("canvas")
        noise.width = 128
        noise.height = 128
        const nctx = noise.getContext("2d")
        if (nctx) {
            const img = nctx.createImageData(128, 128)
            for (let i = 0; i < img.data.length; i += 4) {
                const v = Math.floor(Math.random() * 256)
                img.data[i] = v
                img.data[i + 1] = v
                img.data[i + 2] = v
                img.data[i + 3] = 255
            }
            nctx.putImageData(img, 0, 0)
        }
        let grainPattern: CanvasPattern | null = null
        let grainShown = false

        // ── Per-frame scratch (no allocations in the loop) ──
        const PX = new Float64Array(MAX_LETTERS)
        const PY = new Float64Array(MAX_LETTERS)
        const FLOAT = new Float64Array(MAX_LETTERS)
        const WOB = new Float64Array(MAX_LETTERS)
        const REACH = new Float64Array(MAX_LETTERS)
        let tiltCss = ""
        let originCss = ""

        let tau = 0
        let lastTick = -1
        let due = 0
        let raf = 0
        let lateEma = 1
        let slowFor = 0
        let fastFor = 0

        function wake() {
            dirty = true
            if (!raf) {
                due = 0
                raf = requestAnimationFrame(frame)
            }
        }
        wakeRef.current = wake

        /** Draws one frame. Returns true while anything is still moving. */
        function draw(now: number, force = false): boolean {
            if (!ctx || lost || W < 1 || H < 1) return false
            const p = propsRef.current
            const a: Advanced = { ...DEFAULT_ADVANCED, ...(p.advanced ?? {}) }
            const pl: Placement = { ...DEFAULT_PLACEMENT, ...(p.placement ?? {}) }
            const reduced = !!(mq && mq.matches)
            syncMetrics(p)

            // Placement overscan: the canvas reaches past the frame only while tilted,
            // so a receding edge never shows the plates cut off.
            const tilt = clamp(num(pl.tilt, 0), -60, 60)
            const st = Math.abs(Math.sin((tilt * Math.PI) / 180))
            const nOvX = tilt ? 1 + 0.4 * st : 1
            const nOvY = tilt ? 1 + 0.8 * st : 1
            if (nOvX !== ovX || nOvY !== ovY) {
                ovX = nOvX
                ovY = nOvY
                requestResize()
            }
            // Apply any pending resize here, so the wiped buffer is repainted this frame.
            if (resizePending) applyResize()

            // ── Clock & pointer easing ──
            const dt = lastTick < 0 ? 0 : Math.min(1 / 20, (now - lastTick) / 1000)
            lastTick = now
            const speedMul = Math.max(0, num(p.speed, 50)) / 50
            if (!reduced) tau += dt * 1000 * speedMul
            const hoverMul = reduced ? 0 : Math.max(0, num(a.hover, 50)) / 50
            // Hover fade in/out: eased over about the same Follow Ease the position settles in.
            const kf = 1 - Math.exp(-dt * (2500 / Math.max(1, num(a.followMs, 170))))
            const kp = 1 - Math.exp(-dt * (4000 / Math.max(1, num(a.pressMs, 600))))

            // Frame → content map (one path for drawing and the pointer).
            const S = Math.min(H, W / REF_ASPECT)
            const ang = (num(pl.angle, 0) * Math.PI) / 180
            const cosA = Math.cos(ang)
            const sinA = Math.sin(ang)
            const sizePx = Math.max(10, num(p.size, 726))
            let U = (sizePx * S) / REF_H

            const sh = (num(a.shear, 27) * Math.PI) / 180
            const tl = (num(a.tilt, 16.5) * Math.PI) / 180
            // Unit axes of the plate plane on screen: glyph x, and glyph down.
            const exX = Math.cos(sh)
            const exY = Math.sin(sh)
            const eyX = -Math.cos(tl)
            const eyY = Math.sin(tl)
            const lenK = num(a.letterLength, 43) / 100 / capRef
            const depK = num(a.letterDepth, 36) / 100 / capRef
            const pitch = num(a.pitch, 18.25) / 100
            const thick = (Math.max(0, num(a.thicken, 6)) / 100) * capRef
            const N = glyphs.length

            // Rest bounds at U = 1, so the stack is centred and fitted without jitter.
            let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity
            for (let i = 0; i < N; i++) {
                const g = glyphs[i]
                if (!g.ch.trim()) continue
                const t2 = thick / 2
                const xs0 = -t2, xs1 = g.l + g.r + t2, ys0 = -g.asc - t2, ys1 = g.desc + t2
                for (let k = 0; k < 4; k++) {
                    const gx = k & 1 ? xs1 : xs0
                    const gy = k & 2 ? ys1 : ys0
                    const sx = exX * gx * depK + eyX * gy * lenK
                    const sy = exY * gx * depK + eyY * gy * lenK + i * pitch
                    if (sx < bx0) bx0 = sx
                    if (sx > bx1) bx1 = sx
                    if (sy < by0) by0 = sy
                    if (sy > by1) by1 = sy
                }
            }
            if (!Number.isFinite(bx0)) {
                bx0 = bx1 = by0 = by1 = 0
            }
            const bw = Math.max(1e-3, bx1 - bx0)
            const bh = Math.max(1e-3, by1 - by0)
            U = Math.min(U, (FIT_H * H) / bh, (FIT_W * W) / bw)

            const sA = depK * U
            const sB = lenK * U
            // Content centre: frame centre, the composition nudge, then the Placement offset.
            const Cx = W / 2 + (num(a.offsetX, 0) / 100) * U + (num(pl.x, 0) / 100) * W
            const Cy = H / 2 + (num(a.offsetY, 0) / 100) * U + (num(pl.y, 0) / 100) * H
            const ox0 = -U * (bx0 + bx1) / 2
            const oy0 = -U * (by0 + by1) / 2

            // Tilt is a CSS perspective lean of the canvas about the content's centre.
            const persp = Math.round(Math.max(W, H, 1) * TILT_PERSPECTIVE)
            const css = tilt ? `perspective(${persp}px) rotateX(${tilt}deg)` : ""
            if (css !== tiltCss) {
                tiltCss = css
                canvas.style.transform = css
            }
            const origin = `${((Cx + ((ovX - 1) * W) / 2) / (W * ovX)) * 100}% ${((Cy + ((ovY - 1) * H) / 2) / (H * ovY)) * 100}%`
            if (origin !== originCss) {
                originCss = origin
                canvas.style.transformOrigin = origin
            }

            // Pointer: displayed rect (scale-proof), then Placement inverted.
            if (moved) {
                moved = false
                const r = root.getBoundingClientRect()
                if (r.width > 0 && r.height > 0) {
                    let X = ((cx - r.left) / r.width) * W - Cx
                    let Y = ((cy - r.top) / r.height) * H - Cy
                    if (tilt) {
                        const t = (tilt * Math.PI) / 180
                        const yy = (Y * persp) / (persp * Math.cos(t) + Y * Math.sin(t))
                        X = (X * (persp - yy * Math.sin(t))) / persp
                        Y = yy
                    }
                    const lx = X * cosA + Y * sinA
                    const ly = -X * sinA + Y * cosA
                    ptr.tx = clamp(lx / Math.max(1, W / 2), -1, 1)
                    ptr.ty = clamp(ly / Math.max(1, H / 2), -1, 1)
                    if (snapPointer) {
                        snapPointer = false
                        ptr.x = ptr.tx
                        ptr.y = ptr.ty
                        ptr.vx = ptr.vy = 0
                    }
                }
            }
            // Follow the pointer with a critically damped spring that settles within
            // Follow Ease. A first-order ease with that time constant (the old path)
            // only reached 90% after ~2.3× it and read as trailing; the spring keeps
            // up while starting and stopping smoothly, never overshooting. Fixed
            // 4 ms substeps keep it identical at 30, 60 or 120 Hz.
            const followS = Math.max(0.02, num(a.followMs, 170) / 1000)
            const omega = 5.8 / followS
            let rem = dt
            while (rem > 1e-6) {
                const h = Math.min(rem, 1 / 240)
                ptr.vx += (omega * omega * (ptr.tx - ptr.x) - 2 * omega * ptr.vx) * h
                ptr.vy += (omega * omega * (ptr.ty - ptr.y) - 2 * omega * ptr.vy) * h
                ptr.x += ptr.vx * h
                ptr.y += ptr.vy * h
                rem -= h
            }
            const overT = reduced ? 0 : ptr.overT
            const pressT = reduced ? 0 : ptr.pressT
            ptr.over += (overT - ptr.over) * kf
            ptr.press += (pressT - ptr.press) * kp
            if (Math.abs(overT - ptr.over) < 1e-3) ptr.over = overT
            if (Math.abs(pressT - ptr.press) < 1e-3) ptr.press = pressT
            if (Math.abs(ptr.tx - ptr.x) < 1e-4 && Math.abs(ptr.vx) < 1e-3) {
                ptr.x = ptr.tx
                ptr.vx = 0
            }
            if (Math.abs(ptr.ty - ptr.y) < 1e-4 && Math.abs(ptr.vy) < 1e-3) {
                ptr.y = ptr.ty
                ptr.vy = 0
            }
            const wobbleMs = Math.max(50, num(a.wobbleMs, 450))
            if (!reduced) ptr.wobbleT += dt * 1000
            // Damped jelly, read from elapsed time so it plays the same at any frame rate.
            // One swing lasts ~0.6× the decay time: slow enough that 30 Hz still shows a
            // smooth sway (the old 0.26× period got 3–4 frames a swing and strobed), and
            // it eases in over the first 40 ms so a tap does not snap the plates.
            const wobbleDecay = reduced ? 0 : Math.exp(-ptr.wobbleT / (wobbleMs * 0.6))
            const wobbleIn = 1 - Math.exp(-ptr.wobbleT / 40)
            const wobbleAmt = (num(a.wobble, 30) / 100) * wobbleDecay * wobbleIn * Math.sin((2 * Math.PI * ptr.wobbleT) / (wobbleMs * 0.6))

            // ── Shadow reach per receiving plate ──
            const depthMul = Math.max(0, num(p.depth, 50)) / 50
            const growth = num(a.shadowGrowth, 195) / 100
            const L1 = (num(a.shadowOffset, 6) / 100) * U * depthMul
            for (let i = 1; i < N; i++) {
                const t = N > 2 ? (i - 1) / (N - 2) : 0
                REACH[i] = L1 * (1 + growth * smoothstep(GROWTH_EASE_START, GROWTH_EASE_END, t))
            }
            const floatMs = Math.max(100, num(a.floatMs, 6000))
            const amp = num(a.floatAmp, 12) / 100
            const stagger = num(a.staggerMs, 250)
            const bob = (num(a.bob, 11) / 1000) * U
            const lightMs = Math.max(100, num(a.lightMs, 12000))
            const theta = ((num(a.shadowAngle, 10) + num(a.lightSwing, 3) * Math.sin((2 * Math.PI * tau) / lightMs)) * Math.PI) / 180
            const dirX = Math.sin(theta)
            const dirY = Math.cos(theta)
            const pushAmt = (num(a.push, 4) / 100) * U * ptr.over * hoverMul
            const pushX = -ptr.x * pushAmt
            const pushY = -ptr.y * pushAmt
            const parallaxAmt = (num(a.parallax, 12) / 100) * U * ptr.over * hoverMul
            const pressMul = Math.max(0.1, 1 - (num(a.pressDepth, 50) / 100) * ptr.press * Math.min(2, hoverMul))
            const shOp = clamp(num(a.shadowOpacity, 100) / 100, 0, 1)
            const sigma0 = (Math.max(0, num(a.shadowBlur, 6)) / 1000) * U * (0.5 + 0.5 * depthMul)
            const letterColor = p.color || "#FFFFFF"
            const shColor = p.shadowColor || "#5A5966"

            for (let i = 0; i < N; i++) {
                const s = Math.sin((2 * Math.PI * (tau - i * stagger)) / floatMs)
                FLOAT[i] = 1 + amp * s
                WOB[i] = wobbleAmt * Math.sin(i * 1.7 + 0.6)
                const di = i - (N - 1) / 2
                // Rest position (content space, before Angle) plus float bob and parallax.
                PX[i] = ox0 + ptr.x * parallaxAmt * di
                PY[i] = oy0 + i * pitch * U - bob * s + ptr.y * parallaxAmt * 0.3 * di
            }

            // ── Sprites: rebuilt only when what shapes them changes ──
            const q = bsFull * SHADOW_RES
            const sk = JSON.stringify([metricsKey, Math.round(sA * 1e4), Math.round(sB * 1e4), Math.round(thick * 100), Math.round(sigma0 * 100), shColor, Math.round(q * 1000)])
            // Blur level per (receiver, caster) pair comes from the plates' REST reach, so
            // float, press and wobble never ask for a sprite that is not built yet (a
            // fresh blurred sprite mid-tap stalled the GPU for several frames).
            const blurLevel = (i: number, j: number) => {
                const rel = L1 > 0 ? ((i - j) * REACH[i]) / L1 : 1
                return clamp(Math.round((BLUR_SPREAD * Math.max(0, rel - 1)) / BLUR_LEVEL_STEP), 0, BLUR_LEVELS - 1)
            }
            if (sk !== spriteKey) {
                spriteKey = sk
                sprites = new Map()
                spriteScale = { sA, sB, thick, sigma0, color: shColor, q }
                // Build every sprite this look needs now, in one go, not on first use.
                for (let i = 1; i < N; i++) {
                    getSprite(i, -1)
                    for (let j = 0; j < i; j++) getSprite(j, blurLevel(i, j))
                }
            }

            // ── Draw ──
            const ovPxX = ((ovX - 1) * W) / 2
            const ovPxY = ((ovY - 1) * H) / 2
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.globalCompositeOperation = "source-over"
            ctx.globalAlpha = 1
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.font = fontCss
            ctx.textAlign = "left"
            ctx.textBaseline = "alphabetic"
            ctx.lineJoin = "miter"
            ctx.miterLimit = 4
            ctx.imageSmoothingEnabled = true

            // Screen matrix of plate i's plane (unit axes, wobble, Angle), in device px.
            const planeM = (i: number, out: Float64Array) => {
                const w = WOB[i]
                const ax = exX * (1 + w), ay = exY * (1 - w * 0.6)
                const qx = eyX * (1 - w * 0.6), qy = eyY * (1 + w)
                out[0] = (cosA * ax - sinA * ay) * bs
                out[1] = (sinA * ax + cosA * ay) * bs
                out[2] = (cosA * qx - sinA * qy) * bs
                out[3] = (sinA * qx + cosA * qy) * bs
            }
            const toDevX = (x: number, y: number) => (Cx + cosA * x - sinA * y + ovPxX) * bs
            const toDevY = (x: number, y: number) => (Cy + sinA * x + cosA * y + ovPxY) * bs
            // Content-space step -> plane (u along the letter width, v along its height).
            const det = exX * eyY - eyX * exY
            const MI = PLANE_I
            const cw = canvas.width
            const chh = canvas.height

            for (let i = N - 1; i >= 0; i--) {
                const g = glyphs[i]
                if (!g.ch.trim()) continue
                planeM(i, MI)
                const tx = toDevX(PX[i], PY[i])
                const ty = toDevY(PX[i], PY[i])
                // Cull plates wholly off the canvas (Placement can carry them out).
                const t2 = thick / 2
                const gx0 = -t2 * sA, gx1 = (g.l + g.r + t2) * sA, gy0 = (-g.asc - t2) * sB, gy1 = (g.desc + t2) * sB
                let dx0 = Infinity, dx1 = -Infinity, dy0 = Infinity, dy1 = -Infinity
                for (let k = 0; k < 4; k++) {
                    const gx = k & 1 ? gx1 : gx0
                    const gy = k & 2 ? gy1 : gy0
                    const X = tx + MI[0] * gx + MI[2] * gy
                    const Y = ty + MI[1] * gx + MI[3] * gy
                    if (X < dx0) dx0 = X
                    if (X > dx1) dx1 = X
                    if (Y < dy0) dy0 = Y
                    if (Y > dy1) dy1 = Y
                }
                if (dx1 < 0 || dy1 < 0 || dx0 > cw || dy0 > chh) continue

                // The plate itself, as crisp vector type.
                ctx.globalAlpha = 1
                ctx.setTransform(MI[0] * sA, MI[1] * sA, MI[2] * sB, MI[3] * sB, tx, ty)
                ctx.fillStyle = letterColor
                ctx.fillText(g.ch, g.l, 0)
                if (thick > 0) {
                    ctx.lineWidth = thick
                    ctx.strokeStyle = letterColor
                    ctx.strokeText(g.ch, g.l, 0)
                }
                // Shadows of every plate above, composed in this plate's own plane at the
                // reduced shadow scale (plain translated blits), clipped to its silhouette,
                // then laid over the plate in one transformed draw.
                if (i === 0 || shOp <= 0 || depthMul <= 0) continue
                const mask = getSprite(i, -1)
                if (!mask) continue
                const pctx = planeOf(i, mask.canvas.width, mask.canvas.height)
                if (!pctx) continue
                pctx.setTransform(1, 0, 0, 1, 0, 0)
                pctx.globalCompositeOperation = "source-over"
                pctx.globalAlpha = 1
                pctx.clearRect(0, 0, mask.canvas.width, mask.canvas.height)
                const reach = REACH[i]
                let any = false
                for (let j = 0; j < i; j++) {
                    if (!glyphs[j].ch.trim()) continue
                    const len = (i - j) * reach * FLOAT[j] * pressMul
                    const spr = getSprite(j, blurLevel(i, j))
                    if (!spr) continue
                    const ddx = PX[j] + dirX * len + pushX - PX[i]
                    const ddy = PY[j] + dirY * len + pushY - PY[i]
                    const u = (eyY * ddx - eyX * ddy) / det
                    const v = (-exY * ddx + exX * ddy) / det
                    const px = mask.ox + u * q - spr.ox
                    const py = mask.oy + v * q - spr.oy
                    if (px >= mask.canvas.width || py >= mask.canvas.height || px + spr.canvas.width <= 0 || py + spr.canvas.height <= 0) continue
                    pctx.globalAlpha = shOp * clamp(1 - 0.25 * (FLOAT[j] * pressMul - 1), 0, 1)
                    pctx.drawImage(spr.canvas, px, py)
                    any = true
                }
                if (!any) continue
                pctx.globalAlpha = 1
                pctx.globalCompositeOperation = "destination-in"
                pctx.drawImage(mask.canvas, 0, 0)
                pctx.globalCompositeOperation = "source-over"
                const k0 = MI[0] / q, k1 = MI[1] / q, k2 = MI[2] / q, k3 = MI[3] / q
                ctx.setTransform(k0, k1, k2, k3, tx - k0 * mask.ox - k2 * mask.oy, ty - k1 * mask.ox - k3 * mask.oy)
                ctx.drawImage(planes[i], 0, 0)
            }

            // Grain (only when asked for): jittered per drawn frame on its own layer.
            const grain = clamp(num(a.grain, 0) / 100, 0, 1)
            if (gctx && grain > 0) {
                if (!grainPattern) grainPattern = gctx.createPattern(noise, "repeat")
                if (grainPattern) {
                    const gx = Math.floor(Math.random() * 128)
                    const gy = Math.floor(Math.random() * 128)
                    gctx.setTransform(1, 0, 0, 1, 0, 0)
                    gctx.clearRect(0, 0, grainCanvas.width, grainCanvas.height)
                    gctx.globalAlpha = 0.3 * grain
                    gctx.translate(-gx, -gy)
                    gctx.fillStyle = grainPattern
                    gctx.fillRect(gx, gy, grainCanvas.width, grainCanvas.height)
                    gctx.globalAlpha = 1
                    grainShown = true
                }
            } else if (gctx && grainShown) {
                gctx.setTransform(1, 0, 0, 1, 0, 0)
                gctx.clearRect(0, 0, grainCanvas.width, grainCanvas.height)
                grainShown = false
            }
            void force

            const pointerBusy =
                ptr.x !== ptr.tx || ptr.y !== ptr.ty || ptr.vx !== 0 || ptr.vy !== 0 || ptr.over !== overT || ptr.press !== pressT || (!reduced && wobbleDecay > 0.002 && num(a.wobble, 30) > 0)
            const drifting = !reduced && speedMul > 0 && (amp > 0 || bob > 0 || num(a.lightSwing, 3) > 0)
            return pointerBusy ? true : drifting
        }

        // ── Loop: 60 fps while the pointer moves things, 30 fps for the slow float, 0 when still ──
        let lastMode = 0
        let lastDrawAt = 0
        let lastRafAt = 0
        let cadence = 1000 / 60 // display tick, taken as the floor of recent rAF gaps
        let climbBan = 0
        let banMs = 3000
        function frame(now: number) {
            raf = 0
            if (!visible || document.hidden) {
                lastRafAt = 0
                return
            }
            if (lastRafAt > 0) {
                const gap = now - lastRafAt
                cadence = gap < cadence ? Math.max(4, gap) : Math.min(gap, cadence + 0.2)
            }
            lastRafAt = now
            if (due === 0) due = now
            if (now < due - 3 && !dirty) {
                raf = requestAnimationFrame(frame)
                return
            }
            const busy = draw(now)
            dirty = false
            const reduced = !!(mq && mq.matches)
            const pointerActive = ptr.x !== ptr.tx || ptr.y !== ptr.ty || ptr.vx !== 0 || ptr.vy !== 0 || ptr.over !== (reduced ? 0 : ptr.overT) || ptr.press !== (reduced ? 0 : ptr.pressT) || ptr.wobbleT < 3000
            const mode = !busy ? 0 : pointerActive ? 60 : 30
            if (mode) {
                const period = 1000 / mode
                // Accumulator pacing: even cadence at any refresh rate.
                due += period
                if (due < now - period) due = now
                // Resolution budget. Canvas work lands on the GPU process, so main-thread
                // time hides it; judge by drawn frames arriving late against what the
                // display can deliver (Framer's canvas often ticks at 30 Hz).
                if (lastMode === mode && lastDrawAt > 0) {
                    const expected = Math.max(1, Math.round(period / cadence - 0.15)) * cadence
                    lateEma += ((now - lastDrawAt) / expected - lateEma) * 0.1
                }
                if (lateEma > 1.35) {
                    slowFor += 1
                    fastFor = 0
                } else if (lateEma < 1.1) {
                    fastFor += 1
                    slowFor = 0
                } else {
                    slowFor = fastFor = 0
                }
                if (slowFor > 20 && quality > QUALITY_FLOOR) {
                    quality = Math.max(QUALITY_FLOOR, quality * 0.85)
                    slowFor = 0
                    lateEma = 1
                    climbBan = now + banMs
                    banMs = Math.min(60000, banMs * 2)
                    requestResize() // applied by the next draw, never between frames
                } else if (fastFor > 150 && quality < 1 && now > climbBan) {
                    quality = Math.min(1, quality / 0.85)
                    fastFor = 0
                    requestResize() // applied by the next draw, never between frames
                }
                lastDrawAt = now
                lastMode = mode
                raf = requestAnimationFrame(frame)
            } else {
                lastMode = 0
                lastDrawAt = 0
                lastTick = -1 // a still scene does not bank time
            }
        }

        ro.observe(root)
        raf = requestAnimationFrame(frame)

        return () => {
            cancelAnimationFrame(raf)
            window.clearTimeout(fontTimer)
            raf = -1
            wakeRef.current = () => {}
            ro.disconnect()
            io?.disconnect()
            document.removeEventListener("visibilitychange", onVis)
            canvas.removeEventListener("contextlost", onLost)
            canvas.removeEventListener("contextrestored", onRestored)
            root.removeEventListener("pointermove", onMove)
            root.removeEventListener("pointerenter", onEnter)
            root.removeEventListener("pointerleave", onLeave)
            root.removeEventListener("pointerdown", onDown)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)
            window.removeEventListener("scroll", onScroll, { capture: true })
        }
    }, [])

    const vig = clamp(num(adv.vignette, 0) / 100, 0, 1)
    // No minWidth/minHeight: the root fills any frame and the stack is contained in it.
    // The Background is CSS on the root, so Placement moves the plates, never the ground.
    return (
        <div
            ref={rootRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                aspectRatio: `${REF_W} / ${REF_H}`,
                ...style,
                overflow: "hidden",
                background,
                touchAction: "pan-y",
            }}
        >
            {/* Size, position, tilt and origin are set imperatively. */}
            <canvas ref={canvasRef} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
            {vig > 0 && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        background: `radial-gradient(circle farthest-corner at center, rgba(0,0,0,0) 40%, rgba(0,0,0,${clamp(0.9 * vig, 0, 1)}) 100%)`,
                    }}
                />
            )}
            <canvas ref={grainRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
        </div>
    )
}

const PLANE_I = new Float64Array(4)