/**
 * The energy model. This is the heart of the app.
 *
 * For each sampled segment the mechanical energy required is
 *
 *     E = (Crr * m * g  +  0.5 * rho * CdA * v^2) * d  +  m * g * dh
 *          \______ resistance, always positive ______/     \_ grade _/
 *
 * Positive E is drawn from the battery, divided by drivetrain efficiency.
 * Negative E means the descent is steep enough to overcome resistance; that
 * surplus is returned through regenerative braking at the vehicle's regen
 * efficiency, which is always well below 1.
 *
 * The asymmetry is the whole point. A climb costs the full m*g*dh plus losses;
 * the matching descent returns only a fraction of it. That is why a detour that
 * climbs in order to reach a long descent can never pay for itself, and why
 * ranking by net energy is the honest way to "maximize downhill".
 */
import { G, RHO, CRR, ETA_DRIVE } from './config.js';
import { S } from './state.js';

/**
 * @param {object} r route with { distance, duration, prof:{d[], e[]} }
 * @returns {null|{up,down,useWh,regWh,netWh,downShare}} null when no elevation
 */
export function computeEnergy(r){
  if (!r.prof) return null;

  const { mass, cda, regen } = S.veh;

  /* Average speed from OSRM's own estimate, clamped to a plausible band so a
     bad duration cannot blow up the v^2 drag term. */
  const v = Math.min(33, Math.max(6, r.distance / Math.max(1, r.duration)));

  const fRoll = CRR * mass * G;
  const fAero = 0.5 * RHO * cda * v * v;

  let up = 0, down = 0, eIn = 0, eReg = 0, downDist = 0;
  const { d, e } = r.prof;

  for (let i = 1; i < d.length; i++){
    const dd = d[i] - d[i - 1];
    if (dd <= 0) continue;

    const dh = e[i] - e[i - 1];
    if (dh > 0) up += dh;
    else { down -= dh; downDist += dd; }

    const eMech = (fRoll + fAero) * dd + mass * G * dh;
    if (eMech > 0) eIn += eMech / ETA_DRIVE;
    else eReg += (-eMech) * regen;
  }

  return {
    up,                              /* total ascent, meters */
    down,                            /* total descent, meters */
    useWh: eIn / 3600,               /* gross draw */
    regWh: eReg / 3600,              /* recovered by regen */
    netWh: (eIn - eReg) / 3600,      /* what the battery actually loses */
    /* Share of profile distance that descends; the profile's own span is the
       denominator so this stays consistent with how downDist was summed. */
    downShare: downDist / (d[d.length - 1] - d[0] || 1)
  };
}

/** Rank by net battery use, breaking ties on drive time. Mutates S.routes. */
export function sortRoutes(){
  S.routes.sort((a, b) => {
    const ka = a.m ? a.m.netWh : Infinity;
    const kb = b.m ? b.m.netWh : Infinity;
    return (ka - kb) || (a.duration - b.duration);
  });
}

/**
 * Recompute every route from its cached elevation profile.
 * Called when the vehicle model changes; deliberately makes no network request.
 * Preserves the user's selection across the re-sort.
 */
export function reEnergize(){
  if (!S.routes.length) return;
  const selId = S.selected >= 0 && S.routes[S.selected] ? S.routes[S.selected].id : null;
  S.routes.forEach(r => { r.m = computeEnergy(r); });
  sortRoutes();
  const idx = S.routes.findIndex(r => r.id === selId);
  S.selected = idx >= 0 ? idx : 0;
}
