import { contentBundle } from "@hd2d/content";
import { loadFilters } from "./filters.ts";
import { validateBundle } from "./validate.ts";
import { computeContentVersion, readWrittenVersion, writeVersionFile } from "./version.ts";

const cmd = process.argv[2] ?? "validate";

if (cmd === "build-version") {
  const v = computeContentVersion(contentBundle);
  if (readWrittenVersion() !== v) writeVersionFile(v);
  console.log(`CONTENT_VERSION ${v}`);
} else if (cmd === "validate") {
  const report = validateBundle(contentBundle, loadFilters());
  console.log(report.summary);
  process.exit(report.ok ? 0 : 1);
} else {
  console.error(`unknown command: ${cmd} (use validate | build-version)`);
  process.exit(2);
}
