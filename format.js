/**
 * Unit-aware display formatting.
 *
 * All internal math is SI (meters, joules, kilograms). Conversion happens here
 * and nowhere else, so switching units never touches the model.
 */
import { S } from './state.js';
import { MI, FT } from './config.js';

export function fmtDist(m){
  return S.units === 'mi'
    ? (m / MI).toFixed(1) + ' mi'
    : (m / 1000).toFixed(1) + ' km';
}

export function fmtDur(sec){
  const mins = Math.round(sec / 60);
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  return h + ' h ' + String(mins % 60).padStart(2, '0') + ' min';
}

export function fmtElev(m, sign){
  const v = S.units === 'mi' ? Math.round(m / FT) : Math.round(m);
  const unit = S.units === 'mi' ? ' ft' : ' m';
  return (sign || '') + v.toLocaleString() + unit;
}

export function fmtWh(wh){
  return Math.abs(wh) >= 995
    ? (wh / 1000).toFixed(1) + ' kWh'
    : Math.round(wh) + ' Wh';
}

/** Efficiency, or a plain label when the route is a net gain. */
export function fmtEff(netWh, meters){
  if (netWh <= 0) return 'net charge';
  const kwh = netWh / 1000;
  return S.units === 'mi'
    ? (meters / MI / kwh).toFixed(1) + ' mi/kWh'
    : (kwh / ((meters / 1000) / 100)).toFixed(1) + ' kWh/100 km';
}
