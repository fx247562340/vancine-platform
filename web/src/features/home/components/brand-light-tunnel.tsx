/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/*
Vancine's light-field renderer is adapted from the React Bits Light Tunnel
component. Copyright (c) 2026 David Haz. Licensed under the MIT License with
the Commons Clause condition; see THIRD-PARTY-LICENSES.md.
*/
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

const VERTEX_SHADER = `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uCableCount;
uniform float uCableWidth;
uniform float uGlow;
uniform float uOpacity;
uniform float uBrightness;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uWaviness;
uniform float uSway;
uniform vec2 uMouse;
uniform vec3 uCoolColor;
uniform vec3 uVioletColor;
uniform vec3 uWarmColor;
uniform vec3 uPulseColor;

out vec4 fragColor;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

float softLine(float distanceToLine, float width) {
  return 1.0 - smoothstep(width, width * 3.8, distanceToLine);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) /
    min(uResolution.x, uResolution.y);

  // The pointer moves the vanishing point rather than the whole field, so the
  // material feels spatial while the copy remains optically stable.
  uv -= uMouse * 0.075;

  float radius = max(length(uv), 0.0001);
  float depth = -log(radius);
  float angle = atan(uv.y, uv.x);

  // A slow double-lobe distortion echoes the Vancine infinity mark without
  // drawing a literal logo. Two independent phases prevent a mechanical loop.
  float lobe = sin(angle * 2.0 - depth * 0.72 + uTime * 0.13);
  float drift = sin(depth * 1.35 + uTime * 0.19) * uWaviness;
  float sway = sin(depth * 0.58 - uTime * 0.11) * uSway;
  float warpedAngle = angle + drift + sway + lobe * 0.035;

  float cableSpace = (warpedAngle / TAU + 0.5) * uCableCount;
  float cableId = floor(cableSpace);
  float cableDistance = abs(fract(cableSpace) - 0.5);
  float cableNoise = hash(cableId + 13.7);
  float width = uCableWidth * mix(0.72, 1.25, cableNoise);

  float core = softLine(cableDistance, width);
  float halo = softLine(cableDistance, width * (4.0 + uGlow * 2.0));

  // Pulses travel towards the viewer at slightly different speeds per cable.
  float travel = fract(depth * 0.22 - uTime * uSpeed * mix(0.82, 1.24, cableNoise));
  float pulse = pow(1.0 - abs(travel * 2.0 - 1.0), 10.0);
  float secondPulse = pow(
    1.0 - abs(fract(travel + 0.47 + cableNoise * 0.19) * 2.0 - 1.0),
    18.0
  );
  pulse = max(pulse, secondPulse * 0.72);

  float horizontal = smoothstep(-0.72, 0.72, uv.x);
  vec3 sideColor = mix(uCoolColor, uWarmColor, horizontal);
  float violetMix = 0.26 + 0.24 * (0.5 + 0.5 * sin(cableId * 1.73));
  vec3 cableColor = mix(sideColor, uVioletColor, violetMix);
  vec3 color = cableColor * (core * 0.8 + halo * 0.24 * uGlow);
  color += mix(cableColor, uPulseColor, 0.68) * pulse * (core + halo * 0.52);

  // Keep the headline and CTAs quiet while allowing the tunnel to enter from
  // every edge and fade out before it becomes a hard circular frame.
  float centerQuiet = smoothstep(uFadeStart, uFadeStart + 0.34, radius);
  float outerFade = 1.0 - smoothstep(uFadeEnd, uFadeEnd + 0.42, radius);
  float verticalQuiet = mix(0.78, 1.0, smoothstep(0.08, 0.8, abs(uv.y)));
  float alpha = (core * 0.72 + halo * 0.3 + pulse * halo * 0.5) *
    centerQuiet * outerFade * verticalQuiet * uOpacity;

  // A soft depth haze connects the strands into one light field instead of a
  // collection of isolated rings.
  float haze = exp(-abs(radius - 0.92) * 3.7) * centerQuiet * outerFade;
  color += mix(uVioletColor, sideColor, horizontal) * haze * 0.08;
  alpha += haze * 0.035 * uOpacity;

  color *= uBrightness;
  color = color / (1.0 + color * 0.42);
  fragColor = vec4(color * alpha, clamp(alpha, 0.0, 0.92));
}`

