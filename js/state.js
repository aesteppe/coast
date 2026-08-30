/**
 * Shared mutable application state.
 *
 * A single exported object that other modules import and mutate directly.
 * That is deliberate: the app is small enough that a store abstraction would
 * cost more than it returns. If this grows, the replacement is a reducer here,
 * not state scattered across modules.
 */
import { PRESETS } from './config.js';

export const S = {
  /** @type {{lat:number, lon:number, label:string}|null} */
  start: null,
  /** @type {{lat:number, lon:number, label:string}|null} */
  end: null,

  /** Enriched route objects, sorted best-first by estimated net energy. */
  routes: [],

  /** Index into routes, or -1 when nothing is selected. */
  selected: -1,

  /** 'mi' or 'km'. Affects display only; all math stays in SI. */
  units: 'mi',

  /** Vehicle model driving the energy estimate. */
  veh: {
    mass: PRESETS.sedan.mass,
    cda: PRESETS.sedan.cda,
    regen: 0.68
  },

  /** True while a routing request is in flight, to block re-entry. */
  busy: false
};

/** Monotonic id so a route can be re-identified after re-sorting. */
let seq = 0;
export const nextRouteId = () => ++seq;
