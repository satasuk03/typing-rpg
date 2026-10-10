/**
 * PrologueHud (P3.3): everything the prologue draws on the HUD canvas, above WebGL.
 *
 *  - Grimoire bar (N active orbs + passive chips) that replaces the 2-slot skill panel in prologue mode;
 *  - the theft shatter (cutscene `kitShatter`), `passivesDim`, centre captions, the ink line, `colourSwirl`,
 *    `shardsReturn` and the HUD half of `ember`;
 *  - the dialogue box (the `line` cue);
 *  - the polished skip ring and hint / nudge card (`showSkipRing`, `showNudge`, `showHint`);
 *  - the keep-out rects (plates, pops and world VFX stay clear of them) and a debug snapshot for the probes.
 *
 * It is mounted by `Hud.attachPrologue()`; the Hud calls `update`, `onEvent`, `frame`, `drawGrimoire` and `drawOverlay`.
 * Nothing here touches the sim. The prologue cutscene feeds it with `setCutscene(player.state)` once per frame.
 */
import type { LevelView, SimEvent } from "@hd2d/sim";
import type { CutsceneState } from "../../cutscene/types";
import type { Ctx } from "../draw";
import { clamp } from "../draw";
import type { Rect } from "../layout";
import type { HudSettings } from "../settings";
import { type DialogueLayout, drawDialogue, layoutDialogue, revealedChars } from "./dialogue";
import type { DialogueGeom, GrimoireGeom, P2 } from "./geometry";
import {
  cloakTrapezoid,
  DLG_KEEP_OUT_INFLATE,
  dialogueGeom,
  grimoireGeom,
  hintRect,
  inflateRect,
  inkRect,
  maskRect,
  rectsHit,
  ringRect,
} from "./geometry";
import { type ChipState, drawGrimoire, type OrbState, orbCentre } from "./grimoire";
import { drawCaption, drawInk, type InkLayout, measureInk } from "./ink";
import { drawHint, drawSkipRing, measureHint } from "./overlay";
import {
  DEFAULT_KIT,
  DEFAULT_PASSIVES,
  dialogueContrast,
  type SpeakerId,
  speakerContrast,
} from "./palette";
import { SHATTER_DONE_S } from "./shatter";
import { drawEmber, drawShardsReturn, drawSwirl } from "./swirl";

/** CSS-px anchor getters. P3.6 overrides these with the stage's exact projections; the Hud supplies projector fallbacks. */
export interface PrologueAnchorSource {
  /** Top-centre of Nul's sprite and the point under his feet. */
  nulHead?: () => P2 | null;
  nulFeet?: () => P2 | null;
  /** The knight's open hand (the ember and the landing shards). */
  hand?: () => P2 | null;
  /** Where the sky tear was (the shards start here). */
  tear?: () => P2 | null;
}

export interface PrologueDrawEnv {
  c: Ctx;
  W: number;
  H: number;
  /** Design to CSS scale. */
  s: number;
  time: number;
  settings: HudSettings;
  quality: 0 | 1 | 2;
  /** Projector-derived fallbacks (CSS px). */
  fallback: PrologueAnchorSource;
}

export interface PrologueDebug {
  active: boolean;
  /** CSS px. */
  grimoireRect: Rect | null;
  orbs: number;
  chips: number;
  dialogueRect: Rect | null;
  dialogue: {
    speaker: SpeakerId;
    lines: string[];
    fontPx: number;
    contrast: number;
    speakerContrast: number;
    alpha: number;
    shownChars: number;
    advanceHint: boolean;
  } | null;
  inkRect: Rect | null;
  captionText: string | null;
  hintRect: Rect | null;
  hintText: string | null;
  ringRect: Rect | null;
  maskRect: Rect | null;
  emberRect: Rect | null;
  swirlRect: Rect | null;
  shatter: { index: number; ageS: number }[];
}

