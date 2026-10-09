import type { ContentBundle } from "@hd2d/content";
import {
  biomePool,
  letterHistogram,
  passageStats,
  ruleSchema,
  runAllRules,
  tierPool,
  usePool,
} from "./rules.ts";
import { type Filters, type Issue, issue, type RuleInput } from "./types.ts";
import { computeContentVersion, readWrittenVersion } from "./version.ts";

export function inputFromBundle(bundle: ContentBundle): RuleInput {
  return {
    words: bundle.words,
    passages: bundle.trials.flatMap((t) => t.passages),
    levels: bundle.levels,
  };
}

export interface ValidationReport {
  issues: Issue[];
  version: string;
  summary: string;
  ok: boolean;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const histLine = (ws: readonly { text: string }[]): string => {
  const h = letterHistogram(ws);
  return [...ALPHABET].map((l) => `${l}${h[l] ?? 0}`).join(" ");
};

export function validateBundle(
  bundle: ContentBundle,
  filters: Filters,
  opts: { checkWrittenVersion: boolean } = { checkWrittenVersion: true },
): ValidationReport {
  const issues: Issue[] = ruleSchema(bundle);
  const input = inputFromBundle(bundle);
  issues.push(...runAllRules(input, filters));
  const version = computeContentVersion(bundle);
  if (opts.checkWrittenVersion) {
    const written = readWrittenVersion();
    if (written !== version) {
      issues.push(
        issue(
          "version",
          "error",
          `content-version.generated.ts has ${written}; computed ${version}. Run: pnpm --filter @hd2d/content-tools build-version`,
        ),
      );
    }
  }
  const w = input.words;
  const lines: string[] = ["== content validate =="];
  lines.push("-- pools (entries) --");
  for (const t of [1, 2]) lines.push(`  T${t} plate words: ${tierPool(w, t).length}`);
  for (const b of ["forest", "ruins", "cave"])
    lines.push(`  biome ${b}: ${biomePool(w, b).length}`);
  for (const u of ["guard", "doom", "finisher", "secondWind", "minigame"] as const) {
    lines.push(`  ${u}: ${usePool(w, u).length}`);
  }
  lines.push(`  total word entries: ${w.length}`);
  lines.push(`  trial passages: ${input.passages.length}`);
  lines.push("-- first-letter distribution (a..z counts) --");
  for (const t of [1, 2]) lines.push(`  T${t}: ${histLine(tierPool(w, t))}`);
  for (const b of ["forest", "ruins", "cave"]) lines.push(`  ${b}: ${histLine(biomePool(w, b))}`);
  for (const u of ["guard", "doom", "secondWind", "minigame"] as const) {
    lines.push(`  ${u}: ${histLine(usePool(w, u))}`);
  }
  if (input.passages.length > 0) {
    const st = input.passages.map(passageStats);
    const range = (f: (s: (typeof st)[number]) => number): [number, number, number] => {
      const v = st.map(f);
      return [Math.min(...v), v.reduce((a, b) => a + b, 0) / v.length, Math.max(...v)];
    };
    const fmt = ([a, m, b]: [number, number, number], d: number, k = 1): string =>
      `min ${(a * k).toFixed(d)} avg ${(m * k).toFixed(d)} max ${(b * k).toFixed(d)}`;
    lines.push("-- trial passage stats --");
    lines.push(
      `  chars: ${fmt(
        range((s) => s.chars),
        0,
      )}`,
    );
    lines.push(
      `  words: ${fmt(
        range((s) => s.words),
        0,
      )}`,
    );
    lines.push(
      `  avg word length: ${fmt(
        range((s) => s.avgWordLen),
        2,
      )}`,
    );
    lines.push(
      `  punctuation density %: ${fmt(
        range((s) => s.punctDensity),
        2,
        100,
      )}`,
    );
    lines.push(
      `  avg sentence words: ${fmt(
        range((s) => s.avgSentenceWords),
        1,
      )}`,
    );
  }
  lines.push(`CONTENT_VERSION: ${version}`);
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  for (const i of issues) lines.push(`  ${i.severity.toUpperCase()} [${i.rule}] ${i.message}`);
  lines.push(
    errors.length === 0
      ? `PASS (${warns.length} warnings)`
      : `FAIL (${errors.length} errors, ${warns.length} warnings)`,
  );
  return { issues, version, summary: lines.join("\n"), ok: errors.length === 0 };
}
