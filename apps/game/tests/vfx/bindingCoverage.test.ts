/**
 * Binding coverage (spec §12.4): every typing-relevant sim event has an effect binding, and every binding row has
 * code behind it in each layer it names.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_EVENT_TYPES } from "@hd2d/sim";
import { describe, expect, it } from "vitest";
import { entityOf, flushesQueue } from "../../src/render/vfx/PresentationQueue";
import { SPEC_TYPING_EVENTS, TYPING_BINDINGS } from "../../src/render/vfx/typingBindings";

const src = (rel: string): string =>
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src", rel),
    "utf8",
  );
const HUD = src("hud/fx/typing/TypingHudFx.ts");
const WORLD = src("render/vfx/TypingWorldFx.ts");
const HANDLE = src("render/vfx/TypingFxHandle.ts");

const hasCase = (code: string, type: string): boolean => code.includes(`case "${type}"`);

describe("typing VFX binding coverage", () => {
  it("every spec-listed typing event has a binding row", () => {
    for (const t of SPEC_TYPING_EVENTS) expect(TYPING_BINDINGS[t], `${t} has no row`).toBeDefined();
  });

  it("every row is a real sim event type", () => {
    const all = new Set<string>(ALL_EVENT_TYPES);
    for (const t of Object.keys(TYPING_BINDINGS))
      expect(all.has(t), `${t} is not a sim event`).toBe(true);
  });

  it("every row has code in each layer it names", () => {
    for (const [type, layers] of Object.entries(TYPING_BINDINGS)) {
      for (const layer of layers ?? []) {
        if (layer === "hud")
          expect(hasCase(HUD, type), `TypingHudFx has no case for ${type}`).toBe(true);
        else if (layer === "world")
          expect(hasCase(WORLD, type), `TypingWorldFx has no case for ${type}`).toBe(true);
        else {
          // the queue layer: chip hits are gated by `queue.gate` (Hit), the finisher holds its entity, and the
          // clear events flush or wait through `flushesQueue`
          const ok =
            type === "Hit"
              ? entityOf({ type: "Hit", targetId: 7 } as never) === 7
              : type === "EnemyDeath"
                ? entityOf({ type: "EnemyDeath", enemyId: 7 } as never) === 7
                : type === "FinisherCompleted"
                  ? HANDLE.includes('"FinisherCompleted"') && HANDLE.includes("holdEntity")
                  : type === "LevelStarted"
                    ? HANDLE.includes('"LevelStarted"') && HANDLE.includes("queue.clear")
                    : flushesQueue({ type } as never);
          expect(ok, `the queue does not handle ${type}`).toBe(true);
        }
      }
    }
  });

  it("the level-end events clear the HUD half and fade the world half", () => {
    for (const t of ["LevelCleared", "LevelFailed", "LevelStarted"]) {
      expect(hasCase(HUD, t), `HUD ${t}`).toBe(true);
    }
    expect(hasCase(WORLD, "EncounterCleared")).toBe(true);
    expect(hasCase(WORLD, "LevelCleared")).toBe(true);
  });
});