export const FIGHT_HINT = "Type the words to fight!";
export const GUARD_HINT = "Red word: type it to block!";
export const GR_LINGER_S = 2.5;
export const GR_FADE_S = 1.0;
export const INK_HOLD_S = 1.2;
const INK_FADE_S = 0.6;
const MAX_ORBS = 8;

const ease = (t: number): number => t * t * (3 - 2 * t);

export class PrologueHud {
  /** Show "Type the words to fight!" / "Red word: type it to block!" by itself in Part B (set false when the timeline does it). */
  autoHints = true;

  private clock = 0;
  private src: PrologueAnchorSource = {};
  private cs: CutsceneState | null = null;
  private W = 1280;
  private H = 720;
  private s = 1;

  // ---- Grimoire / play state
  private skillIds: string[] = [...DEFAULT_KIT];
  private passiveIds: string[] = [...DEFAULT_PASSIVES];
  private nOrbs = DEFAULT_KIT.length;
  private armed = false;
  private wakeAt = -1;
  private readonly castFlash = new Float32Array(MAX_ORBS);
  private readonly chipFlash = new Map<string, number>();
  private readonly orbs: OrbState[] = [];
  private chips: ChipState[] = [];
  private slide = 0;
  private panelFadeV = 1;
  private dim = 0;
  private dimAt: number | null = null;
  private starter: string[] = ["fireball", "cleanCut"];
  private grimoireOn = false;

  // ---- cutscene state
  private readonly shatterAt = new Map<number, number>();
  private swirlOn = false;
  private swirlAt = -99;
  private swirlA = 0;
  private capText = "";
  private capA = 0;
  private capTarget = 0;
  private inkText = "";
  private inkShown = 0;
  private inkBirths: number[] = [];
  private inkDoneAt: number | null = null;
  private inkLay: InkLayout | null = null;
  private dlg: { speaker: SpeakerId; text: string; ageMs: number } | null = null;
  private dlgA = 0;
  private dlgLay: DialogueLayout | null = null;
  private shardsAge: number | null = null;
  private ember: { ageMs: number; closeAt: number } | null = null;

  // ---- skip ring / hint
  private ringProgress: number | null = null;
  private ringA = 0;
  private hint: { text: string; until: number; persistent: boolean } | null = null;
  private hintA = 0;
  private hintShownFight = false;
  private hintShownGuard = false;
  private hintLastText = "";

  // ---- per-frame layout (design px)
  private grGeom: GrimoireGeom | null = null;
  private grAlpha = 1;
  private dlgGeom: DialogueGeom = dialogueGeom(1280, 720);
  private inkR: Rect | null = null;
  private hintR: Rect | null = null;
  private ringR: Rect | null = null;
  private maskR: Rect | null = null;
  private emberP: P2 | null = null;
  private swirlTrap: ReturnType<typeof cloakTrapezoid> | null = null;

  // ------------------------------------------------------------------ public API (P3.5 / P3.6)

