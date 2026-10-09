// packages/shared/src/errors.ts
import { z } from "zod";
export const ErrorCode = z.enum([
  "bad_request",
  "unauthorized",
  "token_expired",
  "refresh_invalid",
  "refresh_reused",
  "forbidden",
  "not_found",
  "save_conflict",
  "precondition_required",
  "payload_too_large",
  "rate_limited",
  "run_not_found",
  "run_expired",
  "run_already_submitted",
  "bad_signature",
  "version_mismatch",
  "log_invalid",
  "resim_mismatch",
  "timing_impossible",
  "internal",
]);
export const ErrorEnvelope = z.object({
  error: z.object({ code: ErrorCode, message: z.string(), details: z.unknown().optional() }),
});
