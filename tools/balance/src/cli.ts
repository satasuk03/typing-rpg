// pnpm balance [--chapter N] [--seeds N] [--workers N] [--no-noise] [--persona id,id] [--level ch1-l05,...] [--json path] [--md path]
//              [--gear par|par-N|armor+N|weapon+N|all+N] [--kit starter|bare|ch2|ch2-reveal] [--whatif key=value,...] [--strict]
// Runs the economy_sim personas through a chapter (default 1) on the real sim and prints the target verdicts (Ch1: plan §9;
// Ch2: CH2_PLAN §4.2), the parity with the Python model, and per-level tables. Exit code 1 when a target or parity cell
// FAILs (PASS(±15%) passes; a documented structural miss, FAIL*, only fails with --strict).
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gearLabel, parseGear } from "./gear.ts";
import { PERSONAS, type PersonaId } from "./personas.ts";
import { buildReport, markdown } from "./report.ts";
import { chapterLevels, type Job, KITS, type Kit, runJobs } from "./runner.ts";
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
const kitArg = opt("--kit");
if (kitArg !== undefined && !KITS.includes(kitArg as Kit))
  throw new Error(`--kit: expected ${KITS.join(" | ")}, got "${kitArg}"`);
// Absent = the chapter's default kit (runner.ts defaultKit: Ch1 starter, Ch2 "the Ch2 player").
const kit = kitArg as Kit | undefined;

const jobs: Job[] = [];
for (const persona of personas)
  for (const levelId of levels)
    jobs.push({
      persona,
      levelId,
      seeds,
      noise,
      whatif,
      gear,
      ...(kit === undefined ? {} : { kit }),
    });

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
  ...(kit === undefined ? {} : { kit }),
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
  // Ch1 and Ch2 have real targets (Ch2: T5.1, CH2_PLAN §4.2). In Ch2 a gear offset or a non-default kit is a lever check,
  // not the balance contract, so it reports but does not fail (Ch1 keeps its pre-T5.1 behaviour).
  if (chapter === 1 || (gear === "par" && kit === undefined)) process.exitCode = 1;
  else console.log("(gear offset / --kit runs are lever checks; exit code unaffected)");
}
