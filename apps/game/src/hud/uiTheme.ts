/**
 * DOM screen theme (T3.2): the HUD's palette and fonts as CSS, shared by the app screens (`app/`) and the in-level
 * overlays (`level/screens.ts`). Dark ink panels with a gold double frame, Cinzel titles, Silkscreen body, and a
 * very visible focus ring (every screen is keyboard-first). No external requests: fonts are self-hosted (hud/fonts).
 */
import { FONT_DISP, FONT_PIX, FONT_UI, GOLD, GOLD_HI, INK } from "./theme";

export const UI_CSS = `
:root{
  --gold:${GOLD};--gold-hi:${GOLD_HI};--ink:${INK};--muted:#b9ad8c;--dim:#7d7360;
  --bg0:#17121f;--bg1:#08060b;--edge:#b8955a;--danger:#ff8a7a;--good:#9be59b;--cool:#9fe8f0;
  --f-disp:${FONT_DISP};--f-ui:${FONT_UI};--f-pix:${FONT_PIX};
  --r-C:#b9b4a6;--r-U:#6fd16e;--r-R:#58a8ff;--r-E:#b772ff;--r-L:#ffb43a;
}
.hd-root,.hd-root *{box-sizing:border-box}
.hd-root{font:14px/1.45 var(--f-ui);color:var(--ink);-webkit-font-smoothing:none;user-select:none}
.hd-root h1,.hd-root h2,.hd-root h3,.hd-root p{margin:0}
.hd-root .hd-title{font:900 34px var(--f-disp);letter-spacing:.1em;color:var(--gold-hi);text-shadow:0 2px 0 #5b3d12,0 0 18px rgba(255,170,70,.35)}
.hd-root .hd-title.sm{font-size:22px}
.hd-root .hd-title.fail{color:var(--danger);text-shadow:0 2px 0 #5a1a12}
.hd-root .hd-eyebrow{font:11px var(--f-pix);letter-spacing:.22em;color:var(--cool);text-transform:uppercase}
.hd-root .hd-sub{color:var(--muted);letter-spacing:.08em;font-size:13px}
.hd-root .hd-dim{color:var(--dim)}
.hd-root .hd-good{color:var(--good)}
.hd-root .hd-bad{color:var(--danger)}
.hd-root .hd-gold{color:var(--gold)}
.hd-root .hd-pix{font-family:var(--f-pix)}

.hd-panel{position:relative;background:linear-gradient(180deg,rgba(23,18,31,.94),rgba(8,6,11,.96));
  border:2px solid var(--edge);box-shadow:0 0 0 3px rgba(0,0,0,.65),inset 0 0 0 1px rgba(255,240,184,.14),0 18px 60px rgba(0,0,0,.6);padding:20px 26px}
.hd-panel::before,.hd-panel::after{content:"";position:absolute;width:9px;height:9px;background:var(--gold);transform:rotate(45deg);
  box-shadow:0 0 0 2px #2a1406;top:-7px;left:calc(50% - 5px)}
.hd-panel::after{top:auto;bottom:-7px}
.hd-panel.flat::before,.hd-panel.flat::after{display:none}
.hd-panel h2.hd-h{font:900 18px var(--f-disp);letter-spacing:.14em;color:var(--gold);margin-bottom:10px;text-transform:uppercase}
.hd-rule{height:2px;margin:10px 0;background:linear-gradient(90deg,transparent,var(--edge),transparent);border:0}

.hd-btn{font:13px var(--f-ui);letter-spacing:.1em;text-transform:uppercase;color:var(--gold);cursor:pointer;
  background:linear-gradient(180deg,#241b30,#0d0a13);border:2px solid #6e5a38;padding:9px 18px;margin:0;position:relative;outline:none;
  box-shadow:0 3px 0 #000,inset 0 1px 0 rgba(255,240,184,.12);transition:transform .06s,filter .1s}
.hd-btn:hover{border-color:var(--edge);filter:brightness(1.15)}
.hd-btn:focus,.hd-btn:focus-visible{border-color:var(--gold-hi);color:var(--gold-hi);background:linear-gradient(180deg,#4a3410,#1c1204);
  box-shadow:0 0 0 2px #05060a,0 0 0 5px #ffcf4a,0 0 22px rgba(255,200,90,.55)}
.hd-btn:focus::before{content:"";position:absolute;left:-17px;top:50%;width:8px;height:8px;margin-top:-4px;background:#ffcf4a;transform:rotate(45deg);box-shadow:0 0 0 2px #2a1406}
.hd-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #000}
.hd-btn.primary{color:#1b1408;background:linear-gradient(180deg,#f4d690,#c99a3c);border-color:#fff0b8;text-shadow:0 1px 0 rgba(255,255,255,.35)}
.hd-btn.primary:focus{color:#1b1408;background:linear-gradient(180deg,#fff0b8,#e9c46a)}
.hd-btn.danger{color:var(--danger);border-color:#6a3328}
.hd-btn[aria-disabled=true],.hd-btn:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.6)}
.hd-btn.sm{padding:5px 11px;font-size:12px}
.hd-btn.block{display:block;width:100%;text-align:center}

.hd-chip{display:inline-block;padding:1px 8px;border:1px solid currentColor;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.hd-kbd{display:inline-block;min-width:22px;padding:1px 6px;margin:0 2px;text-align:center;font:11px var(--f-pix);color:var(--ink);
  background:#241b30;border:1px solid #6e5a38;border-bottom-width:3px;border-radius:3px}

.hd-coin{display:inline-flex;align-items:center;gap:8px;font:15px var(--f-pix);color:var(--gold-hi);letter-spacing:.04em}
.hd-coin::before{content:"";width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6c8,#e9c46a 55%,#9a6b1a);box-shadow:0 0 0 2px #2a1406,0 0 10px rgba(255,200,80,.5)}

.hd-bar{height:8px;background:#0a0710;border:1px solid #3a3550;position:relative;overflow:hidden}
.hd-bar>i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(180deg,#ffe08a,#c99a3c)}

.hd-star{color:#3a3550;font-size:18px;text-shadow:0 1px 0 #000}
.hd-star.on{color:#ffd24a;text-shadow:0 0 8px rgba(255,200,60,.7),0 1px 0 #5b3d12}

.hd-ico{--rar:var(--r-C);position:relative;display:inline-block;width:56px;height:56px;flex:none;
  background:radial-gradient(circle at 50% 35%,#2a2338,#0a0710 75%);border:2px solid var(--rar);
  box-shadow:0 0 0 2px #000,inset 0 0 12px color-mix(in srgb,var(--rar) 35%,transparent)}
.hd-ico.sm{width:40px;height:40px}.hd-ico.lg{width:72px;height:72px}
.hd-ico.r-U{--rar:var(--r-U)}.hd-ico.r-R{--rar:var(--r-R)}.hd-ico.r-E{--rar:var(--r-E);box-shadow:0 0 0 2px #000,0 0 14px rgba(183,114,255,.5),inset 0 0 12px rgba(183,114,255,.4)}
.hd-ico.r-L{--rar:var(--r-L);box-shadow:0 0 0 2px #000,0 0 18px rgba(255,180,58,.6),inset 0 0 14px rgba(255,180,58,.45)}
.hd-ico img{position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);image-rendering:pixelated}
.hd-ico.plain{--rar:#6e5a38}
.hd-ico .lv{position:absolute;right:-2px;bottom:-4px;font:10px var(--f-pix);color:#1b1408;background:var(--gold);padding:1px 3px;border:1px solid #2a1406}

.hd-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.hd-item{display:flex;align-items:center;gap:12px;padding:7px 10px;text-align:left;width:100%;font:13px var(--f-ui);color:var(--ink);
  background:rgba(255,255,255,.03);border:2px solid transparent;cursor:pointer;outline:none;letter-spacing:.04em}
.hd-item:hover{background:rgba(255,255,255,.07)}
.hd-item:focus{border-color:#ffcf4a;background:rgba(255,200,90,.12);box-shadow:0 0 0 2px #05060a,0 0 16px rgba(255,200,90,.4)}
.hd-item[aria-pressed=true]{border-color:#6e5a38;background:rgba(233,196,106,.09)}
.hd-item .grow{flex:1;min-width:0}
.hd-item .nm{font-size:14px;color:var(--gold-hi)}

.hd-seg{display:inline-flex;gap:0}
.hd-seg .hd-btn{margin-left:-2px}
.hd-seg .hd-btn[aria-pressed=true]{color:#1b1408;background:linear-gradient(180deg,#f4d690,#c99a3c);border-color:#fff0b8}

.hd-toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:80;padding:8px 18px;background:rgba(10,9,18,.95);
  border:2px solid var(--gold);color:var(--gold-hi);letter-spacing:.08em;pointer-events:none}

.hd-modal{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(3,2,8,.72)}
.hd-modal .hd-panel{max-width:min(720px,92vw);max-height:88vh;overflow:auto}

/* in-level overlay + scrollbars */
.hd-root *::-webkit-scrollbar{width:10px}
.hd-root *::-webkit-scrollbar-thumb{background:#4a3c24;border:2px solid #0a0710}
.hd-root *::-webkit-scrollbar-track{background:#0a0710}
@media (prefers-reduced-motion:reduce){.hd-btn{transition:none}}
`;

let injected = false;
/** Inject the shared theme once. */
export function injectUiTheme(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const st = document.createElement("style");
  st.id = "hd-ui-theme";
  st.textContent = UI_CSS;
  document.head.append(st);
}
