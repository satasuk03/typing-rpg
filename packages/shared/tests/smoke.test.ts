import { expect, test } from "vitest";
import { PACKAGE } from "../src/index.ts";

test("shared placeholder", () => {
  expect(PACKAGE).toBe("@hd2d/shared");
});
