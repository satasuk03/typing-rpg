/**
 * Touch-device block screen. The game needs a physical keyboard and does not support touch (CLAUDE.md: desktop only),
 * so a touch-only device gets this notice instead of the game. It has no controls on purpose.
 */
import { loadHudFonts } from "../../hud/fonts";
import { injectUiTheme } from "../../hud/uiTheme";
import { APP_CSS } from "../style";

export function showTouchBlock(): HTMLElement {
  injectUiTheme();
  void loadHudFonts();
  if (!document.getElementById("hd-app-css")) {
    const st = document.createElement("style");
    st.id = "hd-app-css";
    st.textContent = APP_CSS;
    document.head.append(st);
  }
  const legacy = document.getElementById("no-touch");
  legacy?.remove();
  const root = document.createElement("div");
  root.id = "touch-block";
  root.className = "hd-root touch-block";
  root.setAttribute("role", "alert");
  root.innerHTML = `<div class="tb-card hd-panel">
      <div class="hd-eyebrow">Typing Adventure</div>
      <h1 class="hd-title">KEYBOARD REQUIRED</h1>
      <div class="tb-keys" aria-hidden="true">${"QWERTYUIOP"
        .split("")
        .map((k) => `<i>${k}</i>`)
        .join("")}<i class="wide"></i></div>
      <p class="hd-sub" style="margin:14px 0 4px">This is a typing game. It is built for a desktop or laptop with a physical keyboard.</p>
      <p class="hd-dim">Touch screens are not supported. Open this page on a computer to play.</p>
    </div>`;
  document.body.append(root);
  return root;
}
