/**
 * The search pipeline: resolve endpoints, ask OSRM for alternatives,
 * sample terrain for each, score them, and hand back a ranked set.
 */
import { OSRM, MAX_ALTERNATIVES, SAMPLE_MIN, SAMPLE_MAX, SAMPLE_SPACING } from './config.js';
import { $, jfetch } from './utils.js';
import { S, nextRouteId } from './state.js';
import { geocode } from './geocode.js';
import { resample, fetchElev, smooth } from './elevation.js';
import { computeEnergy, sortRoutes } from './energy.js';
import { status } from './cards.js';

/** Turn a thrown error into something a person can act on. */
export function friendly(err){
  if (err && err.name === 'AbortError'){
    return 'The request timed out. The public service may be busy; try again in a moment.';
  }
  /* fetch throws TypeError when the request never leaves the page, which in
     practice means a sandboxed preview or an offline machine. */
  if (err instanceof TypeError){
    return 'Outside network requests are blocked in this environment, so live routing ' +
      'cannot run here. Open the app in a regular browser, or load the demo trip below.';
  }
  return (err && err.message) || 'Something went wrong. Check your connection and try again.';
}

/** Geocode whichever endpoints were typed but never confirmed from a suggestion. */
async function resolveInputs(){
  for (const [key, id] of [['start', 'inA'], ['end', 'inB']]){
    if (S[key]) continue;
    const q = $(id).value.trim();
    if (!q) throw new Error(key === 'start' ? 'Enter a start point.' : 'Enter a destination.');
    const hits = await geocode(q);
    if (!hits.length) throw new Error('Could not find "' + q + '".');
    S[key] = hits[0];
    $(id).value = hits[0].label;
  }
}

/**
 * Run a full search. Mutates S.routes and S.selected.
 * @param {(msg:string, cls?:string) => void} [report] progress callback
 * @returns {Promise<boolean>} true when at least one route was scored
 */
export async function findRoutes(report = status){
  report('Resolving locations\u2026');
  await resolveInputs();

  report('Asking OSRM for route alternatives\u2026');
  const url = OSRM +
    S.start.lon + ',' + S.start.lat + ';' + S.end.lon + ',' + S.end.lat +
    '?alternatives=' + MAX_ALTERNATIVES + '&overview=full&geometries=geojson&steps=false';

  const j = await jfetch(url, {}, 15000);
  if (j.code !== 'Ok' || !j.routes || !j.routes.length){
    throw new Error('No drivable route found between those points.');
  }

  const routes = j.routes.slice(0, MAX_ALTERNATIVES).map(r => ({
    id: nextRouteId(),
    distance: r.distance,
    duration: r.duration,
    coords: r.geometry.coordinates,
    prof: null,
    m: null
  }));

  for (let i = 0; i < routes.length; i++){
    const r = routes[i];
    report('Sampling elevation for route ' + (i + 1) + ' of ' + routes.length + '\u2026');

    const n = Math.max(SAMPLE_MIN, Math.min(SAMPLE_MAX, Math.round(r.distance / SAMPLE_SPACING)));
    const pts = resample(r.coords, n);
    try {
      const raw = await fetchElev(pts);
      r.prof = { d: pts.map(p => p.d), e: smooth(raw) };
    } catch (_) {
      /* Leave prof null. The card shows a notice and the route still ranks last. */
    }
    r.m = computeEnergy(r);
  }

  S.routes = routes;
  sortRoutes();
  S.selected = 0;
  return routes.some(r => r.m);
}