  /** Feed the cutscene state once per frame (Part A and C). `null` leaves cutscene mode. `jumped` = a seek or skip landed here. */
  setCutscene(s: CutsceneState | null, jumped = false): void {
    this.cs = s;
    if (!s) {
      // leaving the cutscene (or a replay starting): every cutscene-derived state goes, so the next run starts clean
      this.capTarget = 0;
      this.capA = 0;
      this.capText = "";
      this.dlg = null;
      this.dlgA = 0;
      this.shardsAge = null;
      this.ember = null;
      this.swirlOn = false;
      this.swirlA = 0;
      this.shatterAt.clear();
      this.dimAt = null;
      this.dim = 0;
      this.inkText = "";
      this.inkShown = 0;
      this.inkBirths = [];
      this.inkDoneAt = null;
      this.inkLay = null;
      this.slide = 0;
      this.panelFadeV = 1;
      return;
    }
    const h = s.hud;
    const past = this.clock - SHATTER_DONE_S - 1;
    for (const idx of h.kitShattered)
      if (!this.shatterAt.has(idx)) this.shatterAt.set(idx, jumped ? past : this.clock);
    if (h.colourSwirl && !this.swirlOn) this.swirlAt = jumped ? this.clock - 5 : this.clock;
    this.swirlOn = h.colourSwirl;
    if (h.passivesDim && this.dimAt === null) {
      this.dimAt = jumped ? this.clock - 10 : this.clock;
      if (jumped) this.dim = 1;
    }
    if (h.caption) {
      if (h.caption !== this.capText) this.capA = jumped ? 1 : this.capA;
      this.capText = h.caption;
      this.capTarget = 1;
    } else this.capTarget = 0;
    if (h.ink) {
      if (h.ink.text !== this.inkText) {
        this.inkText = h.ink.text;
        this.inkShown = 0;
        this.inkBirths = [];
        this.inkDoneAt = null;
      }
      const n = h.ink.shown.length;
      for (let i = this.inkShown; i < n; i++)
        this.inkBirths[i] = jumped ? this.clock - 5 : this.clock;
      this.inkShown = Math.max(this.inkShown, n);
      if (n >= h.ink.text.length && this.inkDoneAt === null)
        this.inkDoneAt = jumped ? this.clock - 99 : this.clock;
    }
    if (s.line) {
      this.dlg = { speaker: s.line.speaker, text: s.line.text, ageMs: s.line.ageMs };
      if (jumped) this.dlgA = 1;
    }
    this.shardsAge = h.shardsReturnAgeMs;
    const em = s.vfx.find((v) => v.id === "ember");
    this.ember = em
      ? { ageMs: em.ageMs, closeAt: Number(em.params?.closeAt ?? 3000) || 3000 }
      : null;
  }
  /** True while a cutscene state is being fed (Part A / C): the Hud hides plates and fades its panels. */
  hasCutscene(): boolean {
    return this.cs !== null;
  }

  /** Override the anchor getters (CSS px). */
  setAnchors(a: PrologueAnchorSource | null): void {
    this.src = a ?? {};
  }
  /** Icons of the starter kit that fall into the hand on `shardsReturn` (read from the bundle's starter kit). */
  setStarterKit(ids: readonly string[]): void {
    this.starter = ids.slice(0, 4);
  }

  /** The skip ring: `progress` 0..1 while Esc is held (0 = idle hint), `null` hides it. */
  showSkipRing(progress: number | null): void {
    this.ringProgress = progress === null ? null : clamp(progress, 0, 1);
  }
  /** A persistent nudge card ("Type any word to begin"); `null` or `hideNudge()` removes it. */
  showNudge(text: string | null): void {
    if (text === null) this.hideNudge();
    else this.hint = { text, until: Number.POSITIVE_INFINITY, persistent: true };
  }
  hideNudge(): void {
    if (this.hint?.persistent) this.hint = null;
  }
  /** A transient hint card (default 4 s). A newer hint replaces an older one; a nudge is replaced too. */
  showHint(text: string, ms = 4000): void {
    this.hint = { text, until: this.clock + ms / 1000, persistent: false };
  }
  hideHint(): void {
    this.hint = null;
  }

  /** Jump every local animation to its end state (stills, seeks): call right after `setCutscene`. */
  settle(): void {
    for (const [k] of this.shatterAt) this.shatterAt.set(k, this.clock - SHATTER_DONE_S - 1);
    if (this.swirlOn) this.swirlAt = this.clock - 5;
    this.castFlash.fill(0);
    this.chipFlash.clear();
    this.slide = this.cs ? 1 : 0;
    this.panelFadeV = this.cs ? 0 : 1;
    this.dim = this.dimAt !== null ? 1 : 0;
    this.capA = this.capTarget;
    this.dlgA = this.dlg ? 1 : 0;
    this.swirlA = this.swirlOn ? 1 : 0;
    this.hintA = this.hint ? 1 : 0;
    this.ringA = this.ringProgress === null ? 0 : 1;
    for (let i = 0; i < this.inkBirths.length; i++) this.inkBirths[i] = this.clock - 5;
  }
  /** Force the shatter animation of kit slot `index` to `ageS` seconds (stills of a mid-air crack or shard burst). */
  setShatterAge(index: number, ageS: number): void {
    this.shatterAt.set(index, this.clock - ageS);
  }
  /** Seconds the dialogue text has been revealing, for stills. */
  setDialogueAge(ms: number): void {
    if (this.dlg) this.dlg.ageMs = ms;
  }

