export { contentBundle } from "./data/bundle.ts";
// The explicit export below shadows the placeholder CONTENT_VERSION that schemas.ts re-exports above.
export { CONTENT_VERSION } from "./data/content-version.generated.ts";
export { TYPING_TRIAL, TYPING_TRIAL_PASSAGES } from "./data/trials.ts";
export * from "./data/words.ts";
export * from "./schemas.ts";
export const PACKAGE = "@hd2d/content";
