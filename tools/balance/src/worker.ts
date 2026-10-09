import { parentPort } from "node:worker_threads";
import { type Job, runJob } from "./runner.ts";

parentPort?.on("message", (m: { i: number; job: Job }) => {
  parentPort?.postMessage({ i: m.i, records: runJob(m.job) });
});
