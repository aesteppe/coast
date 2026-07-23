/**
 * Terrain sampling: turn a route polyline into an elevation profile.
 *
 * Two public elevation services are used. Open-Elevation is tried first because
 * it accepts a batch POST; Open-Meteo is the fallback because it is usually up
 * when Open-Elevation is not. Either failing leaves the route without a profile
 * rather than failing the whole search.
 */
import { OPEN_ELEV, OPEN_METEO } from './config.js';
import { hav, jfetch } from './utils.js';

/**
 * Resample a [lon,lat] polyline into n evenly spaced points.
 * OSRM returns vertices clustered at corners, which would bias any profile
 * toward wherever the road happens to bend, so even spacing matters.
 * @returns {{lat:number, lon:number, d:number}[]} d is cumulative meters
 */
export function resample(coords, n){
  if (coords.length < 2){
    const c = coords[0] || [0, 0];
    return [{ lat: c[1], lon: c[0], d: 0 }, { lat: c[1], lon: c[0], d: 1 }];
  }

  const cum = [0];
  for (let i = 1; i < coords.length; i++){
    cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]));
  }
  const total = cum[cum.length - 1] || 1;
  const step = total / (n - 1);

  const pts = [];
  let j = 0;
  for (let k = 0; k < n; k++){
    const target = Math.min(k * step, total);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const seg = (cum[j + 1] - cum[j]) || 1;
    const t = (target - cum[j]) / seg;
    pts.push({
      lat: coords[j][1] + (coords[j + 1][1] - coords[j][1]) * t,
      lon: coords[j][0] + (coords[j + 1][0] - coords[j][0]) * t,
      d: target
    });
  }
  return pts;
}

/**
 * Light 3-point moving average.
 * Terrain models carry vertical noise on the order of a few meters. Left raw,
 * that noise inflates both ascent and descent totals, because every sample
 * wobble is counted as real relief.
 */
export function smooth(arr){
  return arr.map((v, i, a) => {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(a.length - 1, i + 1);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += a[k];
    return sum / (hi - lo + 1);
  });
}

/**
 * Look up elevation for sampled points, with automatic fallback.
 * @throws when both services fail
 */
export async function fetchElev(pts){
  try {
    const body = JSON.stringify({
      locations: pts.map(p => ({
        latitude: +p.lat.toFixed(5),
        longitude: +p.lon.toFixed(5)
      }))
    });
    const j = await jfetch(OPEN_ELEV, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    }, 15000);

    const e = (j.results || []).map(r => r.elevation);
    if (e.length !== pts.length || e.some(v => v == null || isNaN(v))){
      throw new Error('unusable payload');
    }
    return e.map(Number);
  } catch (_) {
    const la = pts.map(p => p.lat.toFixed(5)).join(',');
    const lo = pts.map(p => p.lon.toFixed(5)).join(',');
    const j = await jfetch(OPEN_METEO + '?latitude=' + la + '&longitude=' + lo, {}, 15000);
    if (!Array.isArray(j.elevation) || j.elevation.length !== pts.length){
      throw new Error('elevation unavailable');
    }
    return j.elevation.map(Number);
  }
}
