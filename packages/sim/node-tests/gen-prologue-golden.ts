// Writes tests/fixtures/golden-prologue.json (the prologue fixture replays, P1.1).
// Run: node packages/sim/node-tests/gen-prologue-golden.ts
// A NEW file: it never touches the existing goldens. Regenerate only with a deliberate change to the prologue rules.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prologueGoldens } from "../tests/prologueGolden.ts";

const dest = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/golden-prologue.json",
);
const out = {
  description:
    "Scripted-typist replays of the prologue fixture (tests/prologueFixture.ts: the 6-skill kit, HP floor, surge, climax): final-state hash and event-stream hash through replay(). Shared by the Node determinism test and the Chromium parity test.",
  simVersion: 1,
  goldens: prologueGoldens(),
};
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.goldens));
