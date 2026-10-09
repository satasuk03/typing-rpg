/**
 * SpriteSource: where sprite frames come from.
 * The first implementation is the POC's procedural generators (ProceduralSpriteSource); Aseprite atlas
 * loaders implement the same interface later, so the world builder (T2.2) never cares which one it has.
 */

/** One drawable frame. Pixel art at 16 texels per world unit; the anchor (ax, ay) is the foot point. */
export interface SpriteFrame {
  /** Colour image (canvas or ImageBitmap) with alpha cut-out. */
  readonly img: TexImageSource & { readonly width: number; readonly height: number };
  /** Optional emissive layer (same size as `img`; glowing pixels only). */
  readonly glow?: TexImageSource | undefined;
  /** Optional authored normal map (same size as `img`). When absent one is derived from the alpha. */
  readonly normal?: TexImageSource | undefined;
  readonly w: number;
  readonly h: number;
  /** Anchor in texels, measured from the top-left of the image. */
  ax: number;
  ay: number;
  /** Strength of the derived normal-map bulge (1 = default). */
  readonly bulge?: number | undefined;
  /** For torch props: world-space Y offset of the flame attach point. */
  readonly flameY?: number | undefined;
  /** True for props that hang from a ceiling (anchor at the top). */
  readonly hang?: number | boolean | undefined;
}

export type BackdropKind = "sky" | "mountains" | "treeline";

export interface SpriteSource {
  readonly name: string;
  /** Whether `key` is known. */
  has(key: string): boolean;
  /** All known keys. */
  keys(): readonly string[];
  /**
   * Frames for a key. Props have one frame under the default animation; actors have named animations
   * (hero: idle/walk/raise/slash/cast/hurt/win; monsters: idle/atk; chest: closed/open).
   * Throws for an unknown key or animation.
   */
  frames(key: string, anim?: string): readonly SpriteFrame[];
  /** Wrapping far-backdrop strip (sky gradient, mountain ridges, tree line). */
  backdrop(kind: BackdropKind): HTMLCanvasElement;
  /** Release any decoded images. */
  dispose?(): void;
}

export const DEFAULT_ANIM = "idle";
