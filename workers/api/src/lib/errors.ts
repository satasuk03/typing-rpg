import type { ErrorCode } from "@hd2d/shared";

export type Code = (typeof ErrorCode.options)[number];

export const STATUS_OF: Record<Code, number> = {
  bad_request: 400,
  unauthorized: 401,
  token_expired: 401,
  refresh_invalid: 401,
  refresh_reused: 401,
  forbidden: 403,
  not_found: 404,
  save_conflict: 409,
  precondition_required: 428,
  payload_too_large: 413,
  rate_limited: 429,
  run_not_found: 404,
  run_expired: 410,
  run_already_submitted: 409,
  bad_signature: 403,
  version_mismatch: 409,
  log_invalid: 422,
  resim_mismatch: 422,
  timing_impossible: 422,
  internal: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: Code,
    message: string,
    readonly details?: unknown,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
  get status(): number {
    return STATUS_OF[this.code];
  }
  body(): { error: { code: Code; message: string; details?: unknown } } & Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
      ...this.extra,
    };
  }
}