  /** Fraction (1 = fully visible) of the Hud's panels and bars; they fade out over 300 ms when the cutscene starts. */
  panelFade(): number {
    return this.panelFadeV;
  }

  /** Back to a clean Part B (the run restarted). Cutscene state is untouched. */
  resetRun(): void {
    this.armed = false;
    this.wakeAt = -1;
    this.castFlash.fill(0);
    this.chipFlash.clear();
    this.hintShownFight = false;
    this.hintShownGuard = false;
    if (this.hint && !this.hint.persistent) this.hint = null;
  }

  // ------------------------------------------------------------------ Hud hooks

  update(dt: number, view: LevelView | null, W: number, H: number, s: number): void {
    this.clock += dt;
    this.W = W;
    this.H = H;
    this.s = s;
    const pv = view?.prologue;
    if (view && pv) {
      const sk = [...view.skills].sort((a, b) => a.slot - b.slot);
      if (sk.length > 0) {
        this.nOrbs = Math.min(MAX_ORBS, sk.length);
        this.skillIds = sk.map((x) => x.id);
      }
      if (view.passives.length > 0) this.passiveIds = [...view.passives];
      if (pv.armed && !this.armed) this.wakeAt = this.clock;
      this.armed = pv.armed;
      this.autoHint(view);
    }
    // orbs
    this.orbs.length = this.nOrbs;
    for (let i = 0; i < this.nOrbs; i++) {
      const sv = view?.skills.find((x) => x.slot === i);
      const at = this.shatterAt.get(i);
      let o = this.orbs[i];
      if (!o) {
        o = {
          id: "",
          charge: 0,
          ready: false,
          armed: false,
          castFlash: 0,
          shatterAge: null,
          wake: 1,
        };
        this.orbs[i] = o;
      }
      o.id = this.skillIds[i] ?? DEFAULT_KIT[i] ?? "fireball";
      o.charge = sv?.chargeFrac ?? 0;
      o.ready = sv?.ready ?? false;
      o.armed = this.armed;
      this.castFlash[i] = Math.max(0, (this.castFlash[i] ?? 0) - dt / 0.6);
      o.castFlash = this.castFlash[i] ?? 0;
      o.shatterAge = at === undefined ? null : this.clock - at;
      o.wake = this.wakeAt < 0 ? 1 : clamp((this.clock - this.wakeAt - i * 0.08) / 0.5, 0, 1);
    }
    // chips
    if (this.dimAt !== null) this.dim = clamp(this.dim + dt / 0.6, 0, 1);
    this.chips.length = this.passiveIds.length;
    for (let i = 0; i < this.passiveIds.length; i++) {
      const id = this.passiveIds[i] as string;
      const f = Math.max(0, (this.chipFlash.get(id) ?? 0) - dt / 0.6);
      if (f > 0) this.chipFlash.set(id, f);
      else this.chipFlash.delete(id);
      this.chips[i] = { id, flash: f, dim: this.dim };
    }
    // fades
    const cs = this.cs !== null;
    this.slide = clamp(this.slide + (cs ? dt / 0.7 : -dt / 0.7), 0, 1);
    this.panelFadeV = clamp(this.panelFadeV + (cs ? -dt / 0.3 : dt / 0.3), 0, 1);
    this.capA = clamp(this.capA + (this.capTarget > 0 ? dt / 0.8 : -dt / 0.8), 0, 1);
    this.dlgA = clamp(this.dlgA + (this.cs?.line ? dt / 0.15 : -dt / 0.2), 0, 1);
    if (this.dlgA <= 0) this.dlg = null;
    this.swirlA = clamp(this.swirlA + (this.swirlOn ? dt / 0.6 : -dt / 0.8), 0, 1);
    this.ringA = clamp(this.ringA + (this.ringProgress !== null ? dt / 0.15 : -dt / 0.2), 0, 1);
    const hintOn = this.hint !== null && this.clock < this.hint.until && this.dlgA < 0.05;
    this.hintA = clamp(this.hintA + (hintOn ? dt / 0.2 : -dt / 0.25), 0, 1);
    if (this.hint && !this.hint.persistent && this.clock >= this.hint.until && this.hintA <= 0)
      this.hint = null;
    if (this.hint) this.hintLastText = this.hint.text;
    // grimoire lingers a while after the passives dim, then leaves so the close-ups are clean
    this.grAlpha =
      this.dimAt === null
        ? 1
        : 1 - clamp((this.clock - this.dimAt - GR_LINGER_S) / GR_FADE_S, 0, 1);
  }

