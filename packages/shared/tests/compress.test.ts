import { describe, expect, test } from "vitest";
import {
  b64ToBytes,
  bytesToB64,
  decodeLogWire,
  decodeSaveWire,
  encodeLogWire,
  encodeSaveWire,
  InflateError,
  InflateLimitError,
} from "../src/index.ts";

describe("compress", () => {
  test("base64 round trip incl. large arrays", () => {
    const b = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
    expect(b64ToBytes(bytesToB64(b))).toEqual(b);
  });

  test("log wire round trip", async () => {
    const b = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 251);
    expect(await decodeLogWire(await encodeLogWire(b), 32 * 1024)).toEqual(b);
  });

  test("output cap rejects a zip bomb; garbage and bad base64 throw InflateError", async () => {
    const bomb = await encodeLogWire(new Uint8Array(200_000));
    await expect(decodeLogWire(bomb, 32 * 1024)).rejects.toBeInstanceOf(InflateLimitError);
    await expect(decodeLogWire(btoa("definitely not deflate"), 1000)).rejects.toBeInstanceOf(
      InflateError,
    );
    await expect(decodeLogWire("!!", 1000)).rejects.toBeInstanceOf(InflateError);
  });

  test("save wire round trip (gzip)", async () => {
    const save = { schemaVersion: 1, a: [1, 2, 3], s: "héllo" };
    expect(await decodeSaveWire(await encodeSaveWire(save))).toEqual(save);
  });
});
