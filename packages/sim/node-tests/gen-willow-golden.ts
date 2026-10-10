// Writes tests/fixtures/golden-willow.json (the Whispering Willow fixture replays, T1.3).
// Run: node packages/sim/node-tests/gen-willow-golden.ts
// A NEW file: it never touches golden-typing.json. Regenerate it only with a deliberate sim change to the riddle / Willow flow.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { willowGoldens } from "../tests/willowGolden.ts";

const dest = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/golden-willow.json",
);
const out = {
  description:
    "Reference-bot replays of the Whispering Willow fixture (tests/willowFixture.ts: phase-1 Shade+Mender adds, exact-case Hush Spells, 5 riddles, finisher), replayed through replay(): final-state hash and event-stream hash. Shared by the Node determinism test and the Chromium parity test.",
  simVersion: 1,
  goldens: willowGoldens(),
};
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.goldens));
