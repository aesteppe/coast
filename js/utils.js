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

/** Turn a thrown network error into something a person can act on. */
export function friendly(err){
  if (err && err.name === 'AbortError'){
    return 'The request timed out. The public service may be busy; try again in a moment.';
  }
  if (err && /HTTP 429/.test(err.message || '')){
    return 'The public service asked us to slow down. Wait a few seconds and try again.';
  }
  if (err && /HTTP 5\d\d/.test(err.message || '')){
    return 'The public service returned an error (' + err.message + '). ' +
      'It may be overloaded; try again in a moment.';
  }
  /* fetch throws TypeError when the request never leaves the page, which in
     practice means an offline machine or a sandboxed preview. */
  if (err instanceof TypeError){
    return 'The network request could not be sent. You may be offline, or this ' +
      'environment blocks outside requests. The demo trip below works either way.';
  }
  return (err && err.message) || 'Something went wrong. Check your connection and try again.';
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
