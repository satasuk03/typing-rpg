import { describe, expect, test } from "vitest";
import {
  BP,
  bp,
  clampInt,
  cmpStr,
  divCeil,
  divFloor,
  divRound,
  isqrt,
  MILLI,
  milli,
  mulBp,
  mulDiv,
  SimError,
  toDisplay,
} from "../src/index.ts";

describe("fixed-point helpers", () => {
  test("constants", () => {
    expect(BP).toBe(10_000);
    expect(MILLI).toBe(1_000);
  });
  test("mulBp floors", () => {
    expect(mulBp(100_000, 12_500)).toBe(125_000);
    expect(mulBp(1_000, 3_333)).toBe(333);
    expect(mulBp(1, 9_999)).toBe(0);
    expect(mulBp(0, 12_500)).toBe(0);
  });
  test("mulBp floors toward -infinity for negatives (documented)", () => {
    expect(mulBp(-1, 9_999)).toBe(-1);
  });
  test("mulBp / mulDiv throw instead of losing precision", () => {
    expect(() => mulBp(2 ** 50, 10_000)).toThrow(SimError);
    expect(() => mulDiv(2 ** 30, 2 ** 30, 3)).toThrow(SimError);
    expect(mulDiv(7, 3, 2)).toBe(10);
  });
  test("divFloor / divCeil / divRound", () => {
    expect(divFloor(7, 2)).toBe(3);
    expect(divCeil(7, 2)).toBe(4);
    expect(divCeil(6, 2)).toBe(3);
    expect(divRound(7, 2)).toBe(4); // 3.5 rounds half up
    expect(divRound(5, 3)).toBe(2); // 1.67
    expect(divRound(4, 3)).toBe(1); // 1.33
    expect(divRound(0, 3)).toBe(0);
  });
  test("clampInt", () => {
    expect(clampInt(5, 1, 3)).toBe(3);
    expect(clampInt(-5, 1, 3)).toBe(1);
    expect(clampInt(2, 1, 3)).toBe(2);
  });
  test("isqrt matches floor(sqrt) for small n and perfect squares/neighbours at scale", () => {
    for (let n = 0; n <= 5000; n++) expect(isqrt(n)).toBe(Math.floor(Math.sqrt(n)));
    for (const r of [1, 7, 1000, 94906265]) {
      expect(isqrt(r * r)).toBe(r);
      expect(isqrt(r * r - 1)).toBe(r - 1);
      expect(isqrt(r * r + 1)).toBe(r);
    }
    expect(isqrt(Number.MAX_SAFE_INTEGER)).toBe(94906265);
  });
  test("isqrt rejects bad input", () => {
    expect(() => isqrt(-1)).toThrow(SimError);
    expect(() => isqrt(1.5)).toThrow(SimError);
  });
  test("bp / milli round at init", () => {
    expect(bp(0.3)).toBe(3_000);
    expect(bp(1.25)).toBe(12_500);
    expect(milli(0.5)).toBe(500);
  });
  test("toDisplay never shows a positive amount as 0", () => {
    expect(toDisplay(0)).toBe(0);
    expect(toDisplay(-5)).toBe(0);
    expect(toDisplay(1)).toBe(1);
    expect(toDisplay(499)).toBe(1);
    expect(toDisplay(1_500)).toBe(2);
    expect(toDisplay(100_000)).toBe(100);
  });
  test("cmpStr is code-unit order (uppercase before lowercase, no locale)", () => {
    expect(cmpStr("a", "b")).toBe(-1);
    expect(cmpStr("b", "a")).toBe(1);
    expect(cmpStr("a", "a")).toBe(0);
    expect(cmpStr("Z", "a")).toBe(-1);
    expect(cmpStr("a", "ab")).toBe(-1);
    expect(["b", "B", "a", "A", "é"].sort(cmpStr)).toEqual(["A", "B", "a", "b", "é"]);
  });
});
