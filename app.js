/**
 * Entry point. Owns the render pipeline and all DOM event wiring.
 *
 * Every other module either computes something or renders one region; this is
 * the only place that knows how they fit together.
 */
import { PRESETS } from './config.js';
import { S } from './state.js';
import { $ } from './utils.js';
import { on } from './bus.js';
import { wireAuto } from './geocode.js';
import { drawMarkers, drawRoutes, setPoint, map } from './mapview.js';
import { renderChart } from './chartview.js';
import { renderCards, markSelected, status } from './cards.js';
import { findRoutes, friendly } from './routing.js';
import { reEnergize } from './energy.js';
import { loadDemo } from './demo.js';

/* ---------------- render pipeline ---------------- */

/** Full redraw after the result set changes. */
function renderAll(fit){
  drawMarkers();
  renderCards();
  drawRoutes(fit);
  renderChart();
}

/** Cheaper path when only the selected index changed. */
function renderSelection(){
  markSelected();
  drawRoutes(false);
  renderChart();
}

/* ---------------- bus subscriptions ---------------- */

on('route:select', i => {
  S.selected = i;
  renderSelection();
});

on('points:changed', drawMarkers);

on('route:request', () => search());

/* ---------------- search ---------------- */

async function search(){
  if (S.busy) return;
  S.busy = true;

  const btn = $('btnGo');
  btn.disabled = true;
  btn.classList.add('busy');
  $('goTxt').textContent = 'Routing\u2026';

  try {
    const scored = await findRoutes(status);
    renderAll(true);
    status(
      scored
        ? 'Ranked by estimated net battery use. Select a route to inspect it.'
        : 'Routes found, but elevation data was unavailable.',
      scored ? 'ok' : 'err'
    );
  } catch (err) {
    status(friendly(err), 'err');
    $('btnDemo').classList.add('pulse');
  } finally {
    S.busy = false;
    btn.disabled = false;
    btn.classList.remove('busy');
    $('goTxt').textContent = 'Find regen routes';
  }
}

/* ---------------- controls ---------------- */

wireAuto($('inA'), $('sugA'), 'start');
wireAuto($('inB'), $('sugB'), 'end');

$('btnGo').addEventListener('click', search);

$('btnDemo').addEventListener('click', () => {
  loadDemo();
  $('inA').value = S.start.label;
  $('inB').value = S.end.label;
  renderAll(true);
  $('btnDemo').classList.remove('pulse');
  status('Demo trip loaded: synthetic geometry and elevation for interface testing. ' +
    'Live routing needs network access.', 'ok');
});

$('btnLoc').addEventListener('click', () => {
  if (!navigator.geolocation){
    status('Geolocation is not available in this browser.', 'err');
    return;
  }
  status('Locating\u2026');
  navigator.geolocation.getCurrentPosition(
    pos => {
      setPoint('start', pos.coords.latitude, pos.coords.longitude);
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      status('');
    },
    () => status('Location permission denied. Type a start address instead.', 'err'),
    { enableHighAccuracy: false, timeout: 9000 }
  );
});

$('btnSwap').addEventListener('click', () => {
  [S.start, S.end] = [S.end, S.start];
  const a = $('inA').value;
  $('inA').value = $('inB').value;
  $('inB').value = a;
  drawMarkers();
  if (S.routes.length && S.start && S.end) search();
});

function setUnits(u){
  if (S.units === u) return;
  S.units = u;
  $('uMi').classList.toggle('on', u === 'mi');
  $('uKm').classList.toggle('on', u === 'km');
  renderCards();
  renderChart();
}
$('uMi').addEventListener('click', () => setUnits('mi'));
$('uKm').addEventListener('click', () => setUnits('km'));

/* ---------------- vehicle model ---------------- */

function vehUI(){
  $('vMassOut').value = S.veh.mass + ' kg';
  $('vRegenOut').value = Math.round(S.veh.regen * 100) + '%';
}

/** Vehicle changes rescore cached profiles; they never refetch. */
function onVehicleChange(){
  reEnergize();
  renderCards();
  drawRoutes(false);
  renderChart();
}

$('vPreset').addEventListener('change', e => {
  const p = PRESETS[e.target.value];
  S.veh.mass = p.mass;
  S.veh.cda = p.cda;
  $('vMass').value = p.mass;
  vehUI();
  onVehicleChange();
});
$('vMass').addEventListener('input', e => {
  S.veh.mass = +e.target.value; vehUI(); onVehicleChange();
});
$('vRegen').addEventListener('input', e => {
  S.veh.regen = +e.target.value / 100; vehUI(); onVehicleChange();
});

/* ---------------- boot ---------------- */

vehUI();
drawMarkers();