  onEvent(e: SimEvent): void {
    switch (e.type) {
      case "LevelStarted":
        this.resetRun();
        break;
      case "SkillCast":
        if (e.slot >= 0 && e.slot < MAX_ORBS) this.castFlash[e.slot] = 1;
        break;
      case "PassiveTriggered":
        this.chipFlash.set(e.passiveId, 1);
        break;
      case "CharCorrect":
        // the first key answers the "Type the words to fight!" card
        if (this.hint && !this.hint.persistent && this.hint.text === FIGHT_HINT)
          this.hint.until = Math.min(this.hint.until, this.clock + 0.8);
        break;
      default:
        break;
    }
  }

  private autoHint(view: LevelView): void {
    if (!this.autoHints || view.phase === "bossIntro") return;
    if (!this.hintShownFight && view.plates.length > 0) {
      this.hintShownFight = true;
      this.showHint(FIGHT_HINT, 4500);
    }
    if (!this.hintShownGuard && view.plates.some((p) => p.kind === "guard")) {
      this.hintShownGuard = true;
      this.showHint(GUARD_HINT, 5000);
    }
  }

  /** Compute this frame's rects (needs the context for text measures). Call once per draw, before `reserved`. */
  frame(env: PrologueDrawEnv, active: boolean, bossAlive: boolean): void {
    const { c, W, H } = env;
    this.dlgGeom = dialogueGeom(W, H);
    const grVisible = active && this.grAlpha > 0.02;
    this.grGeom = grVisible ? grimoireGeom(W, H, this.nOrbs, ease(this.slide)) : null;
    // the dialogue wins: while the bar is still sliding up (or on a tall/short viewport) it never overlaps the box
    if (
      this.grGeom &&
      this.dlg &&
      this.dlgA > 0.02 &&
      rectsHit(this.grGeom.rect, this.dlgGeom.rect)
    )
      this.grGeom = null;
    if (this.cs?.hud.ink || this.inkText) {
      if (!this.inkLay || this.inkLay.text !== this.inkText)
        this.inkLay = measureInk(c, this.inkText);
    }
    const inkA = this.inkAlpha();
    this.inkR = inkA > 0.02 && this.inkLay ? inkRect(W, H, this.inkLay.total) : null;
    const hintText = this.hint?.text ?? (this.hintA > 0 ? this.hintLastText : null);
    this.hintR = hintText && this.hintA > 0.02 ? hintRect(W, H, measureHint(c, hintText)) : null;
    this.ringR = this.ringA > 0.02 ? ringRect(W, H) : null;
    this.maskR = null;
    if (bossAlive) {
      const head = this.anchor(env, "nulHead");
      const feet = this.anchor(env, "nulFeet");
      if (head && feet) this.maskR = maskRect(head, feet);
    }
    if (this.dlg && this.dlgA > 0.02 && (!this.dlgLay || this.dlgLay.text !== this.dlg.text))
      this.dlgLay = layoutDialogue(c, this.dlg.text, this.dlgGeom);
  }