// Brand color tokens. The values come from CSS custom properties
// defined in theme.css under `:root` (light) and `.dark` (dark).
// Reading the same tokens at runtime keeps the WebGL shader and the
// stylesheet on a single source of truth: change a token in
// theme.css and the shader picks it up automatically. The RGB
// triplets (space-separated, 0-1) are passed directly into the
// shader uniforms so the visible color matches the token exactly.
//
// The token name is part of the contract: a value change in
// theme.css must not silently lose its effect on the shader.
const BRAND_TOKEN_NAMES = [
  'vancine-light-tunnel-cool',
  'vancine-light-tunnel-violet',
  'vancine-light-tunnel-warm',
  'vancine-light-tunnel-pulse',
] as const
const BRAND_SCALAR_TOKENS = {
  opacity: 'vancine-light-tunnel-opacity',
  brightness: 'vancine-light-tunnel-brightness',
} as const

type Appearance = 'light' | 'dark'

type Uniform<T> = { value: T }

interface TunnelUniforms {
  uResolution: Uniform<Float32Array>
  uTime: Uniform<number>
  uSpeed: Uniform<number>
  uCableCount: Uniform<number>
  uCableWidth: Uniform<number>
  uGlow: Uniform<number>
  uOpacity: Uniform<number>
  uBrightness: Uniform<number>
  uFadeStart: Uniform<number>
  uFadeEnd: Uniform<number>
  uWaviness: Uniform<number>
  uSway: Uniform<number>
  uMouse: Uniform<Float32Array>
  uCoolColor: Uniform<Float32Array>
  uVioletColor: Uniform<Float32Array>
  uWarmColor: Uniform<Float32Array>
  uPulseColor: Uniform<Float32Array>
}

interface TunnelRuntime {
  uniforms: TunnelUniforms
  renderOnce: () => void
}

// parseTokenRgbTriplet turns a CSS custom-property value of the
// form "r g b" (whitespace-separated, 0-1 floats) into a
// [r, g, b] array. Returns null when the token is missing or
// malformed so the caller can fall back to the default palette.
function parseTokenRgbTriplet(value: string | null): [number, number, number] | null {
  if (!value) return null
  const parts = value.trim().split(/\s+/).map((p) => Number(p))
  if (parts.length !== 3) return null
  if (parts.some((n) => !Number.isFinite(n))) return null
  const [r, g, b] = parts as [number, number, number]
  if (r < 0 || r > 1 || g < 0 || g > 1 || b < 0 || b > 1) return null
  return [r, g, b]
}

// parseTokenScalar turns a single CSS custom-property value into
// a finite number. Returns null when the token is missing.
function parseTokenScalar(value: string | null): number | null {
  if (!value) return null
  const n = Number(value.trim())
  if (!Number.isFinite(n)) return null
  return n
}

// readBrandTokens pulls the brand palette and per-appearance
// scalars from the host's computed style. The host's data-
// appearance attribute scopes the dark vs. light lookup; computed
// CSS custom properties on the element resolve through the active
// cascade (`:root` vs `.dark`). This is the same source of truth
// the stylesheet reads, so the shader and the stylesheet cannot
// drift apart.
function readBrandTokens(host: HTMLElement, appearance: Appearance) {
  void appearance
  const style = getComputedStyle(host)
  const raw = BRAND_TOKEN_NAMES.map((name) =>
    parseTokenRgbTriplet(style.getPropertyValue(`--${name}-rgb`))
  )
  const [cool, violet, warm, pulse] = raw
  const opacity = parseTokenScalar(style.getPropertyValue(`--${BRAND_SCALAR_TOKENS.opacity}`))
  const brightness = parseTokenScalar(style.getPropertyValue(`--${BRAND_SCALAR_TOKENS.brightness}`))
  return { cool, violet, warm, pulse, opacity, brightness }
}

