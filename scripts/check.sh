#!/usr/bin/env bash
# Quality gate: typecheck -> lint -> unit tests -> sim determinism -> sim purity grep -> Node/Chromium parity.
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
# Backstop for Biome's restricted-global rules. Comments are stripped before matching (scripts/sim-purity.mjs).
# src: also bans approximated Math.*, **, localeCompare, Intl and structuredClone. tests: wall-clock/DOM/three bans only.
node scripts/sim-purity.mjs --strict packages/sim/src
node scripts/sim-purity.mjs packages/sim/tests
echo "sim purity ok"

failed="sim parity"; step "sim Node vs Chromium parity"
pnpm -s --filter @hd2d/sim test:parity

trap - ERR
echo
echo "CHECK PASS"