  /**
   * Whether the Grimoire bar is shown for this view: the view carries the prologue strip (Part B, and Part C while the
   * last view is still fed), or the cutscene forced it on with `showGrimoire(true)` (Part C without a view).
   */
  isActive(view: LevelView | null): boolean {
    return view?.prologue !== undefined || this.grimoireOn;
  }
  /** Force the Grimoire on or off for the cutscene parts (Part A: off; Part C: on). */
  showGrimoire(on: boolean): void {
    this.grimoireOn = on;
  }

  /** Design-px rects plates (and the layout solver) must keep clear of. */
  reserved(): Rect[] {
    const out: Rect[] = [];
    if (this.grGeom) out.push({ ...this.grGeom.rect });
    if (this.dlg && this.dlgA > 0.02) out.push({ ...this.dlgGeom.rect });
    if (this.inkR) out.push({ ...this.inkR });
    if (this.hintR) out.push({ ...this.hintR });
    if (this.ringR) out.push({ ...this.ringR });
    return out;
  }
  /** Extra obstacles for damage pops and tags: the reserved rects plus Nul's mask / face. */
  popObstacles(): Rect[] {
    const out = this.reserved();
    if (this.maskR) out.push(inflateRect(this.maskR, 6));
    return out;
  }
  /**
   * The rect world VFX must keep out of (design px; inflate by 24 px as art direction P2): the dialogue box and the ink
   * line. P3.6 hands these to `PrologueFx.keepOutRects`.
   */
  worldKeepOuts(W = this.W, H = this.H): Rect[] {
    const out: Rect[] = [inflateRect(dialogueGeom(W, H).rect, DLG_KEEP_OUT_INFLATE)];
    if (this.inkR) out.push(inflateRect(this.inkR, DLG_KEEP_OUT_INFLATE));
    return out;
  }
  /** CSS-px centre and radius of kit slot `i`'s orb (the typing FX / cast streaks aim here), or null when hidden. */
  orbAnchor(i: number): { x: number; y: number; r: number } | null {
    if (!this.grGeom) return null;
    const g = this.grGeom;
    const o = orbCentre(i);
    return {
      x: (g.rect.x + o.x * g.k) * this.s,
      y: (g.rect.y + o.y * g.k) * this.s,
      r: 26 * g.k * this.s,
    };
  }

  private anchor(env: PrologueDrawEnv, key: keyof PrologueAnchorSource): P2 | null {
    const p = (this.src[key] ?? env.fallback[key])?.() ?? null;
    return p ? { x: p.x / env.s, y: p.y / env.s } : null;
  }

  private inkAlpha(): number {
    if (!this.inkText || this.inkShown === 0) return 0;
    if (this.inkDoneAt === null) return 1;
    return 1 - clamp((this.clock - this.inkDoneAt - INK_HOLD_S) / INK_FADE_S, 0, 1);
  }

  // ------------------------------------------------------------------ drawing (design-px transform set by the Hud)

  drawGrimoire(env: PrologueDrawEnv, fade: number): void {
    if (!this.grGeom) return;
    drawGrimoire(env.c, this.grGeom, this.orbs, this.chips, {
      time: env.time,
      intensity: env.settings.effectsIntensity,
      reducedFlash: env.settings.reducedFlash,
      reducedMotion: env.settings.reducedMotion,
      alpha: this.grAlpha * fade,
    });
  }

