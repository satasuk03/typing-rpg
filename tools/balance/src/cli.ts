// pnpm balance [--seeds N] [--workers N] [--no-noise] [--persona id,id] [--level ch1-l05,...] [--json path] [--md path]
//              [--kit starter|bare] [--whatif key=value,...] [--strict]
// Runs the economy_sim personas through Chapter 1 on the real sim and prints the plan §9 verdicts, the parity with the
// Python model, and per-level tables. Exit code 1 when a §9 or parity cell FAILs (PASS(±15%) passes; a documented
// structural miss, FAIL*, only fails with --strict).
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONAS, type PersonaId } from "./personas.ts";
import { buildReport, markdown } from "./report.ts";
import { CH1_LEVELS, type Job, runJobs } from "./runner.ts";
import { parseWhatIf } from "./whatif.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const seeds = Number(opt("--seeds") ?? 200);
const workers = Number(opt("--workers") ?? availableParallelism());
const noise = !args.includes("--no-noise");
const personas = (opt("--persona")?.split(",") ?? PERSONAS.map((p) => p.id)) as PersonaId[];
const levels = opt("--level")?.split(",") ?? CH1_LEVELS;
const here = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(opt("--json") ?? resolve(here, "../out/balance-ch1.json"));
const mdPath = opt("--md");
const whatif = parseWhatIf(opt("--whatif"));
const kit = (opt("--kit") ?? "starter") as "starter" | "bare";

const jobs: Job[] = [];
for (const persona of personas)
  for (const levelId of levels) jobs.push({ persona, levelId, seeds, noise, whatif, kit });

const t0 = process.hrtime.bigint();
const results = await runJobs(jobs, workers);
const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
const rep = buildReport(results, { seeds, noise, workers, seconds, whatif });
const md = markdown(rep);
console.log(md);
mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(rep, null, 2)}\n`);
if (mdPath !== undefined) writeFileSync(resolve(mdPath), `${md}\n`);
console.log(`\nJSON: ${jsonPath}`);
const strict = args.includes("--strict");
const bad = [...rep.cells, ...rep.parity].filter(
  (c) => c.verdict === "FAIL" || (strict && c.verdict === "FAIL*"),
);
if (bad.length > 0) {
  console.log(
    `\n${bad.length} failing cell(s): ${bad.map((c) => `${c.persona} ${c.metric}`).join("; ")}`,
  );
  process.exitCode = 1;
}
