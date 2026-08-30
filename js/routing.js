/**
 * The search pipeline: resolve endpoints, ask OSRM for alternatives,
 * sample terrain for each, score them, and hand back a ranked set.
 */
import { OSRM, MAX_ALTERNATIVES, SAMPLE_MIN, SAMPLE_MAX, SAMPLE_SPACING, GRADE_SUSPECT } from './config.js';
import { $, jfetch } from './utils.js';
import { S, nextRouteId } from './state.js';
import { geocode } from './geocode.js';
import { resample, fetchElev, smooth, maxGrade } from './elevation.js';
import { computeEnergy, sortRoutes } from './energy.js';
import { status } from './cards.js';

/**
 * Validate an OSRM response and map it to Coast's route objects.
 * Defensive on purpose: a public server can return partial or malformed
 * payloads, and a bad route must be dropped rather than crash the render.
 * @throws {Error} with a user-facing message when nothing usable remains
 */
export function parseRoutes(j){
  if (!j || j.code !== 'Ok' || !Array.isArray(j.routes) || !j.routes.length){
    throw new Error('No drivable route found between those points.');
  }

  const routes = [];
  for (const r of j.routes){
    if (routes.length === MAX_ALTERNATIVES) break;   /* validate first, then cap */
    const coords = r && r.geometry && Array.isArray(r.geometry.coordinates)
      ? r.geometry.coordinates.filter(c =>
          Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      : [];
    if (coords.length < 2) continue;
    if (!Number.isFinite(r.distance) || r.distance <= 0) continue;
    if (!Number.isFinite(r.duration) || r.duration < 0) continue;
    routes.push({
      id: nextRouteId(),
      distance: r.distance,
      duration: r.duration,
      coords,
      prof: null,
      m: null
    });
  }

  if (!routes.length){
    throw new Error('The routing service returned an unusable response. Try again in a moment.');
  }
  return routes;
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
  const routes = parseRoutes(j);

  for (let i = 0; i < routes.length; i++){
    const r = routes[i];
    report('Sampling elevation for route ' + (i + 1) + ' of ' + routes.length + '\u2026');

    const n = Math.max(SAMPLE_MIN, Math.min(SAMPLE_MAX, Math.round(r.distance / SAMPLE_SPACING)));
    const pts = resample(r.coords, n);
    try {
      const raw = await fetchElev(pts);
      const d = pts.map(p => p.d);
      const e = smooth(raw);
      /* Grades a road could never sustain mean the terrain model is measuring
         something other than the road deck (a bridge span, a canyon wall).
         Keep the estimate but mark it so the card can say it is rough. */
      r.prof = { d, e, suspect: maxGrade(d, e) > GRADE_SUSPECT };
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
