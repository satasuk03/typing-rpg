// Typing Trial orchestration: /runs/start -> TrialRecorder -> /runs/submit (idempotent) -> leaderboard.
import { contentBundle } from "@hd2d/content";
import { resolveTrial } from "@hd2d/sim";
import type {
  ApiClient,
  LbTrialResponseT,
  RunSubmitBody,
  RunTicketT,
  SubmitResponseT,
} from "./apiClient.ts";
import type { AuthManager } from "./auth.ts";
import { ApiError, NetworkError } from "./errors.ts";
import { TrialRecorder } from "./trialRecorder.ts";

export interface TrialRun {
  ticket: RunTicketT;
  recorder: TrialRecorder;
}

export type SubmitOutcome =
  | { ok: true; response: SubmitResponseT }
  | {
      ok: false;
      error: ApiError | NetworkError;
      /** true when this ticket is spent/invalid: the player must start a new run */
      needsNewTicket: boolean;
    };

export class TrialService {
  constructor(
    private readonly api: ApiClient,
    private readonly auth: AuthManager,
    private readonly clientVersion = "dev",
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Starts a ticket (any previous open ticket is abandoned server-side). The passage is derived from ticket.seed. */
  async start(): Promise<TrialRun> {
    const ticket = await this.auth.withToken((t) => this.api.runStart(t));
    const def = resolveTrial(contentBundle, ticket.trialId);
    return { ticket, recorder: new TrialRecorder(def, ticket.seed) };
  }

  /**
   * Submits the finished run. The request is idempotent (Idempotency-Key = runId), so a network failure just
   * re-sends the SAME log (up to `attempts` times with backoff). Any HTTP error is terminal for the ticket except
   * auth errors (handled by withToken) and rate limiting.
   * `mutate` is a test/dev hook to tamper with the payload (e.g. forge a claim).
   */
  async submit(
    run: TrialRun,
    opts: { attempts?: number; mutate?: (b: RunSubmitBody) => RunSubmitBody } = {},
  ): Promise<SubmitOutcome> {
    const attempts = opts.attempts ?? 4;
    let body = await run.recorder.buildSubmission(
      run.ticket,
      this.clientVersion,
      run.recorder.timerResolutionMs,
    );
    if (opts.mutate) body = opts.mutate(body);
    let lastErr: ApiError | NetworkError | null = null;
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await this.sleep(Math.min(8000, 500 * 2 ** (i - 1)));
      try {
        const response = await this.auth.withToken((t) => this.api.runSubmit(t, body));
        return { ok: true, response };
      } catch (e) {
        if (e instanceof NetworkError) {
          lastErr = e;
          continue; // same log, same key
        }
        if (e instanceof ApiError) {
          if (e.reaction === "backoff") {
            lastErr = e;
            continue;
          }
          return {
            ok: false,
            error: e,
            needsNewTicket: e.reaction === "new-run" || e.reaction === "reload",
          };
        }
        throw e;
      }
    }
    return { ok: false, error: lastErr as ApiError | NetworkError, needsNewTicket: false };
  }

  /** Top 100 + around me when logged in (season scope by default). */
  async leaderboard(scope: "season" | "all" = "season"): Promise<LbTrialResponseT> {
    return this.auth.withToken((t) => this.api.lbTrial(scope, { token: t, aroundMe: true }));
  }
}
