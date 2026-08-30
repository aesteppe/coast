/**
 * OSRM response parsing. No browser, no network, no framework.
 *
 *   node test/parse.test.js
 *
 * parseRoutes is the trust boundary between a public routing server and the
 * rest of the app, so this file feeds it the kinds of partial and malformed
 * payloads a shared server can produce.
 */
import { parseRoutes } from '../js/routing.js';
import { MAX_ALTERNATIVES } from '../js/config.js';

let failed = 0;
function ok(name, cond, note = ''){
  console.log((cond ? '  pass  ' : '  FAIL  ') + name + (note ? '   ' + note : ''));
  if (!cond) failed++;
}
function throws(name, fn){
  let threw = false, msg = '';
  try { fn(); } catch (e){ threw = true; msg = e.message; }
  ok(name, threw, threw ? '(' + msg + ')' : '(did not throw)');
}

const validRoute = (distance = 1000, duration = 100) => ({
  distance,
  duration,
  geometry: { coordinates: [[-122.4, 47.6], [-122.3, 47.55], [-122.2, 47.5]] }
});

console.log('\nwell-formed responses');
const two = parseRoutes({ code: 'Ok', routes: [validRoute(), validRoute(2000, 150)] });
ok('two valid routes parse', two.length === 2);
ok('parsed routes carry distance and duration',
   two[0].distance === 1000 && two[1].duration === 150);
ok('parsed routes start unscored', two.every(r => r.prof === null && r.m === null));
ok('parsed routes get distinct ids', two[0].id !== two[1].id);

const many = parseRoutes({ code: 'Ok', routes: [1, 2, 3, 4, 5].map(i => validRoute(i * 1000, i * 100)) });
ok('alternatives are capped at MAX_ALTERNATIVES', many.length === MAX_ALTERNATIVES);

console.log('\nfailure responses');
throws('a non-Ok code throws a user-facing error',
  () => parseRoutes({ code: 'NoRoute', routes: [] }));
throws('a missing routes array throws',
  () => parseRoutes({ code: 'Ok' }));
throws('an empty routes array throws',
  () => parseRoutes({ code: 'Ok', routes: [] }));
throws('null throws instead of crashing downstream',
  () => parseRoutes(null));
throws('a bare string throws instead of crashing downstream',
  () => parseRoutes('service unavailable'));

console.log('\nmalformed routes');
const mixed = parseRoutes({ code: 'Ok', routes: [
  { distance: 1000, duration: 100 },                                    /* no geometry     */
  { distance: 1000, duration: 100, geometry: { coordinates: [[0, 0]] } }, /* one point      */
  { distance: NaN, duration: 100, geometry: validRoute().geometry },      /* NaN distance   */
  { distance: -5, duration: 100, geometry: validRoute().geometry },       /* negative       */
  { distance: 1000, duration: 'soon', geometry: validRoute().geometry },  /* non-numeric    */
  validRoute(3000, 300)                                                   /* the good one   */
] });
ok('malformed routes are dropped, the good one survives',
   mixed.length === 1 && mixed[0].distance === 3000);

const holes = parseRoutes({ code: 'Ok', routes: [{
  distance: 1000, duration: 100,
  geometry: { coordinates: [[0, 0], null, [NaN, 1], [0.1, 0.1], 'x', [0.2, 0.2]] }
}] });
ok('non-finite coordinates are filtered from a survivable geometry',
   holes.length === 1 && holes[0].coords.length === 3);

throws('a response with only malformed routes throws',
  () => parseRoutes({ code: 'Ok', routes: [{ distance: 1000, duration: 100 }] }));

console.log(failed ? '\n' + failed + ' assertion(s) failed\n' : '\nall assertions passed\n');
process.exit(failed ? 1 : 0);
