/**
 * Small dependency-free helpers: DOM shorthands, fetch with timeout, geometry.
 */

/** getElementById shorthand. */
export const $ = id => document.getElementById(id);

/** Build an element with an optional class and innerHTML. */
export function el(tag, cls, html){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

/** Trailing-edge debounce. */
export function debounce(fn, ms){
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/**
 * fetch + JSON with a hard timeout.
 * Throws on non-2xx so callers can treat every failure the same way.
 */
export async function jfetch(url, opt = {}, ms = 12000){
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...opt, signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Haversine great-circle distance in meters.
 * Takes GeoJSON-order pairs, [lon, lat], to match what OSRM returns.
 */
export function hav(a, b){
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLon = (b[0] - a[0]) * toR;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(s));
}

/** Trim a verbose Nominatim display_name down to something that fits an input. */
export function shortName(n){
  return (n || '').split(',').slice(0, 3).map(s => s.trim()).join(', ');
}
