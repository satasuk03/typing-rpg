// Regenerates tests/fixtures/golden-trial.json. Run: node packages/sim/node-tests/gen-trial-golden.ts
// Regenerate ONLY with a deliberate SIM_VERSION-affecting change (docs/interfaces.md §1.3, §11).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trialGoldens } from "../tests/trialHarness.ts";

const dest = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/golden-trial.json",
);
const out = {
  description:
    "Scripted Typing Trial sessions (tests/trialHarness.ts) on a synthetic 4-passage pool, replayed through replayTrial(): final-state hash, hdk1 log hash and result per seed. Shared by the Node determinism test and the Chromium parity test. Regenerate only with a SIM_VERSION change.",
  simVersion: 1,
  goldens: trialGoldens(),
};
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.goldens));
