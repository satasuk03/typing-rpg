/**
 * The Typing Trial lives in its own scene (`?scene=trial`, dev/trialScene.ts, owned by the net task). The app links to
 * it with a full navigation and `from=app`; main.ts adds an "Esc: back to the menu" handover on that route.
 */
function apiParam(): string | null {
  const q = new URLSearchParams(location.search);
  const api = q.get("api") ?? (import.meta.env.VITE_API_URL as string | undefined) ?? null;
  return api && api !== "off" ? api : null;
}

export function trialUrl(): string {
  const out = new URLSearchParams({ scene: "trial", from: "app" });
  const api = apiParam();
  if (api) out.set("api", api);
  return `${location.pathname}?${out.toString()}`;
}

export function openTrial(): void {
  location.assign(trialUrl());
}

/** Back from the trial scene to the app (keeps `api` and the test flags that matter). */
export function appUrl(): string {
  const q = new URLSearchParams(location.search);
  const out = new URLSearchParams();
  for (const k of ["api", "audio", "fonts", "tier"]) {
    const v = q.get(k);
    if (v !== null) out.set(k, v);
  }
  const s = out.toString();
  return `${location.pathname}${s ? `?${s}` : ""}`;
}
