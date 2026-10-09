// Isomorphic (browser, Node >= 18, Workers) compression + base64 helpers (docs/interfaces.md §9.1 and §9.3).
// Built on CompressionStream / DecompressionStream; no dependencies.

export class InflateError extends Error {
  override name = "InflateError";
}
/** Decompressed output exceeded the caller's cap (zip-bomb guard). */
export class InflateLimitError extends InflateError {
  override name = "InflateLimitError";
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

/** Throws on invalid base64. */
export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

type Format = "deflate-raw" | "gzip";

async function compress(bytes: Uint8Array, format: Format): Promise<Uint8Array> {
  const cs = new CompressionStream(format);
  const w = cs.writable.getWriter();
  w.write(bytes as BufferSource).catch(() => {});
  w.close().catch(() => {});
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** Decompress with a hard output cap. Throws InflateLimitError when exceeded, InflateError on corrupt input. */
async function decompress(
  bytes: Uint8Array,
  format: Format,
  maxOutput: number,
): Promise<Uint8Array> {
  const ds = new DecompressionStream(format);
  const w = ds.writable.getWriter();
  w.write(bytes as BufferSource).catch(() => {});
  w.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxOutput) {
        await reader.cancel().catch(() => {});
        throw new InflateLimitError(`decompressed data exceeds ${maxOutput} bytes`);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof InflateError) throw e;
    throw new InflateError(`invalid ${format} data`);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export const deflateRaw = (bytes: Uint8Array): Promise<Uint8Array> =>
  compress(bytes, "deflate-raw");
export const inflateRaw = (bytes: Uint8Array, maxOutput: number): Promise<Uint8Array> =>
  decompress(bytes, "deflate-raw", maxOutput);
export const gzip = (bytes: Uint8Array): Promise<Uint8Array> => compress(bytes, "gzip");
export const gunzip = (bytes: Uint8Array, maxOutput: number): Promise<Uint8Array> =>
  decompress(bytes, "gzip", maxOutput);

/** hdk1 wire form: base64(deflateRaw(bytes)) (§9.3). */
export async function encodeLogWire(hdk1: Uint8Array): Promise<string> {
  return bytesToB64(await deflateRaw(hdk1));
}
/** Inverse of encodeLogWire with an output cap (the Worker uses 32 KiB). */
export async function decodeLogWire(wire: string, maxOutput: number): Promise<Uint8Array> {
  let raw: Uint8Array;
  try {
    raw = b64ToBytes(wire);
  } catch {
    throw new InflateError("invalid base64");
  }
  return inflateRaw(raw, maxOutput);
}

/** Save wire form: base64(gzip(utf8(JSON.stringify(save)))) (§9.1). */
export async function encodeSaveWire(save: unknown): Promise<string> {
  return bytesToB64(await gzip(new TextEncoder().encode(JSON.stringify(save))));
}
/** Decoded JSON (unvalidated: run it through migrateSave / SaveBlob). Cap = 256 KiB per §9.1. */
export async function decodeSaveWire(wire: string, maxOutput = 256 * 1024): Promise<unknown> {
  let raw: Uint8Array;
  try {
    raw = b64ToBytes(wire);
  } catch {
    throw new InflateError("invalid base64");
  }
  const text = new TextDecoder().decode(await gunzip(raw, maxOutput));
  try {
    return JSON.parse(text);
  } catch {
    throw new InflateError("save is not valid JSON");
  }
}
