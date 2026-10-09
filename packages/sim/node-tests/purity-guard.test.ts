import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, "../../../scripts/sim-purity.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sim-purity-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
function run(source: string, strict = true): { code: number; out: string } {
  const dir = path.join(tmp, `case${n++}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "x.ts"), source);
  const r = spawnSync("node", [script, ...(strict ? ["--strict"] : []), dir], { encoding: "utf8" });
  return { code: r.status ?? -1, out: r.stdout };
}

const violations: [string, string][] = [
  ["Math.pow", "export const f = (a: number) => Math.pow(a, 2);"],
  ["Math.sqrt", "export const f = (a: number) => Math.sqrt(a);"],
  ["Math.exp", "export const f = (a: number) => Math.exp(a);"],
  ["Math.log", "export const f = (a: number) => Math.log(a);"],
  ["Math.sin", "export const f = (a: number) => Math.sin(a);"],
  ["Math.cos", "export const f = (a: number) => Math.cos(a);"],
  ["Math.tan", "export const f = (a: number) => Math.tan(a);"],
  ["Math.atan2", "export const f = (a: number) => Math.atan2(a, 1);"],
  ["Math.hypot", "export const f = (a: number) => Math.hypot(a, 1);"],
  ["Math.cbrt", "export const f = (a: number) => Math.cbrt(a);"],
  ["** operator", "export const f = (a: number) => a ** 2;"],
  ["**= operator", "export let g = 2; g **= 2;"],
  ["localeCompare", 'export const f = (a: string) => a.localeCompare("b");'],
  ["Intl", "export const f = () => new Intl.NumberFormat();"],
  ["structuredClone", "export const f = (a: object) => structuredClone(a);"],
  ["Math.random", "export const f = () => Math.random();"],
  ["Date", "export const f = () => Date.now();"],
  ["window", "export const f = () => window.innerWidth;"],
];

describe("sim purity guard", () => {
  for (const [name, src] of violations) {
    test(`fails on ${name}`, () => {
      const r = run(src);
      expect(r.code).toBe(1);
      expect(r.out).toContain("x.ts:1");
    });
  }

  test("passes once the violation is removed", () => {
    expect(run("export const f = (a: number) => Math.pow(a, 2);").code).toBe(1);
    expect(run("export const f = (a: number) => a * a;").code).toBe(0);
  });

  test("allowed Math.* members pass", () => {
    const src =
      "export const f = (a: number) => Math.floor(a) + Math.imul(a, 3) + Math.max(a, 1) + Math.min(a, 2) + Math.round(a) + Math.trunc(a);";
    expect(run(src).code).toBe(0);
  });

  test("comments (line, block, doc) are ignored, so '/**' and prose do not false-positive", () => {
    const src = [
      "/**",
      " * Uses a window of ticks, never Date or Math.sqrt, a ** b, Intl, localeCompare or structuredClone.",
      " */",
      "/* Math.pow(1,2) */",
      "// document.title and Math.random",
      "export const f = (a: number) => a + 1; // trailing window Date",
    ].join("\n");
    expect(run(src).code).toBe(0);
  });

  test("a comment-like sequence inside a string is still code, and a violation after a block comment is caught", () => {
    expect(
      run('export const u = "http://x"; export const f = (a: number) => Math.sqrt(a);').code,
    ).toBe(1);
    expect(run("/* c */ export const f = (a: number) => a ** 2;").code).toBe(1);
  });

  test("regex literals with slashes and quotes do not derail comment stripping", () => {
    const src =
      "export const re = /[\"'\\/]+/g; export const f = (a: number) => Math.sqrt(a); // done";
    expect(run(src).code).toBe(1);
  });

  test("template literals with ${} are handled", () => {
    expect(run("export const f = (a: number) => `x ${a + 1} // y`; // c").code).toBe(0);
    expect(run("export const f = (a: number) => `x ${Math.sqrt(a)}`;").code).toBe(1);
  });

  test("non-strict mode (tests dirs) only applies the wall-clock/DOM bans", () => {
    expect(run("export const f = (a: number) => Math.sqrt(a) ** 2;", false).code).toBe(0);
    expect(run("export const f = () => Date.now();", false).code).toBe(1);
  });

  test("the real packages/sim/src is clean", () => {
    const r = spawnSync("node", [script, "--strict", path.resolve(here, "../src")], {
      encoding: "utf8",
    });
    expect(r.stdout).toBe("");
    expect(r.status).toBe(0);
  });
});
