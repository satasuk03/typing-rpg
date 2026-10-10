/**
 * DEV-ONLY prologue HUD scene (P3.3): `?scene=prologue&part=hud[&wpm=90][&quality=0][&intensity=1][&render=0|1]`.
 *
 * The real prologue session does not exist yet (P3.5), so this is the `fxProbe` / P3.2 `partB` pattern on the pieces that do:
 * the real Hud with the mock sim driver (a wpm bot at the pinned tier-4 streak, guard words on), the real typing VFX handle, the
 * Word Gate world (Nul's sprite stands in for the golem), a patched `view` that carries what the prologue sim will give
 * (N = 6 kit skills charging and casting round robin, the 9 passives, `view.prologue`), and the real cutscene `evaluate()` for
 * the Part C HUD cues. `window.__prologueHud`:
 *   sweep(seconds, everySec)   Part B readability sweep: HUD invariants + prologue invariants + next-letter ring / cell contrast
 *                              + a Part C overlap phase (dialogue up while pops are alive)
 *   lines()                    each plan line fully revealed: wrap <= 2 lines, contrast >= 7, nothing over it
 *   still(name)                set up a still (see STILLS); the page is then a screenshot
 *   bench(frames)              per-frame Hud cost with and without the prologue mounted
 */
import type { LevelView, SimEvent } from "@hd2d/sim";
import { evaluate } from "../../cutscene/timeline";
import type { Cue, CutsceneState, Timeline } from "../../cutscene/types";
import { makeWorldBackdrop, type WorldBackdrop } from "../../dev/hudTestScene";
import { blendMood, STORM_GOLD, THEFT_RAMP, UNWRITTEN } from "../../render/biomes";
import type { CameraPose } from "../../render/camera";
import { createTypingFx, type TypingFxHandle } from "../../render/vfx/TypingFxHandle";
import { loadLevel } from "../../render/world";
import { loadHudFonts } from "../fonts";
import { Hud } from "../hud";
import { checkSnapshot } from "../invariants";
import { MockDriver } from "../mock/mockDriver";
import { checkPrologueSnapshot } from "./check";
import { NUL_HEIGHT_M } from "./geometry";
import { DEFAULT_KIT, DEFAULT_PASSIVES } from "./palette";

const DT = 1 / 60;

/** The Part C HUD cues and lines of plan §2, as the real cutscene `evaluate()` consumes them. */
const CUES: Cue[] = [
  { at: 1500, kind: "line", speaker: "nul", text: "Enough." },
  { at: 4500, kind: "line", speaker: "nul", text: "Your words are bright, little knight." },
  { at: 7500, kind: "line", speaker: "knight", text: "Your Silence ends here!" },
  { at: 10500, kind: "hud", cue: { id: "ink", text: "I unwrite you.", charMs: 110 } },
  ...[0, 1, 2, 3, 4, 5].map(
    (k): Cue => ({ at: 13000 + 1100 * k, kind: "hud", cue: { id: "kitShatter", index: k } }),
  ),
  { at: 19900, kind: "hud", cue: { id: "passivesDim" } },
  { at: 23000, kind: "hud", cue: { id: "colourSwirl", on: true } },
  { at: 23000, kind: "line", speaker: "nul", text: "Now the world will be quiet." },
  { at: 26500, kind: "line", speaker: "nul", text: "No more stories. No more words." },
  { at: 31000, kind: "hud", cue: { id: "colourSwirl", on: false } },
  { at: 37000, kind: "line", speaker: "knight", text: "My words... are gone." },
  { at: 39000, kind: "hud", cue: { id: "shardsReturn" } },
  { at: 41000, kind: "vfx", id: "ember", dur: 7000, params: { closeAt: 3000 } },
  { at: 44000, kind: "line", speaker: "knight", text: "No. One spark is left." },
  { at: 47000, kind: "hud", cue: { id: "caption", text: "Find your words again." }, dur: 4000 },
  { at: 53000, kind: "end" },
];
const TL: Timeline = { id: "prologue.unwriting", durationMs: 55000, setup: "continue", cues: CUES };
const LINE_AT = CUES.filter((c) => c.kind === "line").map((c) => c.at);

