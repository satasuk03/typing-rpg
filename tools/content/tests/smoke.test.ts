import { contentBundle } from "@hd2d/content";
import { expect, test } from "vitest";
import { loadFilters, NAME, validateBundle } from "../src/index.ts";

test("tools package name", () => {
  expect(NAME).toBe("@hd2d/content-tools");
});

test("the shipped content bundle validates, including the written CONTENT_VERSION", () => {
  const report = validateBundle(contentBundle, loadFilters());
  expect(report.issues.filter((i) => i.severity === "error")).toEqual([]);
  expect(report.version).toMatch(/^[0-9a-f]{8}$/);
});
