/** Chapter complete: shown after the L10 clear (the Ruin Golem). Totals from the save. */

import { leakHintNote } from "../../level/screens";
import { isFlagKey, totalStars } from "../../meta/ops";
import type { App, Screen, ScreenArg } from "../app";
import { CHAPTERS, chapterState } from "../chapters";
import { actions, el, fmt } from "../dom";
import { openTrial } from "../trialLink";

export function completeScreen(app: App, arg: ScreenArg): Screen {
  const root = el("app-screen complete");
  const s = app.store.save;
  const chapter = Number(arg.chapter) || 1;
  const info = CHAPTERS.find((c) => c.n === chapter);
  const next = CHAPTERS.find((c) => c.n === chapter + 1);
  const nextOpen = next !== undefined && chapterState(s, app.bundle, next.n) === "open";
  const levels = app.bundle.levels.filter((l) => l.chapter === chapter);
  const cleared = levels.filter((l) => s.progress.levels[l.id]?.cleared).length;
  const stars = totalStars(s);
  const words = Object.keys(s.journal.firstSeen).filter((k) => !isFlagKey(k)).length;
  const mastered = s.srs.mastered.length;
  const run = app.lastRun;
  const acc =
    s.lifetime.chars + s.lifetime.typos > 0
      ? (s.lifetime.chars / (s.lifetime.chars + s.lifetime.typos)) * 100
      : 100;
  root.innerHTML = `<div class="comp-vig"></div>
    <div class="comp-card hd-panel">
      <div class="hd-eyebrow">${info?.label ?? `Chapter ${chapter}`}</div>
      <h1 class="hd-title" id="comp-title">CHAPTER COMPLETE</h1>
      <p class="hd-sub" style="margin-bottom:6px">${chapter === 1 ? "The Ruin Golem falls. The Ember Road lies open." : `${info?.title ?? "The road"} is behind you.`}</p>
      <div class="comp-stars"><span class="hd-star on"></span><b id="comp-stars">${stars}</b><span class="hd-dim">/ ${levels.length * 3} stars</span></div>
      <div class="hd-rule"></div>
      <div class="comp-grid">
        <div><span class="hd-eyebrow">Levels</span><b id="comp-levels">${cleared} / ${levels.length}</b></div>
        <div><span class="hd-eyebrow">Gold</span><b class="hd-gold">${fmt(s.wallet.gold)}</b></div>
        <div><span class="hd-eyebrow">Words met</span><b>${fmt(words)}</b></div>
        <div><span class="hd-eyebrow">Mastered</span><b>${mastered}</b></div>
        <div><span class="hd-eyebrow">Accuracy</span><b>${acc.toFixed(1)}%</b></div>
        <div><span class="hd-eyebrow">Typed</span><b>${fmt(s.lifetime.words)} words</b></div>
      </div>
      ${run ? `<p class="hd-dim" style="font-size:12px;margin-top:10px">Last clear: ${(run.result.stats.netWpmX100 / 100) | 0} WPM at ${(run.result.stats.accuracyBp / 100).toFixed(1)}% accuracy.</p>` : ""}
      ${leakHintNote(run?.leakDamage ?? 0) ? `<p class="hd-dim" id="comp-leak" style="font-size:12px;margin-top:6px">${leakHintNote(run?.leakDamage ?? 0)}</p>` : ""}
      <div class="hd-rule"></div>
      ${
        nextOpen
          ? `<div class="comp-unlock" id="comp-unlock"><div class="hd-eyebrow">New chapter unlocked</div>
              <h2 class="hd-h" style="margin:4px 0">${next?.label}: ${next?.title}</h2>
              <p class="hd-sub" style="margin-bottom:12px">The Golem's last words point into the Hushwood. Capital letters wait there: hold Shift to type them.</p></div>`
          : `<p class="hd-sub" style="margin-bottom:12px">${next ? `${next.label} is still being written. ` : ""}Replay levels for stars, upgrade your gear, or test your speed.</p>`
      }
      <div class="btns">${nextOpen ? `<button class="hd-btn primary" data-act="next" data-autofocus data-key="next-chapter">Enter ${next?.label}</button>` : ""}<button class="hd-btn${nextOpen ? "" : " primary"}" data-act="map"${nextOpen ? "" : " data-autofocus"}>Back to map</button>
        <button class="hd-btn" data-act="journal">Word Journal</button>
        <button class="hd-btn" data-act="trial">Typing Trial</button>
        <button class="hd-btn" data-act="title">Title</button></div>
    </div>`;
  actions(root, {
    map: () => app.go("map", { chapter }),
    next: () => {
      app.sfx("uiConfirm");
      app.go("map", { chapter: chapter + 1, focus: `ch${chapter + 1}-l01` });
    },
    journal: () => app.go("journal"),
    trial: () => openTrial(),
    title: () => app.go("title"),
  });
  return { root, focus: () => app.nav.focusFirst("[data-autofocus]") };
}
