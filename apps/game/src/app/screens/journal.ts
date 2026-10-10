/** Word Journal: every word met, with definition + example, an optional translation, the SRS box and weak words. */
import type { WordEntry } from "@hd2d/content";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el, esc, header } from "../dom";

type Filter = "all" | "weak" | "mastered";
const FILTERS: Filter[] = ["all", "weak", "mastered"];

export function journalScreen(app: App, _arg: ScreenArg): Screen {
  const root = el("app-screen journal");
  root.append(header(app, "Lexicon", "Word Journal"));
  const body = el("jr-body");
  root.append(body);
  const byKey = new Map<string, WordEntry>();
  for (const w of app.bundle.words) if (!byKey.has(w.key)) byKey.set(w.key, w);
  let filter: Filter = "all";
  let sel: string | null = null;
  let notes: Record<string, string> = {};
  let keepFocus: string | null = null;

  const s = (): typeof app.store.save => app.store.save;
  const isWeak = (key: string): boolean => {
    const e = s().srs.entries[key];
    return e !== undefined && (e.box <= 2 || e.due <= s().srs.levelsPlayed);
  };
  const isMastered = (key: string): boolean => s().srs.mastered.includes(key);

  const list = (): string[] => {
    const keys = Object.keys(s().journal.firstSeen).filter((k) => byKey.has(k));
    const f = keys.filter((k) =>
      filter === "all" ? true : filter === "weak" ? isWeak(k) : isMastered(k),
    );
    return f.sort((a, b) => {
      const wa = isWeak(a) ? 0 : 1;
      const wb = isWeak(b) ? 0 : 1;
      return wa - wb || (a < b ? -1 : a > b ? 1 : 0);
    });
  };

  const pips = (key: string): string => {
    const e = s().srs.entries[key];
    const m = isMastered(key);
    const box = m ? 5 : (e?.box ?? 0);
    return `<span class="pips" aria-label="${m ? "Mastered" : e ? `Review box ${e.box} of 5` : "Not in review"}">${[
      1, 2, 3, 4, 5,
    ]
      .map((i) => `<i class="${i <= box ? "on" : ""}${m ? " m" : ""}"></i>`)
      .join("")}</span>`;
  };

  const detail = (key: string | null): string => {
    const w = key ? byKey.get(key) : undefined;
    if (!key || !w) return `<p class="hd-dim">Select a word.</p>`;
    const e = s().srs.entries[key];
    const m = isMastered(key);
    const due = e ? Math.max(0, e.due - s().srs.levelsPlayed) : null;
    const status = m
      ? `<span class="hd-chip hd-good">Mastered</span>`
      : e
        ? isWeak(key)
          ? `<span class="hd-chip hd-bad">Weak word</span>`
          : `<span class="hd-chip hd-gold">In review</span>`
        : `<span class="hd-chip hd-dim">Seen</span>`;
    return `<div class="jr-word">${esc(w.text)}</div>
      <div class="hd-dim">${w.kind} &middot; tier ${w.tier}${w.cefr ? ` &middot; ${w.cefr}` : ""}</div>
      <div style="margin:8px 0">${status} ${pips(key)}</div>
      <div class="hd-eyebrow">Meaning</div><p class="jr-def" id="jr-def">${esc(w.definition)}</p>
      <div class="hd-eyebrow">Example</div><p class="jr-ex" id="jr-ex">${esc(w.example)}</p>
      <table class="jr-meta">
        <tr><td>Review box</td><td>${m ? "5 (mastered)" : e ? `${e.box} of 5` : "none"}</td></tr>
        ${e ? `<tr><td>Next review</td><td>${due === 0 ? "next level" : `in ${due} level${due === 1 ? "" : "s"}`}</td></tr><tr><td>Slips</td><td>${e.lapses}</td></tr>` : ""}
      </table>
      <label class="hd-eyebrow" for="jr-tr">Your translation (optional)</label>
      <input id="jr-tr" class="hd-input" type="text" maxlength="120" autocomplete="off" spellcheck="false" placeholder="Type a note in your language" value="${esc(notes[key] ?? "")}">
      <div class="hd-dim" style="font-size:12px;margin-top:4px" id="jr-saved"></div>`;
  };

  const draw = (): void => {
    const keys = list();
    if (sel === null || !keys.includes(sel)) sel = keys[0] ?? null;
    const known = Object.keys(s().journal.firstSeen).filter((k) => byKey.has(k)).length;
    const weakN = Object.keys(s().journal.firstSeen).filter(isWeak).length;
    const tabs = FILTERS.map(
      (f) =>
        `<button class="hd-btn sm" data-act="filter" data-f="${f}" data-key="f-${f}" aria-pressed="${f === filter}">${f === "all" ? `All ${known}` : f === "weak" ? `Weak ${weakN}` : `Mastered ${s().srs.mastered.length}`}</button>`,
    ).join("");
    const rows = keys
      .map(
        (
          k,
        ) => `<button class="hd-item" data-act="select" data-k="${esc(k)}" data-key="w-${esc(k)}" aria-pressed="${k === sel}">
          <span class="grow"><span class="nm">${esc(byKey.get(k)?.text ?? k)}</span></span>${isWeak(k) ? `<span class="hd-chip hd-bad">weak</span>` : ""}${pips(k)}</button>`,
      )
      .join("");
    body.innerHTML = `<section class="hd-panel flat jr-list"><div class="hd-seg inv-tabs">${tabs}</div>
        <div class="hd-list jr-items" id="items">${rows || `<p class="hd-dim" style="padding:10px">${known === 0 ? "Play a level to meet your first words. They are collected here with their meaning." : "No words in this view."}</p>`}</div></section>
      <section class="hd-panel flat jr-detail" id="detail">${detail(sel)}</section>`;
    if (keepFocus) {
      (body.querySelector(`[data-key="${keepFocus}"]`) as HTMLElement | null)?.focus();
      keepFocus = null;
    }
  };

  notes = app.store.translations();
  draw();

  const showDetail = (): void => {
    const d = body.querySelector("#detail");
    if (d) d.innerHTML = detail(sel);
    for (const b of body.querySelectorAll<HTMLElement>("#items .hd-item"))
      b.setAttribute("aria-pressed", String(b.dataset.k === sel));
  };
  root.addEventListener("focusin", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("#items .hd-item");
    if (b?.dataset.k && b.dataset.k !== sel) {
      sel = b.dataset.k;
      showDetail();
    }
  });
  // translation field: save on input (debounced), saved in your cloud save
  let t = 0;
  root.addEventListener("input", (e) => {
    const inp = e.target as HTMLInputElement;
    if (inp.id !== "jr-tr" || !sel) return;
    const key = sel;
    notes[key] = inp.value;
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      app.store.setTranslation(key, inp.value);
      const m = body.querySelector("#jr-saved");
      if (m) m.textContent = "Saved";
    }, 250);
  });
  actions(root, {
    filter: (b) => {
      filter = b.dataset.f as Filter;
      keepFocus = `f-${filter}`;
      draw();
    },
    select: () => (body.querySelector("#jr-tr") as HTMLElement | null)?.focus(),
  });
  return {
    root,
    focus: () => {
      const first =
        body.querySelector<HTMLElement>("#items .hd-item") ??
        body.querySelector<HTMLElement>("[data-key=f-all]");
      first?.focus();
    },
    dispose: () => window.clearTimeout(t),
  };
}