export interface StillSpec {
  /** Cutscene time (ms) to play to, from `from` in 50 ms steps (natural animation ages). null = Part B. */
  t: number | null;
  from?: number;
  lineClock?: number;
  cam: "battle" | "two" | "mask" | "knight" | "nul" | "ember";
  /** Mood blend toward UNWRITTEN. */
  blend: number;
  note: string;
}
export const STILLS: Readonly<Record<string, StillSpec>> = {
  grimoireB: {
    t: null,
    cam: "battle",
    blend: 0,
    note: "Part B: the Grimoire bar, 6 orbs + 9 passives",
  },
  shatter1: {
    t: 13700,
    from: 12800,
    cam: "two",
    blend: THEFT_RAMP[1],
    note: "theft beat 1: Fireball shards in flight",
  },
  shatter3: {
    t: 15900,
    from: 12800,
    cam: "two",
    blend: THEFT_RAMP[3],
    note: "theft beat 3: Slash Wave shards",
  },
  shatter6: {
    t: 18900,
    from: 12800,
    cam: "two",
    blend: THEFT_RAMP[6],
    note: "theft beat 6: Frost Lock shards",
  },
  dialogueNul: {
    t: 4500,
    lineClock: 1700,
    cam: "mask",
    blend: 0,
    note: "Nul speaking (2-line wrap)",
  },
  dialogueKnight: {
    t: 7500,
    lineClock: 1500,
    cam: "knight",
    blend: 0,
    note: "the Knight speaking",
  },
  ink: { t: 11700, from: 10400, cam: "two", blend: 0, note: "the ink line mid-write" },
  swirl: {
    t: 23000,
    from: 22700,
    lineClock: 1700,
    cam: "nul",
    blend: 1,
    note: "colourSwirl in Nul's cloak, with the 23.0 s line",
  },
  ember: { t: 42800, from: 38800, cam: "ember", blend: 1, note: "the HUD ember in the hand" },
  skipRing: { t: null, cam: "battle", blend: 0, note: "the skip ring at 62%" },
  nudge: { t: null, cam: "battle", blend: 0, note: "the idle nudge card" },
};

declare global {
  interface Window {
    __prologueHud?: {
      ready: boolean;
      hud: Hud;
      sweep(seconds: number, everySec: number): SweepResult;
      lines(): LineResult[];
      still(name: string): string;
      bench(frames: number): { withMs: number; withoutMs: number; deltaMs: number; frames: number };
      snapshot(): ReturnType<Hud["debugSnapshot"]>;
      consoleErrors: string[];
    };
  }
}
interface SweepResult {
  samples: number;
  partB: number;
  overlap: number;
  violations: string[];
  minRing: number;
  minCell: number;
  contrastChecked: number;
  maxPops: number;
  popsNearMask: number;
  keepOutMax: { panel: number; label: number; next: number };
  events: Record<string, number>;
}
interface LineResult {
  t: number;
  speaker: string;
  text: string;
  lines: string[];
  contrast: number;
  speakerContrast: number;
  violations: string[];
}

