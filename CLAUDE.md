# HD-2D Typing RPG

This is a browser game for practicing English typing, made in an Octopath-style HD-2D pixel-art look. It runs on desktop only.

## Start here
- **Plan:** `docs/IMPLEMENTATION_PLAN.md`. It describes the Chapter 1 vertical slice, its milestones, agent roles and quality gates.
- **Locked decisions:** `docs/brainstorm/00-overview.md` §6. These override the older brainstorm docs 01–04.
- **Status:** `docs/STATUS.md` (the orchestrator maintains it).
- **Rendering reference:** `poc/hd2d-poc-v2.html`. Port from it; never import it.

## Stack
- **Game:** three.js (WebGL2), TypeScript (strict), Vite, pnpm workspaces.
- **Backend:** Cloudflare Workers (Hono) + D1 + KV.
- **Tests:** Vitest; Playwright for browser bots and screenshots.
- **Content:** Aseprite for sprites; LDtk or Tiled JSON for levels.

## Non-negotiables
- `packages/sim` is pure and deterministic.
  - It has no DOM, no three.js, no `Math.random`, and no wall-clock time.
  - It uses a seeded RNG, a 60 Hz fixed tick, and inputs given as `{tick, key}`.
  - The renderer, HUD and audio only consume sim events and state.
  - The same sim runs in the client, the Worker anti-cheat and the balance tools.
- **Typing words must stay readable.** The HUD canvas draws above WebGL, so VFX never cover word plates.
- **The art bar is high.** Match or beat `poc/v2-*.png`. Render or VFX changes need before/after screenshots.
- **Typing must feel spectacular.** Every keystroke and every finished word gets rich VFX and SFX (plan T2.6). The next letter to type must always stay legible.
- **Desktop only.** Don't add mobile or touch support.
- **Fair monetization.** Ranked modes use standardized gear, and all lootbox odds are fixed and published.
- Before reporting a task done, run `scripts/check.sh` and attach the evidence for its acceptance criteria.
- Agents write only inside the paths they own (plan §6). Changes to shared interfaces go through `docs/interfaces.md`.

## Agent policy
- Workers use Sonnet (`model: "sonnet"`).
- Deep reasoning, design reviews and the Reviewer role use Opus (`model: "opus"`).
- **At most 3 agents run at the same time.**
- Don't use any orchestration skill. The orchestrator session uses the Agent tool directly.
