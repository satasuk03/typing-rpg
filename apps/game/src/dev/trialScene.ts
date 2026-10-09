/**
 * DEV-ONLY Typing Trial screen + leaderboard (`?scene=trial[&api=http://localhost:8787]`), keyboard-only.
 *   boot -> ready (type the first letter) -> running (60 s) -> results -> [Enter] submit -> leaderboard -> [Enter] again.
 * Functional, not final art: full screen polish is T3.2. Uses the HUD theme colours/fonts (read-only import).
 * Test hooks: window.__trial (phase, ticket, result, submit outcome, leaderboard) and window.__net (the net layer).
 */
import { FONT_DISP, FONT_PIX, FONT_UI, GOLD, GOLD_HI, INK, KEY_STREAK_COLORS } from "../hud/theme";
import {
  ApiError,
  createNet,
  type LbTrialResponseT,
  type Net,
  type SubmitOutcome,
  type TrialRun,
} from "../net";

export type Phase =
  | "boot"
  | "ready"
  | "running"
  | "abandon"
  | "results"
  | "submitting"
  | "submitted"
  | "error";

export interface TrialHook {
  phase: Phase;
  run: TrialRun | null;
  result: { wpmX100: number; accuracyBp: number; correctChars: number; typos: number } | null;
  outcome: SubmitOutcome | null;
  leaderboard: LbTrialResponseT | null;
  error: string | null;
  net: Net;
  /** dev/test: mutate the next submit payload (e.g. forge the claim) */
  tamper: ((b: import("../net").RunSubmitBody) => import("../net").RunSubmitBody) | null;
}

declare global {
  interface Window {
    __trial?: TrialHook;
    __net?: Net;
  }
}

const css = `
#trial{position:fixed;inset:0;z-index:5;background:radial-gradient(ellipse at 50% 0%,#1b2236 0%,#0b0e16 60%);color:${INK};
  font-family:${FONT_UI};overflow:auto;display:flex;justify-content:center}
#trial .col{width:min(1000px,94vw);padding:28px 0 60px}
#trial h1{font-family:${FONT_DISP};font-weight:900;color:${GOLD};letter-spacing:.12em;margin:0 0 4px;font-size:28px}
#trial .sub{opacity:.75;font-size:13px;margin-bottom:18px}
#trial .bar{display:flex;gap:28px;align-items:baseline;margin:6px 0 16px;font-family:${FONT_PIX};font-size:14px}
#trial .bar b{color:${GOLD_HI};font-size:22px}
#trial .time{font-size:34px;color:${GOLD}}
#trial .passage{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:26px;line-height:1.7;white-space:pre-wrap;
  word-break:break-word;background:#0e1322;border:1px solid #2a3350;border-radius:6px;padding:20px 24px;min-height:190px}
#trial .done{color:#6a7a52}
#trial .cur{background:${GOLD};color:#10131c;border-radius:3px;padding:0 1px;box-shadow:0 0 0 2px ${GOLD_HI}}
#trial .cur.typo{background:#e24a4a;box-shadow:0 0 0 2px #ff9b9b}
#trial .next{color:${INK}}
#trial .msg{margin:16px 0;font-size:15px;min-height:22px}
#trial .msg.bad{color:#ff8a8a}#trial .msg.good{color:#9be59b}
#trial .hint{opacity:.7;font-size:13px}
#trial table{border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 20px}
#trial th,#trial td{padding:5px 10px;text-align:left;border-bottom:1px solid #222a40}
#trial th{color:${GOLD};font-family:${FONT_PIX};font-size:11px}
#trial tr.me td{background:#3a3114;color:${GOLD_HI};font-weight:700}
#trial .scroll{max-height:300px;overflow:auto;border:1px solid #222a40;border-radius:6px}
#trial .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0 18px}
#trial .card{background:#10162a;border:1px solid #2a3350;border-radius:6px;padding:10px 14px}
#trial .card span{display:block;opacity:.7;font-size:11px;margin-bottom:4px}
#trial .card b{font-family:${FONT_PIX};font-size:20px;color:${GOLD_HI}}
`;

