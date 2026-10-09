/** The compact "How to play" controls panel (T3.3), shared by the pause menu (level/screens.ts) and Settings (app). */

export const HOW_TO_PLAY_CSS = `
.htp{text-align:left;max-width:620px}
.htp h2{font:900 18px var(--f-disp);letter-spacing:.14em;color:var(--gold);text-transform:uppercase;margin-bottom:10px;text-align:center}
.htp dl{display:grid;grid-template-columns:150px 1fr;gap:7px 16px;margin:0 0 6px}
.htp dt{color:var(--gold-hi);font:12px var(--f-pix);letter-spacing:.06em;padding-top:2px}
.htp dd{margin:0;color:var(--ink);font-size:13px;line-height:1.4}
.htp dd .red{color:#ff9a8a}
.htp .htp-sep{grid-column:1/-1;height:1px;background:linear-gradient(90deg,transparent,#6e5a38,transparent);margin:2px 0}
`;

export const HOW_TO_PLAY_HTML = `<div class="htp"><h2>How to play</h2><dl>
  <dt>Lock on</dt><dd>Type the first letter of a word to lock on, then finish it. Every word starts with a different letter.</dd>
  <dt>Typos</dt><dd>A wrong key hurts your combo (Settings sets how much). Three wrong keys in a row drop the lock (if Auto-unlock is on).</dd>
  <dt><span class="hd-kbd">Esc</span></dt><dd>Drops your target. With no target it opens the pause menu.</dd>
  <dt>Attack gauge</dt><dd>Correct letters fill it. When it is full, your hero strikes.</dd>
  <dt>Combo</dt><dd>Finish words with no typos. Bigger combos hit harder.</dd>
  <dt>Skills</dt><dd>Typing charges them, and a charged skill fires on its own.</dd>
  <dt><span class="red">Red word</span></dt><dd><span class="red">An incoming attack.</span> Type it before it lands to block. A perfect word parries.</dd>
  <dt class="htp-sep"></dt>
  <dt>Menus</dt><dd><span class="hd-kbd">Arrows</span> move, <span class="hd-kbd">Enter</span> picks, <span class="hd-kbd">Esc</span> goes back. No mouse needed.</dd>
</dl></div>`;
