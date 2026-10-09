import { LinearSRGBColorSpace, NoToneMapping, WebGLRenderer } from "three";

export interface RendererHooks {
  /** The GL context was lost (the default action is prevented so the browser may restore it). */
  onContextLost?: () => void;
  /** The context came back. three.js re-uploads resources lazily; the owner should re-apply sizes. */
  onContextRestored?: () => void;
}

export interface RendererHandle {
  renderer: WebGLRenderer;
  /** True when float/half-float colour attachments are available (HDR post chain). */
  hdr: boolean;
  dispose(): void;
}

/**
 * WebGL2 renderer setup. Colour management is done by the post chain: scene passes render linear HDR
 * into half-float targets (`outputColorSpace = Linear`, no built-in tone mapping), and the final pass
 * applies ACES filmic tone mapping, the colour grade and the linear -> sRGB conversion.
 * Throws if WebGL2 is unavailable.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  hooks: RendererHooks = {},
): RendererHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
    preserveDrawingBuffer: false,
  });
  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new Error("WebGL2 is required");
  }
  renderer.autoClear = false;
  renderer.setPixelRatio(1); // output size is computed by the caller (see computeOutputSize)
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping; // ACES lives in the final post pass

  const lost = (e: Event): void => {
    e.preventDefault();
    hooks.onContextLost?.();
  };
  const restored = (): void => hooks.onContextRestored?.();
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);

  const hdr =
    renderer.extensions.has("EXT_color_buffer_float") ||
    renderer.extensions.has("EXT_color_buffer_half_float");
  return {
    renderer,
    hdr,
    dispose() {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      renderer.dispose();
    },
  };
}

/**
 * Drawing-buffer size for a canvas of `cssW x cssH` CSS pixels: DPR is capped by the quality tier and the
 * width by `maxWidth` (the POC caps at 1920) while keeping the aspect ratio. Pure.
 */
export function computeOutputSize(
  cssW: number,
  cssH: number,
  dpr: number,
  maxDpr: number,
  maxWidth = 1920,
): { w: number; h: number } {
  const ratio = Math.max(0.5, Math.min(dpr || 1, maxDpr));
  let w = Math.max(64, Math.round(cssW * ratio));
  let h = Math.max(36, Math.round(cssH * ratio));
  if (w > maxWidth) {
    h = Math.round((h * maxWidth) / w);
    w = maxWidth;
  }
  return { w, h };
}
