// Event emission. Sim functions append to an output array (never a global bus: no module-level mutable state).
import type { EventHandlers, EventOf, SimEvent, SimEventType } from "./events.ts";

/** Appends events in causal order; the sim passes one of these (or its backing array) down its call tree. */
export type Emit = (e: SimEvent) => void;

/** An emitter that pushes onto `out`. Events must carry `tick` = the tick being processed. */
export const emitTo =
  (out: SimEvent[]): Emit =>
  (e) => {
    out.push(e);
  };

/** Routes one event to its handler in a full handler map (consumer side: VFX, HUD, audio). */
export function dispatchEvent(handlers: EventHandlers, e: SimEvent): void {
  const h = handlers[e.type as SimEventType] as (ev: EventOf<SimEventType>) => void;
  h(e as EventOf<SimEventType>);
}

/** Routes a stream of events in order. */
export function dispatchEvents(handlers: EventHandlers, events: readonly SimEvent[]): void {
  for (const e of events) dispatchEvent(handlers, e);
}