// DEFAULT_PALETTE mirrors the previous in-component constants. It
// is the fallback used only when the brand tokens cannot be
// resolved at runtime (no computed style, malformed token, or jsdom
// test environment). Keeping the values here means the visible
// result never depends on whether theme.css has finished loading
// before the WebGL uniform is initialized.
const DEFAULT_PALETTE = {
  light: {
    cool: [0.12, 0.42, 0.74] as [number, number, number],
    violet: [0.52, 0.25, 0.88] as [number, number, number],
    warm: [0.83, 0.19, 0.58] as [number, number, number],
    pulse: [0.94, 0.73, 1] as [number, number, number],
    opacity: 0.72,
    brightness: 0.82,
  },
  dark: {
    cool: [0.29, 0.68, 1] as [number, number, number],
    violet: [0.69, 0.39, 1] as [number, number, number],
    warm: [1, 0.35, 0.68] as [number, number, number],
    pulse: [0.91, 0.83, 1] as [number, number, number],
    opacity: 0.88,
    brightness: 1.12,
  },
} as const

// applyBrandTokens writes the appearance-specific brand palette into
// the WebGL uniforms. Brand tokens come from the host's computed
// style (see readBrandTokens); the per-appearance DEFAULT_PALETTE
// is the fallback when the host has not yet finished styling.
function applyBrandTokens(
  host: HTMLElement | null,
  uniforms: TunnelUniforms,
  appearance: Appearance
) {
  const fallback = DEFAULT_PALETTE[appearance]
  let cool: [number, number, number] = fallback.cool
  let violet: [number, number, number] = fallback.violet
  let warm: [number, number, number] = fallback.warm
  let pulse: [number, number, number] = fallback.pulse
  let opacity: number = fallback.opacity
  let brightness: number = fallback.brightness
  if (host) {
    const tokens = readBrandTokens(host, appearance)
    if (tokens.cool) cool = tokens.cool
    if (tokens.violet) violet = tokens.violet
    if (tokens.warm) warm = tokens.warm
    if (tokens.pulse) pulse = tokens.pulse
    if (tokens.opacity !== null) opacity = tokens.opacity
    if (tokens.brightness !== null) brightness = tokens.brightness
  }
  uniforms.uCoolColor.value.set(cool)
  uniforms.uVioletColor.value.set(violet)
  uniforms.uWarmColor.value.set(warm)
  uniforms.uPulseColor.value.set(pulse)
  uniforms.uOpacity.value = opacity
  uniforms.uBrightness.value = brightness
}

interface BrandLightTunnelProps {
  appearance: Appearance
  className?: string
}

/**
 * Decorative, full-hero Vancine light field.
 *
 * OGL is loaded only after mount so this non-critical background never blocks
 * the marketing page's initial React bundle. The CSS fallback remains visible
 * when WebGL2 is unavailable, and reduced-motion visitors receive one still
 * frame rather than a continuous render loop.
 */
