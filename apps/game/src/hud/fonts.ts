/**
 * Self-hosted HUD fonts (@fontsource, SIL OFL 1.1; licences ship inside each package).
 * No third-party requests: Vite bundles the woff2 files. Layout is measurement-based, so the
 * monospace/serif fallbacks in theme.ts still work if loading fails.
 */

let loading: Promise<void> | null = null;

export function loadHudFonts(timeoutMs = 3000): Promise<void> {
  if (loading) return loading;
  const work = (async () => {
    await Promise.all([
      import("@fontsource/press-start-2p/latin-400.css"),
      import("@fontsource/silkscreen/latin-400.css"),
      import("@fontsource/silkscreen/latin-700.css"),
      import("@fontsource/cinzel/latin-700.css"),
      import("@fontsource/cinzel/latin-900.css"),
    ]);
    await Promise.all(
      [
        '22px "Press Start 2P"',
        '12px "Silkscreen"',
        '700 12px "Silkscreen"',
        '700 22px "Cinzel"',
        '900 22px "Cinzel"',
      ].map((f) => document.fonts.load(f).catch(() => [])),
    );
  })().catch(() => undefined);
  loading = Promise.race([work, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
  return loading;
}
