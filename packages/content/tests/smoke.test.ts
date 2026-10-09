import { expect, test } from "vitest";
import { PACKAGE } from "../src/index.ts";

test("content placeholder", () => {
  expect(PACKAGE).toBe("@hd2d/content");
});