export function start(_glCanvas?: HTMLCanvasElement): void {
  const params = new URLSearchParams(location.search);
  const apiBase = params.get("api") ?? "http://localhost:8787";
  const net = createNet({ baseUrl: apiBase, clientVersion: "dev-trial-scene" });
  window.__net = net;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  void import("../hud/fonts").then((m) => m.loadHudFonts());
  const root = document.createElement("div");
  root.id = "trial";
  root.innerHTML = `<div class="col">
    <h1>TYPING TRIAL</h1>
    <div class="sub">60 seconds. Type the passage exactly as written; a wrong key does not advance. <span id="t-save"></span></div>
    <div class="bar"><span class="time" id="t-time">1:00</span>
      <span>WPM <b id="t-wpm">0</b></span><span>ACC <b id="t-acc">100%</b></span><span>STREAK <b id="t-streak">0</b></span></div>
    <div class="passage" id="t-passage" aria-label="passage"></div>
    <div class="msg" id="t-msg"></div>
    <div id="t-results"></div>
    <div id="t-lb"></div>
  </div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`) as T;

  const hook: TrialHook = {
    phase: "boot",
    run: null,
    result: null,
    outcome: null,
    leaderboard: null,
    error: null,
    net,
    tamper: null,
  };
  window.__trial = hook;
  const setPhase = (p: Phase): void => {
    hook.phase = p;
    root.dataset.phase = p;
  };
  const msg = (text: string, cls: "" | "bad" | "good" = ""): void => {
    const m = $("t-msg");
    m.textContent = text;
    m.className = `msg ${cls}`;
    m.dataset.kind = cls;
  };

  let lastTypo = false;
  let raf = 0;

  // ---- save status line (local-first sync runs in the background)
  const showSave = async (): Promise<void> => {
    const local = await net.sync.getLocal().catch(() => null);
    $("t-save").textContent =
      ` | save: ${net.sync.status}${local ? `, gold ${local.wallet.gold}` : ", none"}`;
  };
  window.addEventListener("online", () => net.sync.onOnline());

  function drawPassage(): void {
    const run = hook.run;
    if (!run) return;
    const v = run.recorder.view();
    const p = v.passage;
    const i = v.typedIndex;
    const el = $("t-passage");
    el.replaceChildren();
    const done = document.createElement("span");
    done.className = "done";
    done.textContent = p.slice(Math.max(0, i - 40), i);
    const cur = document.createElement("span");
    cur.className = `cur${lastTypo ? " typo" : ""}`;
    cur.textContent = p.charAt(i) === " " ? " " : p.charAt(i);
    cur.dataset.char = p.charAt(i);
    const next = document.createElement("span");
    next.className = "next";
    next.textContent = p.slice(i + 1, i + 1 + 260);
    el.append(done, cur, next);
    $("t-wpm").textContent = String(v.netWpm);
    $("t-acc").textContent = `${(v.accuracy / 100).toFixed(1)}%`;
    const streak = $("t-streak");
    streak.textContent = String(v.keyStreak);
    streak.style.color = KEY_STREAK_COLORS[v.keyStreakTier] ?? "#fff";
    const secs = Math.max(0, Math.ceil(v.ticksLeft / 60));
    $("t-time").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }

  async function newRun(): Promise<void> {
    cancelAnimationFrame(raf);
    setPhase("boot");
    hook.outcome = null;
    hook.result = null;
    $("t-results").replaceChildren();
    $("t-lb").replaceChildren();
    msg("Connecting...");
    try {
      hook.run = await net.trials.start();
      lastTypo = false;
      drawPassage();
      setPhase("ready");
      msg("Type the first letter to begin. The clock starts on your first key.");
      void net.sync.sync().then(showSave, showSave);
    } catch (e) {
      fail(e);
    }
  }

  function fail(e: unknown): void {
    const text =
      e instanceof ApiError ? `${e.code}: ${e.message}` : String((e as Error)?.message ?? e);
    hook.error = text;
    setPhase("error");
    msg(`Error: ${text}. Press Enter to retry.`, "bad");
  }

  function loop(now: number): void {
    const run = hook.run;
    if (run && hook.phase === "running") {
      const over = run.recorder.onFrame(now);
      drawPassage();
      if (over) {
        finish();
        return;
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function finish(): void {
    const run = hook.run as TrialRun;
    const r = run.recorder.result();
    if (!r) return;
    hook.result = r;
    setPhase("results");
    $("t-results").innerHTML = `<div class="grid" id="t-cards">
      <div class="card"><span>WPM</span><b data-k="wpm">${(r.wpmX100 / 100).toFixed(2)}</b></div>
      <div class="card"><span>ACCURACY</span><b data-k="acc">${(r.accuracyBp / 100).toFixed(2)}%</b></div>
      <div class="card"><span>CORRECT</span><b data-k="correct">${r.correctChars}</b></div>
      <div class="card"><span>TYPOS</span><b data-k="typos">${r.typos}</b></div></div>`;
    msg("Time! Press Enter to submit your run.");
  }

  async function submit(): Promise<void> {
    const run = hook.run;
    if (!run) return;
    setPhase("submitting");
    msg("Submitting...");
    const outcome = await net.trials.submit(run, hook.tamper ? { mutate: hook.tamper } : {});
    hook.outcome = outcome;
    if (outcome.ok) {
      const v = outcome.response;
      msg(
        `Accepted: ${(v.verified.wpmX100 / 100).toFixed(2)} WPM, ${(v.verified.accuracyBp / 100).toFixed(2)}%${v.pb ? " (new personal best!)" : ""}${v.rank ? `, rank #${v.rank}` : ""}. Press Enter to play again.`,
        "good",
      );
      setPhase("submitted");
      await showLeaderboard();
    } else {
      const e = outcome.error;
      const code = e instanceof ApiError ? e.code : "network";
      msg(
        `Rejected: ${code} - ${e.message}.${outcome.needsNewTicket ? " This ticket is spent: press Enter for a new run." : " Press Enter to retry."}`,
        "bad",
      );
      setPhase("submitted");
      hook.error = code;
    }
  }

  async function showLeaderboard(): Promise<void> {
    try {
      const lb = await net.trials.leaderboard("season");
      hook.leaderboard = lb;
      const row = (e: LbTrialResponseT["top"][number]) =>
        `<tr class="${e.isMe ? "me" : ""}" data-public-id="${e.publicId}"><td>${e.rank}</td><td></td><td>${(e.wpmX100 / 100).toFixed(2)}</td><td>${(e.accuracyBp / 100).toFixed(2)}%</td></tr>`;
      const fill = (tbody: HTMLElement, rows: LbTrialResponseT["top"]) => {
        tbody.innerHTML = rows.map(row).join("");
        tbody.querySelectorAll("tr").forEach((tr, i) => {
          const cell = tr.children[1];
          if (cell) cell.textContent = rows[i]?.displayName ?? "";
        });
      };
      const lbEl = $("t-lb");
      lbEl.innerHTML = `<h1 style="font-size:20px">LEADERBOARD ${lb.periodKey}</h1>
        <div class="sub">Top ${lb.top.length}${lb.me ? ` | you: #${lb.me.rank}` : ""}</div>
        <div class="scroll"><table id="lb-top"><thead><tr><th>#</th><th>NAME</th><th>WPM</th><th>ACC</th></tr></thead><tbody></tbody></table></div>
        <h1 style="font-size:16px;margin-top:14px">AROUND YOU</h1>
        <table id="lb-around"><thead><tr><th>#</th><th>NAME</th><th>WPM</th><th>ACC</th></tr></thead><tbody></tbody></table>`;
      fill(lbEl.querySelector("#lb-top tbody") as HTMLElement, lb.top);
      fill(lbEl.querySelector("#lb-around tbody") as HTMLElement, lb.around ?? []);
      lbEl.querySelector("tr.me")?.scrollIntoView({ block: "nearest" });
    } catch (e) {
      $("t-lb").textContent = `Leaderboard unavailable: ${String((e as Error).message)}`;
    }
  }

  // ---- input
  window.addEventListener("keydown", (e) => {
    const run = hook.run;
    const k = e.key;
    if (hook.phase === "ready" || hook.phase === "running") {
      if (!run) return;
      if (k === "Tab" || k === " ") e.preventDefault();
      const before = run.recorder.view();
      const out = run.recorder.onKeyDown(e);
      if (out === "escape") {
        if (hook.phase === "running") {
          setPhase("abandon");
          msg("Abandon this run? Enter = yes, Escape = keep typing.");
        }
        return;
      }
      if (out === "typed") {
        e.preventDefault();
        const after = run.recorder.view();
        lastTypo = after.typedIndex === before.typedIndex;
        if (hook.phase === "ready") {
          setPhase("running");
          msg("");
          raf = requestAnimationFrame(loop);
        }
        drawPassage();
      }
      return;
    }
    if (hook.phase === "abandon") {
      if (k === "Enter") void newRun();
      else if (k === "Escape") {
        setPhase("running");
        msg("");
      }
      return;
    }
    if (k !== "Enter") return;
    if (hook.phase === "results") void submit();
    else if (hook.phase === "submitted" || hook.phase === "error") void newRun();
  });
  // The Trial cannot be paused: leaving the tab aborts it (interfaces §2).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && hook.phase === "running") {
      msg("Run aborted because the tab was hidden. Press Enter for a new run.", "bad");
      setPhase("error");
    }
  });

  void showSave();
  void newRun();
}
