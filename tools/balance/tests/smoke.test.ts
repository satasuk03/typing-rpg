import { expect, test } from "vitest";
import { run } from "../src/index.ts";

test("cli stub", () => {
  expect(run()).toContain("not implemented yet");
});
