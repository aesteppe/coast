/**
 * Elevation pipeline: resampling geometry, provider fallback, and artifact
 * detection. No browser, no framework, and no network: global fetch is
 * stubbed, which is exactly how the provider-order behavior stays testable.
 *
 *   node test/elevation.test.js
 */
import { resample, smooth, maxGrade, fetchElev } from '../js/elevation.js';

let failed = 0;
function ok(name, cond, note = ''){
  console.log((cond ? '  pass  ' : '  FAIL  ') + name + (note ? '   ' + note : ''));
  if (!cond) failed++;
}

/* ---------------- resample ---------------- */

console.log('\nresample');
const line = [[-122.4, 47.6], [-122.3, 47.6], [-122.2, 47.6]];
const rs = resample(line, 21);
ok('returns the requested count', rs.length === 21);
ok('starts at the start', rs[0].lon === -122.4 && rs[0].d === 0);
ok('ends at the end', Math.abs(rs[20].lon - -122.2) < 1e-9);
ok('cumulative distance is monotonic',
   rs.every((p, i, a) => i === 0 || p.d > a[i - 1].d));

ok('empty geometry degrades to a two-point stub', resample([], 40).length === 2);
ok('single-point geometry degrades to a two-point stub', resample([[1, 2]], 40).length === 2);

const dup = resample([[-122.4, 47.6], [-122.4, 47.6], [-122.2, 47.6]], 11);
ok('zero-length segments do not break spacing',
   dup.length === 11 && dup.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)));

/* ---------------- smooth / maxGrade ---------------- */

console.log('\nsmoothing and artifact detection');
ok('smoothing a constant changes nothing',
   smooth([5, 5, 5, 5]).every(v => v === 5));
ok('smoothing preserves length', smooth([1, 2, 3]).length === 3);

ok('maxGrade of a uniform ramp is the ramp grade',
   Math.abs(maxGrade([0, 100, 200], [0, 10, 20]) - 0.1) < 1e-9);
ok('maxGrade finds a single spike',
   maxGrade([0, 100, 200, 300], [0, 0, 60, 60]) === 0.6);
ok('maxGrade ignores zero-length segments',
   maxGrade([0, 0, 100], [0, 50, 60]) < 0.55);
ok('maxGrade of an empty profile is zero', maxGrade([], []) === 0);

/* ---------------- provider fallback ---------------- */

console.log('\nprovider fallback');
const realFetch = globalThis.fetch;
const calls = [];
const jres = (obj, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => obj
});

/** Install a fetch stub; handlers get (url, opt) and return a response or null. */
function stub(handler){
  calls.length = 0;
  globalThis.fetch = async (url, opt) => {
    calls.push(String(url));
    return handler(String(url), opt);
  };
}

const pts = [
  { lat: 47.6, lon: -122.4, d: 0 },
  { lat: 47.55, lon: -122.3, d: 500 },
  { lat: 47.5, lon: -122.2, d: 1000 }
];

/* 1: primary succeeds */
stub(url => {
  if (url.includes('open-meteo')) return jres({ elevation: [120, 140, 90] });
  return jres({}, 500);
});
let e = await fetchElev(pts);
ok('Open-Meteo is tried first and its payload is returned',
   e.join() === '120,140,90' && calls.length === 1 && calls[0].includes('open-meteo'));

/* 2: primary down, fallback succeeds */
stub((url, opt) => {
  if (url.includes('open-meteo')) return jres({}, 503);
  if (url.includes('open-elevation')){
    const n = JSON.parse(opt.body).locations.length;
    return jres({ results: Array.from({ length: n }, (_, i) => ({ elevation: 10 * i })) });
  }
  return jres({}, 500);
});
e = await fetchElev(pts);
ok('falls back to Open-Elevation when Open-Meteo fails',
   e.join() === '0,10,20' && calls.length === 2);
ok('the fallback is a batch POST',
   calls[1].includes('open-elevation'));

/* 3: primary returns a short payload */
stub(url => {
  if (url.includes('open-meteo')) return jres({ elevation: [120] });
  return jres({ results: pts.map(() => ({ elevation: 7 })) });
});
e = await fetchElev(pts);
ok('a padded or short primary payload triggers the fallback', e.join() === '7,7,7');

/* 4: primary returns nulls */
stub(url => {
  if (url.includes('open-meteo')) return jres({ elevation: [120, null, 90] });
  return jres({ results: pts.map(() => ({ elevation: 7 })) });
});
e = await fetchElev(pts);
ok('null elevations are rejected, not passed to the model', e.join() === '7,7,7');

/* 5: both providers down */
stub(() => jres({}, 500));
let threw = false;
try { await fetchElev(pts); } catch (_){ threw = true; }
ok('both providers failing throws instead of returning junk', threw);

/* 6: fallback payload is short */
stub(url => {
  if (url.includes('open-meteo')) return jres({}, 500);
  return jres({ results: [{ elevation: 5 }] });
});
threw = false;
try { await fetchElev(pts); } catch (_){ threw = true; }
ok('a short fallback payload also throws', threw);

globalThis.fetch = realFetch;

console.log(failed ? '\n' + failed + ' assertion(s) failed\n' : '\nall assertions passed\n');
process.exit(failed ? 1 : 0);