export function startPrologueHud(glCanvas: HTMLCanvasElement, q: URLSearchParams): void {
  const wpm = Number(q.get("wpm") ?? 90) || 90;
  const quality = Math.max(0, Math.min(2, Number(q.get("quality") ?? 0) || 0)) as 0 | 1 | 2;
  const intensity = q.has("intensity") ? Number(q.get("intensity")) : 1;
  const renderWorld = q.get("render") !== "0";
  const consoleErrors: string[] = [];
  window.addEventListener("error", (e) => consoleErrors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => consoleErrors.push(String(e.reason)));
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    origErr(...args);
  };

  const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;
  const hud = new Hud(hudCanvas);
  const settings = {
    effectsIntensity: intensity,
    reducedFlash: q.get("reducedFlash") === "1",
    reducedMotion: q.get("reducedMotion") === "1",
  };
  hud.setSettings(settings);
  hud.setQuality(quality);
  const pro = hud.attachPrologue();
  pro.autoHints = true;
  let bd: WorldBackdrop | null = null;
  let fx: TypingFxHandle | null = null;
  const resize = (): void =>
    hud.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  window.addEventListener("resize", resize);
  resize();

  const driver = new MockDriver({
    scenario: "boss",
    wpm,
    seed: Number(q.get("seed") ?? 7) || 7,
    tier: 4,
    pace: 40,
    mode: "gentle",
    typoAt: [],
    guard: true,
    script: true,
  });
  const counts: Record<string, number> = {};
  let castN = 0;
  let passN = 0;
  /** The mock view with what the prologue sim gives: N = 6 kit skills charging / casting, 9 passives, the prologue strip. */
  const pview = (): LevelView => {
    const t = driver.tick / 60;
    const skills = DEFAULT_KIT.map((id, i) => {
      const ph = (t * 0.22 + i * 0.19) % 1;
      const ready = ph > 0.9;
      return {
        slot: i,
        id,
        chargeFrac: ready ? 1 : ph / 0.9,
        ready,
        mode: "smart" as const,
      };
    });
    return {
      ...driver.view,
      skills,
      passives: [...DEFAULT_PASSIVES],
      prologue: { surgeMult: 16, bossClamped: true, armed: t > 0.5 },
    } as unknown as LevelView;
  };
  const feed = (ev: readonly SimEvent[]): void => {
    for (const e of ev) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (!fx || fx.onEvent(e)) hud.pushEvent(e);
    }
  };
  /** One kit cast every 1.5 s (round robin) and a passive trigger every 0.7 s, as the sim's cast gap gives. */
  const synthEvents = (): SimEvent[] => {
    const out: SimEvent[] = [];
    const tick = driver.tick;
    if (tick > 0 && tick % 90 === 0) {
      const slot = castN++ % 6;
      out.push({
        type: "SkillCast",
        tick,
        slot,
        skillId: DEFAULT_KIT[slot],
        targetIds: [],
        impactTick: tick + 20,
      } as unknown as SimEvent);
    }
    if (tick > 0 && tick % 42 === 0) {
      out.push({
        type: "PassiveTriggered",
        tick,
        passiveId: DEFAULT_PASSIVES[passN++ % 9],
        targetId: null,
      } as unknown as SimEvent);
    }
    return out;
  };

  let cs: CutsceneState | null = null;
  const csState = (t: number, lc = -1): CutsceneState => evaluate(TL, t, lc);
  const tick = (): void => {
    feed(driver.step());
    for (const e of synthEvents()) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      hud.pushEvent(e);
    }
    const v = pview();
    const wdt = fx ? fx.update(DT, DT, v) : DT;
    bd?.advance(wdt);
    if (cs) pro.setCutscene(cs);
    hud.render(v, 1, DT);
  };
  const present = (): void => {
    if (renderWorld) {
      bd?.world.render();
    }
    hud.render(pview(), 1, 0);
  };

  // ---------------------------------------------------------------- next-letter contrast (the fxProbe measure)
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const nextLetterContrast = (): { ring: number; cell: number } | null => {
    const view = driver.view;
    const plate = view.plates.find((p) => p.id === view.targetPlateId);
    if (!plate || plate.typedIndex >= plate.text.length || plate.text[plate.typedIndex] === " ")
      return null;
    const r = hud.getLetterRect(plate.id, plate.typedIndex);
    if (!r) return null;
    const ctx = hudCanvas.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    const k = hudCanvas.width / window.innerWidth;
    const x = Math.max(0, Math.floor(r.x * k));
    const y = Math.max(0, Math.floor(r.y * k));
    const w = Math.max(1, Math.min(hudCanvas.width - x, Math.ceil(r.w * k)));
    const h = Math.max(10, Math.min(hudCanvas.height - y, Math.ceil(r.h * k) - 5));
    const d = ctx.getImageData(x, y, w, h).data;
    const luma = new Float32Array(w * h);
    const rel = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const a = (d[i * 4 + 3] as number) / 255;
      const R = (d[i * 4] as number) * a;
      const G = (d[i * 4 + 1] as number) * a;
      const B = (d[i * 4 + 2] as number) * a;
      luma[i] = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
      rel[i] = 0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B);
    }
    const sorted = Array.from(luma).sort((a, b) => a - b);
    const peak = Math.max(0.3, sorted[Math.floor(sorted.length * 0.95)] ?? 1);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = (luma[i] as number) > 0.8 * peak ? 1 : 0;
    const at = (x2: number, y2: number): number =>
      x2 >= 0 && y2 >= 0 && x2 < w && y2 < h ? (mask[y2 * w + x2] as number) : 0;
    const near = (x2: number, y2: number, rr: number): boolean => {
      for (let oy = -rr; oy <= rr; oy++)
        for (let ox = -rr; ox <= rr; ox++) if (at(x2 + ox, y2 + oy)) return true;
      return false;
    };
    let g = 0;
    let cg = 0;
    let nRing = 0;
    let cRing = 0;
    let nCell = 0;
    let cCell = 0;
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const i = yy * w + xx;
        if (mask[i]) {
          let inner = true;
          for (let oy = -1; oy <= 1 && inner; oy++)
            for (let ox = -1; ox <= 1; ox++) if (!at(xx + ox, yy + oy)) inner = false;
          if (inner) {
            g += rel[i] as number;
            cg++;
          }
        } else {
          nCell += rel[i] as number;
          cCell++;
          if (near(xx, yy, 2)) {
            nRing += rel[i] as number;
            cRing++;
          }
        }
      }
    if (cg === 0 || cCell === 0) return null;
    const lg = g / cg;
    const ratio = (a: number, b: number): number =>
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return { ring: ratio(lg, cRing ? nRing / cRing : 0), cell: ratio(lg, nCell / cCell) };
  };

  // ---------------------------------------------------------------- stage helpers
  const proj = (x: number, y: number, z: number): { x: number; y: number } =>
    (bd as WorldBackdrop).project(x, y, z);
  let nul = { x: 0, z: 0 };
  const poses = (): Record<StillSpec["cam"], CameraPose> => {
    const hx = (bd as WorldBackdrop).hero.x;
    const mid = (hx + nul.x) / 2;
    return {
      battle: { ...(bd as WorldBackdrop).world.camera.pose },
      two: { x: mid + 0.7, y: 2.4, dist: 22, pitch: 12, fov: 30 },
      mask: { x: nul.x + 0.4, y: 3.4, dist: 18, pitch: 7, fov: 19 },
      knight: { x: hx + 0.3, y: 1.1, dist: 14, pitch: 5, fov: 24 },
      nul: { x: nul.x + 0.2, y: 2.6, dist: 15, pitch: 8, fov: 22 },
      ember: { x: hx, y: 0.9, dist: 12, pitch: 4, fov: 20 },
    };
  };
  let battlePose: CameraPose | null = null;
  const setCam = (name: StillSpec["cam"]): void => {
    if (!bd) return;
    const p = name === "battle" && battlePose ? battlePose : poses()[name];
    bd.world.camera.setTarget(p);
    bd.world.camera.snap();
  };

  const boot = async (): Promise<void> => {
    await loadHudFonts();
    const qb = new URLSearchParams(q);
    qb.set("id", "prologue");
    qb.set("pose", "battle");
    bd = await makeWorldBackdrop(glCanvas, "boss", qb);
    const b = bd;
    battlePose = { ...b.world.camera.pose };
    // Nul stands where the golem stands, at his real height; the HUD projects his anchors to match (head 4.56 m)
    const tmp = { x: 0, y: 0, z: 0 };
    b.slotBody(0, tmp);
    nul = { x: tmp.x, z: tmp.z };
    const gol = b.slotActor(0);
    try {
      const a = b.world.addActor("monster.nul", "idle", { scale: 1, rim: 1.4, blobW: 1.1 });
      const f = b.world.source.frames("monster.nul", "idle")[0];
      if (f) a.setFrame(f);
      a.place(nul.x, 0, nul.z);
      b.world.shadowFor(a, nul.x, nul.z);
      if (gol) gol.visible = false;
    } catch {
      // the golem stays as the stand-in
    }
    const baseProj = b.projector;
    hud.setProjector((a) => {
      if (a.kind === "enemy" && a.slot === 0) {
        const y = a.part === "head" ? NUL_HEIGHT_M : a.part === "feet" ? 0 : NUL_HEIGHT_M / 2;
        return proj(nul.x, y, nul.z);
      }
      return baseProj(a);
    });
    const layout = loadLevel("prologue");
    const tearA = layout.anchors.find((a) => a.name === "tear");
    pro.setAnchors({
      nulHead: () => proj(nul.x, NUL_HEIGHT_M, nul.z),
      nulFeet: () => proj(nul.x, 0, nul.z),
      hand: () => proj(b.hero.x + 0.32, 0.85, b.hero.z),
      tear: () => proj(tearA?.x ?? nul.x, tearA?.y ?? 7, tearA?.z ?? nul.z),
    });
    fx = createTypingFx({
      hud,
      world: b.world,
      seed: 7,
      quality,
      anchors: {
        hero(out) {
          out.x = b.hero.x;
          out.z = b.hero.z;
        },
        enemy(id, out) {
          const e = driver.view.enemies.find((x) => x.id === id);
          if (!e || !b.slotBody(e.slot, tmp)) return false;
          out.x = tmp.x;
          out.y = tmp.y;
          out.z = tmp.z;
          return true;
        },
      },
      callbacks: {
        actorFlash(who, amount, rgb) {
          if (who === "hero") b.hero.actor.setRimFlash(amount, rgb);
        },
      },
      onPresent: (e) => hud.pushEvent(e),
    });
    fx.setSettings(settings);
    feed(driver.start());
    for (let i = 0; i < 150; i++) tick();
    present();

    // ------------------------------------------------------------ the API
    const violationsNow = (label: string): string[] =>
      [...checkSnapshot(hud.debugSnapshot()), ...checkPrologueSnapshot(hud.debugSnapshot())].map(
        (v) => `${label} ${v}`,
      );

    window.__prologueHud = {
      ready: true,
      hud,
      consoleErrors,
      snapshot: () => hud.debugSnapshot(),
      sweep(seconds, everySec) {
        const every = Math.max(1, Math.round(everySec * 60));
        const n = Math.round(seconds * 60);
        const violations: string[] = [];
        let samples = 0;
        let partB = 0;
        let overlap = 0;
        let minRing = 99;
        let minCell = 99;
        let checked = 0;
        let maxPops = 0;
        let popsNearMask = 0;
        const ko = { panel: 0, label: 0, next: 0 };
        const partBTicks = Math.round(n * 0.65);
        for (let i = 0; i < n; i++) {
          if (i === partBTicks) {
            // the climax: the cutscene takes over while pops from the last hits are still alive
            pro.showGrimoire(true);
          }
          if (i >= partBTicks) {
            // Part C overlap phase: a plan line is up (rotating every 1.2 s), the ink line plays, plates are gone
            const k = Math.floor((i - partBTicks) / 72);
            const at = LINE_AT[k % LINE_AT.length] as number;
            cs = csState(at, 1800);
          }
          tick();
          if (i % every !== 0) continue;
          present();
          const snap = hud.debugSnapshot();
          samples++;
          maxPops = Math.max(maxPops, snap.pops);
          if (snap.fxKeepOut) {
            ko.panel = Math.max(ko.panel, snap.fxKeepOut.panel);
            ko.label = Math.max(ko.label, snap.fxKeepOut.label);
            ko.next = Math.max(ko.next, snap.fxKeepOut.next);
          }
          const mk = snap.prologue?.maskRect;
          if (mk)
            for (const r of snap.popRects)
              if (
                Math.hypot(r.x + r.w / 2 - (mk.x + mk.w / 2), r.y + r.h / 2 - (mk.y + mk.h / 2)) <
                220
              )
                popsNearMask++;
          const tag = `t=${(driver.tick / 60).toFixed(2)}s`;
          violations.push(...violationsNow(tag));
          if (i < partBTicks) {
            partB++;
            const c = nextLetterContrast();
            if (c) {
              checked++;
              minRing = Math.min(minRing, c.ring);
              minCell = Math.min(minCell, c.cell);
              if (c.ring < 3 || c.cell < 4.5)
                violations.push(
                  `${tag} next-letter contrast ring ${c.ring.toFixed(2)} cell ${c.cell.toFixed(2)}`,
                );
            }
          } else overlap++;
        }
        cs = null;
        pro.setCutscene(null);
        pro.showGrimoire(false);
        return {
          samples,
          partB,
          overlap,
          violations,
          minRing,
          minCell,
          contrastChecked: checked,
          maxPops,
          popsNearMask,
          keepOutMax: ko,
          events: { ...counts },
        };
      },
      lines() {
        const res: LineResult[] = [];
        pro.showGrimoire(true);
        for (const c of CUES) {
          if (c.kind !== "line") continue;
          cs = csState(c.at, 2400);
          pro.setCutscene(cs, true);
          pro.settle();
          for (let i = 0; i < 40; i++) tick();
          present();
          const snap = hud.debugSnapshot();
          const d = snap.prologue?.dialogue;
          res.push({
            t: c.at,
            speaker: c.speaker,
            text: c.text,
            lines: d?.lines ?? [],
            contrast: d?.contrast ?? 0,
            speakerContrast: d?.speakerContrast ?? 0,
            violations: violationsNow(`line ${c.at}`),
          });
        }
        cs = null;
        pro.setCutscene(null);
        pro.showGrimoire(false);
        return res;
      },
      still(name) {
        const sp = STILLS[name];
        if (!sp) throw new Error(`unknown still ${name}`);
        const bdr = bd as WorldBackdrop;
        setCam(sp.cam);
        bdr.world.setMood(blendMood(STORM_GOLD, UNWRITTEN, sp.blend), "ruins");
        hud.reset();
        pro.setCutscene(null);
        // Part C stills: only the knight and Nul stand (the adds from the Part B mock are hidden)
        for (const i of [1, 2]) {
          const a = bdr.slotActor(i);
          if (a) a.visible = sp.t === null;
        }
        if (sp.t === null) {
          cs = null;
          pro.setCutscene(null);
          pro.showGrimoire(false);
          for (let i = 0; i < 520; i++) tick();
          if (name === "skipRing") pro.showSkipRing(0.62);
          if (name === "nudge") pro.showNudge("Type any word to begin");
          for (let i = 0; i < 20; i++) tick();
        } else {
          pro.showGrimoire(true);
          // Part C: the hero and Nul stand; the sim is over (no driver ticks), only the cutscene state plays
          const from = sp.from ?? sp.t;
          const view = pview();
          let t = from;
          pro.setCutscene(csState(t), true);
          pro.settle();
          const stepMs = 33;
          for (; t < sp.t; t += stepMs) {
            const lc = sp.lineClock === undefined ? -1 : sp.lineClock;
            pro.setCutscene(csState(Math.min(t, sp.t), lc));
            hud.render(view, 1, stepMs / 1000);
          }
          const lc = sp.lineClock === undefined ? -1 : sp.lineClock;
          pro.setCutscene(csState(sp.t, lc));
          if (lc >= 0) pro.settle();
          hud.render(view, 1, 0.016);
        }
        bdr.advance(0);
        bdr.world.setMood(blendMood(STORM_GOLD, UNWRITTEN, sp.blend), "ruins");
        bdr.world.render();
        hud.render(sp.t === null ? pview() : pview(), 1, 0);
        return sp.note;
      },
      bench(frames) {
        // one static view (the same plates, pops and fx for both runs), alternating mounted / unmounted in short rounds
        for (
          let i = 0;
          i < 3000 && !(driver.view.phase === "combat" && driver.view.plates.length >= 1);
          i++
        )
          tick();
        for (let i = 0; i < 20; i++) tick();
        const v = pview();
        const mounted = hud.getPrologue();
        const run = (n: number): number => {
          const t0 = performance.now();
          for (let i = 0; i < n; i++) hud.render(v, 1, DT);
          // canvas ops are recorded lazily: read a pixel back so the rasterisation is inside the timing
          (hudCanvas.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, 1, 1);
          return (performance.now() - t0) / n;
        };
        run(120);
        const per = Math.max(20, Math.floor(frames / 8));
        const w: number[] = [];
        const wo: number[] = [];
        for (let r = 0; r < 8; r++) {
          w.push(run(per));
          hud.detachPrologue();
          wo.push(run(per));
          hud.attachPrologue(mounted ?? undefined);
        }
        const med = (a: number[]): number =>
          [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
        const withMs = med(w);
        const withoutMs = med(wo);
        return { withMs, withoutMs, deltaMs: withMs - withoutMs, frames: per * 8 };
      },
    };
  };
  void boot();
}
