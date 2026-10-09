#!/usr/bin/env bash
# Quality gate: typecheck -> lint -> unit tests -> sim determinism -> sim purity grep.
# No e2e (run `pnpm test:e2e` separately).
set -euo pipefail
cd "$(dirname "$0")/.."

step() {
  echo
  echo "==> $1"
}

failed=""
trap 'echo; echo "CHECK FAIL: ${failed:-unknown step}"' ERR

failed="typecheck"; step "typecheck"; pnpm -s typecheck
failed="lint"; step "lint (biome)"; pnpm -s lint
failed="unit tests"; step "unit tests"; pnpm -s test
failed="sim determinism"; step "sim determinism test"
pnpm -s exec vitest run --reporter=verbose --project @hd2d/sim packages/sim/tests/determinism.test.ts

failed="sim purity"; step "sim purity grep"
# Backstop for Biome's noRestricted* rules: forbidden tokens in packages/sim/src and tests.
pattern='Math\.random|\bDate\b|performance\.|\bsetTimeout\b|\bsetInterval\b|\bwindow\b|\bdocument\b|from ["'"'"']three|require\(["'"'"']three'
if grep -rnE "$pattern" packages/sim/src packages/sim/tests --include='*.ts' \
  | grep -v 'determinism.test.ts:.*no wall-clock' ; then
  echo "sim purity violations found (see above)"
  exit 1
fi
echo "sim purity ok"

trap - ERR
echo
echo "CHECK PASS"
