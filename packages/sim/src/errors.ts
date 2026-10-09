/** Thrown for programming errors and invalid sim inputs (never used for control flow in a correct run). */
export class SimError extends Error {
  override name = "SimError";
}

/** Thrown by encodeLog / decodeLog. */
export class LogError extends Error {
  override name = "LogError";
}
