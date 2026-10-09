// Regenerates tests/fixtures/golden-typing.json. Run: node packages/sim/node-tests/gen-typing-golden.ts
// Regenerate ONLY with a deliberate SIM_VERSION-affecting change (docs/interfaces.md §1.3, §11).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { combatGoldens, typingGoldens } from "../tests/typingGolden.ts";

const dest = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/golden-typing.json",
);
const out = {
  description:
    "Scripted typing sessions (tests/typingHarness.ts scriptedSession) on the fixture level (goldens, combat on since T1.3) and reference-bot combat replays (combatGoldens: boss/sword, dagger+shields, glass hero with Second Wind, T1.5 Ruin Golem level at 40 and 20 WPM), replayed through replay(): final-state hash and event-stream hash. Shared by the Node determinism test and the Chromium parity test. Regenerate only with a SIM_VERSION change.",
  simVersion: 1,
  goldens: typingGoldens(),
  combatGoldens: combatGoldens(),
};
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.goldens));
