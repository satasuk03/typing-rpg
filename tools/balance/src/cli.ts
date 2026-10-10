// pnpm balance [--chapter N] [--seeds N] [--workers N] [--no-noise] [--persona id,id] [--level ch1-l05,...] [--json path] [--md path]
//              [--gear par|par-N|armor+N|weapon+N|all+N] [--kit starter|bare] [--whatif key=value,...] [--strict]
// Runs the economy_sim personas through Chapter 1 on the real sim and prints the plan §9 verdicts, the parity with the
// Python model, and per-level tables. Exit code 1 when a §9 or parity cell FAILs (PASS(±15%) passes; a documented
// structural miss, FAIL*, only fails with --strict).
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gearLabel, parseGear } from "./gear.ts";
import { PERSONAS, type PersonaId } from "./personas.ts";
import { buildReport, markdown } from "./report.ts";
import { chapterLevels, type Job, runJobs } from "./runner.ts";
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
const chapter = Number(opt("--chapter") ?? 1);
const levels = opt("--level")?.split(",") ?? chapterLevels(chapter);
const here = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(opt("--json") ?? resolve(here, `../out/balance-ch${chapter}.json`));
const mdPath = opt("--md");
const whatif = parseWhatIf(opt("--whatif"));
const gear = gearLabel(parseGear(opt("--gear")));
const kit = (opt("--kit") ?? "starter") as "starter" | "bare";

const jobs: Job[] = [];
for (const persona of personas)
  for (const levelId of levels) jobs.push({ persona, levelId, seeds, noise, whatif, kit, gear });

const t0 = process.hrtime.bigint();
const results = await runJobs(jobs, workers);
const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
const rep = buildReport(results, {
  seeds,
  noise,
  workers,
  seconds,
  whatif,
  ...(gear === "par" ? {} : { gear }),
  ...(chapter === 1 ? {} : { chapter }),
});
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
  // Chapters other than 1 run on placeholder targets (T1.1): informational until T5.1.
  if (chapter === 1) process.exitCode = 1;
  else console.log("(chapter > 1 verdicts are informational until T5.1; exit code unaffected)");
}
