/**
 * The published odds dialog for Gear Caches. Everything shown here comes from `publishedCacheOdds()` (sim meta):
 * base per-roll rarity odds, effective odds after pity, slot odds, weapon-type odds and the pity rules.
 */
import { RARITY_INFO, type Rarity } from "@hd2d/content";
import { publishedCacheOdds } from "@hd2d/sim";
import type { App } from "../app";
import { actions, el, pct } from "../dom";

const ORDER: Rarity[] = ["C", "U", "R", "E", "L"];

export function oddsHtml(): string {
  const o = publishedCacheOdds();
  const rows = ORDER.map(
    (r) => `<tr data-r="${r}"><td style="color:${RARITY_INFO[r].color}">${RARITY_INFO[r].name}</td>
      <td class="base">${pct(o.rarityBp[r])}</td><td class="eff"><b>${pct(o.effectiveRarityBp[r])}</b></td></tr>`,
  ).join("");
  return `<h2 class="hd-h" id="odds-title">Gear Cache odds</h2>
    <p class="hd-sub" style="margin-bottom:10px">Fixed and published. They never change with spending or play time.</p>
    <table class="odds-t"><thead><tr><th>Rarity</th><th>Per roll</th><th>Effective, with pity</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="odds-cols">
      <div><div class="hd-eyebrow">Piece</div>
        <div id="odds-slot">Weapon ${pct(o.slotBp.weapon)} &middot; Armor ${pct(o.slotBp.armor)} &middot; Charm ${pct(o.slotBp.charm)}</div></div>
      <div><div class="hd-eyebrow">Weapon type</div>
        <div id="odds-arch">Your equipped type ${pct(o.weaponArchetypeBp.equipped)}, each other type ${pct(o.weaponArchetypeBp.otherEach)}</div></div>
    </div>
    <div class="hd-rule"></div>
    <div class="hd-eyebrow">Pity (guaranteed floors)</div>
    <ul class="odds-pity" id="odds-pity">
      <li>Rare or better is guaranteed within <b>${o.pity.rare}</b> opens.</li>
      <li>Epic or better is guaranteed within <b>${o.pity.epic}</b> opens.</li>
      <li>Legendary is guaranteed within <b>${o.pity.legendary}</b> opens.</li>
    </ul>
    <p class="hd-dim" style="font-size:12px">A counter resets when you receive that rarity or better. The effective column comes from a 200,000-roll simulation of these rules.</p>
    <div class="btns" style="margin-top:12px"><button class="hd-btn primary" data-act="close" data-autofocus>Close (Esc)</button></div>`;
}

export function openOddsDialog(app: App): void {
  const box = el("hd-panel app-odds");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "odds-title");
  box.id = "odds-dialog";
  box.innerHTML = oddsHtml();
  const close = app.openModal(box);
  actions(box, { close: () => close() });
}
