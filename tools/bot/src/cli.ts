// pnpm bot [--chapter N] [--quick] [--seeds N] [--workers N] [--gimmicks free|realistic] [--compare-gimmicks]
// Headless sim gate: every level (Ch1 + Ch2 by default, --chapter 1|2 for one) x 3 personas x N seeds. Exit 1 on any
// failure. --quick = 5 seeds (check.sh). Each chapter is gated separately (own targets/boss), so Ch1 rows never change.
import { MAIN_PERSONAS } from "@hd2d/balance";
import { type GateResult, gimmickDeltas, pct, runGate, table } from "./index.ts";

const args = process.argv.slice(2);
const opt = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const quick = args.includes("--quick");
const seeds = Number(opt("--seeds") ?? (quick ? 5 : 20));
const workers = opt("--workers") === undefined ? undefined : Number(opt("--workers"));
const chapterArg = opt("--chapter") ?? "all";
const chapters = chapterArg === "all" ? [1, 2] : [Number(chapterArg)];
const gimmicks = (opt("--gimmicks") ?? "free") as "free" | "realistic";
const compare = args.includes("--compare-gimmicks");

const show = (title: string, g: GateResult, secs: number): void => {
  console.log(
    `\n${title}: ${seeds} seeds x ${MAIN_PERSONAS.length} personas, ${g.runs} runs, ${secs.toFixed(1)}s`,
  );
  console.log("first-try clears (cleared/seeds, %, mean active minutes incl. results screen)");
  console.log(table(g.cells, MAIN_PERSONAS));
};

let failures: string[] = [];
for (const chapter of chapters) {
  const t0 = Date.now();
  const g = await runGate({ seeds, workers, gimmicks, chapter });
  show(
    `bot gate${chapter === 1 ? "" : ` ch${chapter}`} [gimmicks=${gimmicks}${quick ? ", quick" : ""}]`,
    g,
    (Date.now() - t0) / 1000,
  );
  failures = [
    ...failures,
    ...g.failures.map((x) => (chapters.length > 1 ? `[ch${chapter}] ${x}` : x)),
  ];
}

if (compare) {
  const t1 = Date.now();
  const otherMode = gimmicks === "free" ? "realistic" : "free";
  const chapter = chapters[0] ?? 1;
  const g = await runGate({ seeds, workers, gimmicks, chapter });
  const other = await runGate({ seeds, workers, gimmicks: otherMode, chapter });
  const [free, real] = gimmicks === "free" ? [g, other] : [other, g];
  show(`comparison run [gimmicks=${otherMode}]`, other, (Date.now() - t1) / 1000);
  console.log("\ngimmick realism delta (free -> realistic)");
  const f = (xs: number[]): string => xs.map((x) => x.toFixed(2)).join(" ");
  for (const d of gimmickDeltas(free, real)) {
    console.log(
      `${d.persona}: boss clear ${pct(d.bossClearFree)} -> ${pct(d.bossClearReal)}; boss min ${d.bossMinFree.toFixed(2)} -> ${d.bossMinReal.toFixed(2)}`,
    );
    console.log(`  L4-L9 min free:      ${f(d.levelMinFree)}`);
    console.log(`  L4-L9 min realistic: ${f(d.levelMinReal)}`);
    console.log(
      `  per run: ${d.decodedPerRun.toFixed(1)} decodes, ${d.unreadFadedPerRun.toFixed(1)} unread faded words`,
    );
  }
  failures = [...failures, ...other.failures.map((x) => `[${otherMode}] ${x}`)];
}

if (failures.length > 0) {
  console.log(`\nBOT FAIL (${failures.length})`);
  for (const x of failures.slice(0, 40)) console.log(`  - ${x}`);
  process.exitCode = 1;
} else {
  console.log(
    "\nBOT PASS: all levels cleared per persona, targets met, no exceptions, no timeouts, deterministic",
  );
}