  /** Everything else, last: swirl, shards, ember, caption, ink, hint, ring, then the dialogue (nothing is drawn after it). */
  drawOverlay(env: PrologueDrawEnv): void {
    const { c, W, H, settings } = env;
    const rm = settings.reducedMotion;
    this.swirlTrap = null;
    this.emberP = null;
    // ---- stolen colours inside the cloak
    if (this.swirlA > 0.02) {
      const head = this.anchor(env, "nulHead");
      const feet = this.anchor(env, "nulFeet");
      if (head && feet) {
        this.swirlTrap = cloakTrapezoid(head, feet);
        drawSwirl(
          c,
          this.swirlTrap,
          env.time,
          this.clock - this.swirlAt,
          this.swirlA * settings.effectsIntensity,
          env.quality,
          rm,
        );
      }
    }
    // ---- shards and ember (below the dialogue in z-order)
    const hand = this.anchor(env, "hand");
    if (this.shardsAge !== null && hand) {
      const tear = this.anchor(env, "tear") ?? { x: W * 0.5, y: -10 };
      drawShardsReturn(c, this.starter, this.shardsAge, tear, hand, 1, rm);
    }
    if (this.ember && hand) {
      this.emberP = hand;
      drawEmber(c, hand, this.ember.ageMs, this.ember.closeAt, env.time, 1, rm);
    }
    // ---- caption and ink line
    if (this.capA > 0.01) drawCaption(c, W, H, this.capText, ease(this.capA));
    const ia = this.inkAlpha();
    if (ia > 0.02 && this.inkLay && this.inkR)
      drawInk(
        c,
        this.inkLay,
        W / 2,
        this.inkR.y + this.inkR.h * 0.82,
        this.inkShown,
        this.inkBirths,
        this.clock,
        ia,
        settings.effectsIntensity,
        rm,
      );
    // ---- hint card and skip ring
    if (this.hintR) {
      const text = this.hint?.text ?? this.hintLastText;
      drawHint(c, this.hintR, text, this.hintA, ease(this.hintA), env.time, rm);
    }
    if (this.ringR)
      drawSkipRing(
        c,
        this.ringR,
        this.ringProgress ?? 0,
        this.ringA,
        env.time,
        settings.reducedFlash,
      );
    // ---- the dialogue box, last
    if (this.dlg && this.dlgLay && this.dlgA > 0.01)
      drawDialogue(c, this.dlgGeom, {
        speaker: this.dlg.speaker,
        layout: this.dlgLay,
        ageMs: this.dlg.ageMs,
        alpha: ease(this.dlgA),
        time: env.time,
        reducedMotion: rm,
      });
  }

  /** The debug snapshot (CSS px). */
  debug(view: LevelView | null): PrologueDebug {
    const s = this.s;
    const css = (r: Rect | null): Rect | null =>
      r ? { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s } : null;
    const dl = this.dlg && this.dlgA > 0.02 && this.dlgLay ? this.dlgLay : null;
    const emberR = this.emberP
      ? { x: this.emberP.x - 26, y: this.emberP.y - 26, w: 52, h: 52 }
      : null;
    const st = this.swirlTrap;
    const swirlR = st
      ? {
          x: Math.min(...st.pts.map((p) => p.x)),
          y: Math.min(...st.pts.map((p) => p.y)),
          w: Math.max(...st.pts.map((p) => p.x)) - Math.min(...st.pts.map((p) => p.x)),
          h: Math.max(...st.pts.map((p) => p.y)) - Math.min(...st.pts.map((p) => p.y)),
        }
      : null;
    return {
      active: this.isActive(view),
      grimoireRect: css(this.grGeom?.rect ?? null),
      orbs: this.nOrbs,
      chips: this.passiveIds.length,
      dialogueRect: dl ? css(this.dlgGeom.rect) : null,
      dialogue:
        dl && this.dlg
          ? {
              speaker: this.dlg.speaker,
              lines: [...dl.lines],
              fontPx: dl.fontPx,
              contrast: dialogueContrast(),
              speakerContrast: speakerContrast(this.dlg.speaker),
              alpha: this.dlgA,
              shownChars: revealedChars(dl.text.length, this.dlg.ageMs, false),
              advanceHint: this.dlg.ageMs > 900,
            }
          : null,
      inkRect: css(this.inkR),
      captionText: this.capA > 0.02 ? this.capText : null,
      hintRect: css(this.hintR),
      hintText: this.hintR ? (this.hint?.text ?? this.hintLastText) : null,
      ringRect: css(this.ringR),
      maskRect: css(this.maskR),
      emberRect: css(emberR),
      swirlRect: css(swirlR),
      shatter: [...this.shatterAt].map(([index, at]) => ({ index, ageS: this.clock - at })),
    };
  }
}