export function BrandLightTunnel(props: BrandLightTunnelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<TunnelRuntime | null>(null)
  const appearanceRef = useRef(props.appearance)
  appearanceRef.current = props.appearance

  useEffect(() => {
    const runtime = runtimeRef.current
    if (!runtime) return
    applyBrandTokens(hostRef.current, runtime.uniforms, props.appearance)
    runtime.renderOnce()
  }, [props.appearance])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    // pageVisible reflects document.hidden; rendererVisible reflects
    // the host's intersection with the viewport. The RAF loop only
    // runs when BOTH are true, so the renderer is fully paused the
    // moment the hero leaves the screen or the user tabs away.
    let pageVisible = !document.hidden
    let rendererVisible = true
    let animationFrame = 0
    let lastTime = performance.now()
    let elapsed = 0
    let canvas: HTMLCanvasElement | null = null
    let gl: WebGL2RenderingContext | null = null
    let renderer: import('ogl').Renderer | null = null
    let resizeObserver: ResizeObserver | null = null
    let intersectionObserver: IntersectionObserver | null = null
    let removePointerListener: () => void = () => {}
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const targetMouse = new Float32Array([0, 0])
    const currentMouse = new Float32Array([0, 0])

    host.dataset.renderer = 'loading'

    // jsdom intentionally has no WebGL context. Keep unit and component tests
    // on the same deterministic CSS fallback that real unsupported browsers
    // use instead of letting OGL emit environment noise for every Home mount.
    if (navigator.userAgent.includes('jsdom')) {
      host.dataset.renderer = 'fallback'
      return
    }

    // cancelRaf / scheduleRaf guarantee the loop is fully cancelled
    // whenever the hero is hidden or off-screen, and only ONE fresh
    // RAF is scheduled when both signals become true again. There
    // is never a second concurrent loop: scheduleRaf is a no-op when
    // animationFrame is already non-zero.
    //
    // The animate callback is defined inside the OGL .then() below
    // (it needs the renderer + uniforms). We forward-declare the
    // binding here so scheduleRaf can always read the latest closure
    // and the reference error from the TDZ is avoided.
    let animate: ((now: number) => void) | null = null
    const cancelRaf = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
    }
    const scheduleRaf = () => {
      if (disposed) return
      // The reduce-motion gate lives in scheduleRaf so EVERY entry
      // point (initial mount, document.hidden reactivation,
      // IntersectionObserver reactivation) refuses to start a
      // continuous RAF for users who prefer reduced motion. The
      // static-frame path renders once and never re-renders, so
      // the loop must remain idle even when a visibility /
      // intersection callback fires.
      if (reduceMotion) return
      if (animationFrame) return // already running
      if (!pageVisible || !rendererVisible) return
      if (!animate) return // renderer not ready yet
      animationFrame = requestAnimationFrame(animate)
    }

    const onVisibilityChange = () => {
      pageVisible = !document.hidden
      lastTime = performance.now()
      if (!pageVisible) {
        cancelRaf()
      } else {
        scheduleRaf()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          rendererVisible = entry?.isIntersecting ?? true
          lastTime = performance.now()
          if (!rendererVisible) {
            cancelRaf()
          } else {
            scheduleRaf()
          }
        },
        { threshold: 0 }
      )
      intersectionObserver.observe(host)
    }

    void import('ogl')
      .then(({ Mesh, Program, Renderer, Triangle }) => {
        if (disposed) return

        try {
          const mobile = window.innerWidth < 768
          renderer = new Renderer({
            alpha: true,
            antialias: !mobile,
            depth: false,
            dpr: Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5),
            premultipliedAlpha: true,
            webgl: 2,
          })
          const liveRenderer = renderer
          const liveGl = liveRenderer.gl as WebGL2RenderingContext
          const liveCanvas = liveGl.canvas as HTMLCanvasElement
          liveCanvas.className = 'vancine-light-tunnel-canvas'
          liveCanvas.setAttribute('aria-hidden', 'true')
          liveGl.clearColor(0, 0, 0, 0)
          gl = liveGl
          canvas = liveCanvas

          const uniforms: TunnelUniforms = {
            uResolution: { value: new Float32Array([1, 1]) },
            uTime: { value: 0 },
            uSpeed: { value: 0.28 },
            uCableCount: { value: mobile ? 14 : 22 },
            uCableWidth: { value: mobile ? 0.036 : 0.028 },
            uGlow: { value: mobile ? 0.72 : 0.9 },
            uOpacity: { value: 0 },
            uBrightness: { value: 0 },
            uFadeStart: { value: mobile ? 0.32 : 0.38 },
            uFadeEnd: { value: mobile ? 1.42 : 1.72 },
            uWaviness: { value: mobile ? 0.045 : 0.07 },
            uSway: { value: mobile ? 0.025 : 0.05 },
            uMouse: { value: currentMouse },
            uCoolColor: { value: new Float32Array(3) },
            uVioletColor: { value: new Float32Array(3) },
            uWarmColor: { value: new Float32Array(3) },
            uPulseColor: { value: new Float32Array(3) },
          }
          applyBrandTokens(host, uniforms, appearanceRef.current)

          // The OGL classes accept a broader gl type than
          // WebGL2RenderingContext. Cast the local gl at the call
          // site so the .then() block can stay non-nullable.
          const oglGl = liveGl as unknown as import('ogl').OGLRenderingContext
          const geometry = new Triangle(oglGl)
          const program = new Program(oglGl, {
            vertex: VERTEX_SHADER,
            fragment: FRAGMENT_SHADER,
            uniforms,
            transparent: true,
            depthTest: false,
            depthWrite: false,
          })
          const mesh = new Mesh(oglGl, { geometry, program })

          const renderOnce = () => liveRenderer.render({ scene: mesh })
          runtimeRef.current = { uniforms, renderOnce }

          const resize = () => {
            const { width, height } = host.getBoundingClientRect()
            if (width <= 0 || height <= 0) return
            liveRenderer.setSize(width, height)
            uniforms.uResolution.value[0] = liveGl.drawingBufferWidth
            uniforms.uResolution.value[1] = liveGl.drawingBufferHeight
            renderOnce()
          }
          resizeObserver = new ResizeObserver(resize)
          resizeObserver.observe(host)
          resize()

          if (finePointer && !reduceMotion) {
            const onPointerMove = (event: PointerEvent) => {
              const bounds = host.getBoundingClientRect()
              if (bounds.width <= 0 || bounds.height <= 0) return
              targetMouse[0] =
                ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
              targetMouse[1] =
                (0.5 - (event.clientY - bounds.top) / bounds.height) * 2
            }
            window.addEventListener('pointermove', onPointerMove, {
              passive: true,
            })
            removePointerListener = () =>
              window.removeEventListener('pointermove', onPointerMove)
          }

          // The animate body only runs while the loop is active.
          // It clears `animationFrame` BEFORE rendering, so the next
          // frame must be re-scheduled by `scheduleRaf`. Reduced
          // motion never enters the loop: one still frame is
          // enough.
          animate = (now: number) => {
            if (disposed) return
            // Clear the handle so the next requestAnimationFrame is
            // a fresh schedule rather than a continuation of the
            // previous one. This is what stops a single hidden
            // tick from re-running the body without an explicit
            // gate.
            animationFrame = 0
            const delta = Math.min((now - lastTime) / 1000, 0.05)
            lastTime = now

            if (pageVisible && rendererVisible) {
              // Deliberately slower than wall time: the hero should feel like
              // ambient depth, not forward motion competing with the copy.
              elapsed += delta * 0.52
              uniforms.uTime.value = elapsed
              currentMouse[0] += (targetMouse[0] - currentMouse[0]) * 0.045
              currentMouse[1] += (targetMouse[1] - currentMouse[1]) * 0.045
              renderOnce()
            }
            // Always re-evaluate the gate. If either signal is
            // false, the loop simply stops until scheduleRaf is
            // called again by the visibility / intersection
            // callbacks.
            if (pageVisible && rendererVisible) {
              scheduleRaf()
            }
          }

          host.append(liveCanvas)
          host.dataset.renderer = 'ready'
          renderOnce()
          if (!reduceMotion) scheduleRaf()
        } catch {
          host.dataset.renderer = 'fallback'
        }
      })
      .catch(() => {
        if (!disposed) host.dataset.renderer = 'fallback'
      })

    return () => {
      disposed = true
      cancelRaf()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      removePointerListener()
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      runtimeRef.current = null
      canvas?.remove()
      // Tell the browser to drop the WebGL context so the GPU
      // resources are released as soon as the hero is unmounted.
      const loseContext = gl?.getExtension('WEBGL_lose_context')
      loseContext?.loseContext()
      renderer = null
      gl = null
    }
  }, [])

  return (
    <div
      ref={hostRef}
      aria-hidden='true'
      className={cn(
        'vancine-light-tunnel pointer-events-none',
        props.className
      )}
      data-appearance={props.appearance}
      data-renderer='loading'
      data-testid='brand-light-tunnel'
    >
      <span className='vancine-light-tunnel-fallback' />
      <span className='vancine-light-tunnel-vignette' />
    </div>
  )
}
