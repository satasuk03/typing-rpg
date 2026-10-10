/** Chapter complete: shown after the L10 clear (the Ruin Golem). Totals from the save. */

import { leakHintNote } from "../../level/screens";
import { totalStars } from "../../meta/ops";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el, fmt } from "../dom";
import { openTrial } from "../trialLink";

export function completeScreen(app: App, _arg: ScreenArg): Screen {
  const root = el("app-screen complete");
  const s = app.store.save;
  const levels = app.bundle.levels.filter((l) => l.chapter === 1);
  const cleared = levels.filter((l) => s.progress.levels[l.id]?.cleared).length;
  const stars = totalStars(s);
  const words = Object.keys(s.journal.firstSeen).length;
  const mastered = s.srs.mastered.length;
  const run = app.lastRun;
  const acc =
    s.lifetime.chars + s.lifetime.typos > 0
      ? (s.lifetime.chars / (s.lifetime.chars + s.lifetime.typos)) * 100
      : 100;
  root.innerHTML = `<div class="comp-vig"></div>
    <div class="comp-card hd-panel">
      <div class="hd-eyebrow">Chapter I</div>
      <h1 class="hd-title" id="comp-title">CHAPTER COMPLETE</h1>
      <p class="hd-sub" style="margin-bottom:6px">The Ruin Golem falls. The Ember Road lies open.</p>
      <div class="comp-stars"><span class="hd-star on"></span><b id="comp-stars">${stars}</b><span class="hd-dim">/ 30 stars</span></div>
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
      <p class="hd-sub" style="margin-bottom:12px">Chapter II is still being written. Replay levels for stars, upgrade your gear, or test your speed.</p>
      <div class="btns"><button class="hd-btn primary" data-act="map" data-autofocus>Back to map</button>
        <button class="hd-btn" data-act="journal">Word Journal</button>
        <button class="hd-btn" data-act="trial">Typing Trial</button>
        <button class="hd-btn" data-act="title">Title</button></div>
    </div>`;
  actions(root, {
    map: () => app.go("map", {}),
    journal: () => app.go("journal"),
    trial: () => openTrial(),
    title: () => app.go("title"),
  });
  return { root, focus: () => app.nav.focusFirst("[data-autofocus]") };
}
