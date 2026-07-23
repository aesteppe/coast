/**
 * Offline demo trip.
 *
 * A synthetic mountain-pass descent with three contrasting alternatives, so the
 * whole interface can be exercised with no network access at all. Useful in
 * sandboxed previews, on a plane, and for anyone reviewing the code who does
 * not want to hit public APIs to see what it does.
 *
 * The geometry and elevation are generated, not real roads. It is labeled as
 * such in the UI.
 */
import { S, nextRouteId } from './state.js';
import { smooth } from './elevation.js';
import { computeEnergy, sortRoutes } from './energy.js';

const A = { lat: 47.428, lon: -121.420 };  /* summit */
const B = { lat: 47.492, lon: -121.790 };  /* valley */

/** Smoothstep, for a descent that eases in and out like a real grade. */
const ss = t => t * t * (3 - 2 * t);

/**
 * Three alternatives chosen to make the model's behavior visible:
 *  - gradual  a long river-grade descent, almost no climbing
 *  - ridge    shortest and fastest, but climbs a ridge before dropping hard
 *  - valley   longer, rolling, with one bump in the middle
 * The ridge route recovers the most regen yet still loses on net energy,
 * which is the central lesson of the app.
 */
const TRIPS = [
  {
    distance: 29000, duration: 1500, amp: 0.018, freq: 2, phase: 0,
    fn: t => 150 + 770 * (1 - ss(t)) + 12 * Math.sin(9 * t)
  },
  {
    distance: 24500, duration: 1320, amp: 0.030, freq: 1, phase: Math.PI,
    fn: t => (t < 0.3 ? 920 + 230 * (t / 0.3) : 1150 - 1000 * ((t - 0.3) / 0.7)) +
      8 * Math.sin(14 * t)
  },
  {
    distance: 34500, duration: 1980, amp: 0.045, freq: 3, phase: 0.6,
    fn: t => 920 - 770 * t + 28 * Math.sin(12.6 * t) +
      60 * Math.exp(-Math.pow((t - 0.55) / 0.09, 2))
  }
];

const SAMPLES = 90;

function profile(distM, fn){
  const d = [], e = [];
  for (let k = 0; k < SAMPLES; k++){
    const t = k / (SAMPLES - 1);
    d.push(distM * t);
    e.push(fn(t));
  }
  return { d, e: smooth(e) };
}

/** Bow the straight line between A and B so the three routes are distinguishable. */
function coords(amp, freq, phase){
  const dLat = B.lat - A.lat, dLon = B.lon - A.lon;
  const len = Math.hypot(dLat, dLon) || 1;
  const out = [];
  for (let k = 0; k < SAMPLES; k++){
    const t = k / (SAMPLES - 1);
    const off = amp * Math.sin(Math.PI * freq * t + phase) * Math.sin(Math.PI * t);
    out.push([
      A.lon + dLon * t + (dLat / len) * off,
      A.lat + dLat * t + (-dLon / len) * off
    ]);
  }
  return out;
}

/** Populate state with the demo trip. Makes no network request. */
export function loadDemo(){
  S.start = { lat: A.lat, lon: A.lon, label: 'Demo Summit' };
  S.end   = { lat: B.lat, lon: B.lon, label: 'Demo Valley' };

  S.routes = TRIPS.map(cfg => {
    const r = {
      id: nextRouteId(),
      distance: cfg.distance,
      duration: cfg.duration,
      coords: coords(cfg.amp, cfg.freq, cfg.phase),
      prof: profile(cfg.distance, cfg.fn),
      m: null
    };
    r.m = computeEnergy(r);
    return r;
  });

  sortRoutes();
  S.selected = 0;
}
