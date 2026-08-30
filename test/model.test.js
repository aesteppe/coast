/**
 * Model tests. No browser, no network, no framework.
 *
 *   node test/model.test.js
 *
 * Only the pure modules are covered: geometry, resampling, smoothing, and the
 * energy model. Anything that touches the DOM or a public API is out of scope
 * here on purpose, so this stays fast and deterministic.
 */
import { S } from '../js/state.js';
import { hav } from '../js/utils.js';
import { resample, smooth } from '../js/elevation.js';
import { computeEnergy, reEnergize } from '../js/energy.js';
import { loadDemo } from '../js/demo.js';
import { G, RHO, CRR, ETA_DRIVE } from '../js/config.js';

let failed = 0;
function ok(name, cond, note = ''){
  console.log((cond ? '  pass  ' : '  FAIL  ') + name + (note ? '   ' + note : ''));
  if (!cond) failed++;
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

/** Build a synthetic route with a constant grade, for isolating one variable. */
function straightRoute(distM, riseM, durationS){
  const n = 51;
  const d = [], e = [];
  for (let i = 0; i < n; i++){
    d.push(distM * i / (n - 1));
    e.push(riseM * i / (n - 1));
  }
  return { distance: distM, duration: durationS, prof: { d, e } };
}

console.log('\ngeometry');
ok('haversine matches one degree of latitude',
   Math.abs(hav([0, 0], [0, 1]) - 111195) < 500);
const rs = resample([[0, 0], [0, 1]], 11);
const gaps = rs.slice(1).map((p, i) => p.d - rs[i].d);
ok('resample returns the requested count', rs.length === 11);
ok('resample spacing is even', Math.max(...gaps) - Math.min(...gaps) < 1e-6);

console.log('\nsmoothing');
const noisy = [0, 10, 0, 10, 0, 10, 0, 10];
const sm = smooth(noisy);
ok('smoothing preserves the mean', Math.abs(mean(sm) - mean(noisy)) < 1.5);
ok('smoothing narrows the range',
   (Math.max(...sm) - Math.min(...sm)) < (Math.max(...noisy) - Math.min(...noisy)));

console.log('\nenergy model');
const flat = straightRoute(20000, 0, 900);
S.veh = { mass: 1900, cda: 0.58, regen: 0.68 };
const light = computeEnergy(flat).netWh;
S.veh.mass = 3100;
const heavy = computeEnergy(flat).netWh;
ok('on flat ground a heavier vehicle costs more', heavy > light);

S.veh = { mass: 1900, cda: 0.58, regen: 0.68 };
const climb = computeEnergy(straightRoute(20000, 400, 900));
const level = computeEnergy(flat);
ok('climbing costs more than staying level', climb.netWh > level.netWh);
ok('a level route recovers no regen', level.regWh === 0);

const descent = computeEnergy(straightRoute(20000, -400, 900));
ok('descending recovers regen', descent.regWh > 0);
ok('descending costs less than level', descent.netWh < level.netWh);

/* The asymmetry that the whole app rests on: a climb and the matching descent
   do not cancel, because regen returns only a fraction of the grade work. */
ok('a climb and its matching descent do not cancel',
   (climb.netWh + descent.netWh) > 2 * level.netWh,
   '(regen returns a fraction, so the round trip loses)');

S.veh.regen = 0;
const noRegen = computeEnergy(straightRoute(20000, -400, 900)).netWh;
S.veh.regen = 0.68;
ok('regen strictly helps', noRegen > descent.netWh);

console.log('\nclosed form');
/* The model must agree exactly with the formula the README documents. */
S.veh = { mass: 1900, cda: 0.58, regen: 0.68 };
{
  const D = 20000, T = 900;
  const v = Math.min(33, Math.max(6, D / T));
  const fR = CRR * S.veh.mass * G;
  const fA = 0.5 * RHO * S.veh.cda * v * v;
  const flatWh = (fR + fA) * D / ETA_DRIVE / 3600;
  ok('flat route matches closed-form arithmetic',
     Math.abs(computeEnergy(straightRoute(D, 0, T)).netWh - flatWh) < 1e-6);
  const climbWh = ((fR + fA) * D + S.veh.mass * G * 400) / ETA_DRIVE / 3600;
  ok('a 400 m climb matches closed-form arithmetic',
     Math.abs(computeEnergy(straightRoute(D, 400, T)).netWh - climbWh) < 1e-6);
}

console.log('\nphysical sanity');
const steep = computeEnergy(straightRoute(20000, -800, 900));
ok('a steep descent is a net charge', steep.netWh < 0);
ok('regen never exceeds its share of the potential energy',
   steep.regWh <= S.veh.mass * G * steep.down * S.veh.regen / 3600 + 1e-9);

const shallow = computeEnergy(straightRoute(20000, -200, 900));
ok('a shallow (-1%) descent still drains: resistance dominates',
   shallow.netWh > 0 && shallow.regWh === 0);

/** Route that climbs to a peak then returns, or the mirror image. */
function vRoute(D, peak, T, invert){
  const n = 101, d = [], e = [];
  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    d.push(D * t);
    const h = t < 0.5 ? peak * 2 * t : peak * 2 * (1 - t);
    e.push(invert ? -h : h);
  }
  return { distance: D, duration: T, prof: { d, e } };
}
const upFirst = computeEnergy(vRoute(20000, 300, 900, false));
const downFirst = computeEnergy(vRoute(20000, 300, 900, true));
ok('segment order does not change the total',
   Math.abs(upFirst.netWh - downFirst.netWh) < 1e-6);
ok('half of a symmetric V route counts as downhill',
   Math.abs(upFirst.downShare - 0.5) < 0.02);

console.log('\ndegenerate profiles');
ok('missing profile yields null, not NaN',
   computeEnergy({ distance: 1000, duration: 100, prof: null }) === null);
ok('zero duration cannot blow up the drag term',
   Number.isFinite(computeEnergy(
     { distance: 10, duration: 0, prof: { d: [0, 10], e: [0, 0] } }).netWh));
ok('duplicate distance samples are skipped',
   Number.isFinite(computeEnergy(
     { distance: 10, duration: 10, prof: { d: [0, 0, 10], e: [0, 99, 0] } }).netWh));

console.log('\nranking');
S.veh = { mass: 1900, cda: 0.58, regen: 0.68 };
loadDemo();
ok('demo produces three routes', S.routes.length === 3);
ok('every demo route is scored', S.routes.every(r => r.m));
ok('routes are ordered by net battery use',
   S.routes.every((r, i, a) => i === 0 || a[i - 1].m.netWh <= r.m.netWh));

const mostRegen = [...S.routes].sort((a, b) => b.m.regWh - a.m.regWh)[0];
ok('the route recovering the most regen is not the winner',
   mostRegen !== S.routes[0],
   '(it climbs first, so it spends more than it recovers)');

const before = S.routes.map(r => r.id).join();
S.veh.mass = 2350;
reEnergize();
ok('rescoring keeps the same routes', S.routes.length === 3);
ok('rescoring needs no refetch', S.routes.every(r => r.prof) && before.length > 0);

console.log(failed ? '\n' + failed + ' assertion(s) failed\n' : '\nall assertions passed\n');
process.exit(failed ? 1 : 0);
