/**
 * Everything Leaflet. No other module touches the map object directly.
 *
 * Selection changes are emitted on the bus rather than calling into the card
 * renderer, so this module has no dependency on the sidebar.
 */
import { TILES, TILE_ATTR, COLOR } from './config.js';
import { $, el } from './utils.js';
import { S } from './state.js';
import { emit } from './bus.js';
import { reverse } from './geocode.js';

export const map = L.map('map', { zoomControl: false }).setView([47.45, -122.30], 10);
L.control.zoom({ position: 'bottomright' }).addTo(map);

const tiles = L.tileLayer(TILES, { attribution: TILE_ATTR, subdomains: 'abcd', maxZoom: 20 }).addTo(map);

/* Sandboxed previews block tile requests. Say so once instead of showing a void. */
let tileWarned = false;
tiles.on('tileerror', () => {
  if (tileWarned) return;
  tileWarned = true;
  $('map').appendChild(
    el('div', 'mapnote', 'Map tiles are blocked in this environment. Routes and markers still display.')
  );
});

const routeLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);

function pinIcon(kind){
  return L.divIcon({
    className: '',
    html: '<div class="pin pin-' + kind + '">' + (kind === 'a' ? 'A' : 'B') + '</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

export function drawMarkers(){
  markerLayer.clearLayers();
  if (S.start) L.marker([S.start.lat, S.start.lon], { icon: pinIcon('a') }).addTo(markerLayer);
  if (S.end)   L.marker([S.end.lat,   S.end.lon],   { icon: pinIcon('b') }).addTo(markerLayer);
}

/**
 * Set an endpoint and reverse geocode it in the background.
 * @param {'start'|'end'} which
 * @param {string} [label] skip the lookup when the caller already has a name
 */
export async function setPoint(which, lat, lon, label){
  const p = { lat, lon, label: label || lat.toFixed(4) + ', ' + lon.toFixed(4) };
  S[which] = p;
  (which === 'start' ? $('inA') : $('inB')).value = p.label;
  drawMarkers();

  if (label) return;
  const name = await reverse(lat, lon);
  /* Only apply if this point is still the current one. */
  if (name && S[which] === p){
    p.label = name;
    (which === 'start' ? $('inA') : $('inB')).value = name;
  }
}

/** Click the map to drop either endpoint. */
map.on('click', e => {
  const { lat, lng } = e.latlng;
  const box = el('div', 'pop');
  const head = el('div', null, '<b>' + lat.toFixed(4) + ', ' + lng.toFixed(4) + '</b>');
  head.style.fontSize = '12px';
  const bA = el('button', null, 'Set as start');
  const bB = el('button', null, 'Set as destination');
  bA.onclick = () => { map.closePopup(); setPoint('start', lat, lng); };
  bB.onclick = () => { map.closePopup(); setPoint('end', lat, lng); };
  box.append(head, bA, bB);
  L.popup().setLatLng(e.latlng).setContent(box).openOn(map);
});

function addLine(r, i, sel){
  const latlngs = r.coords.map(c => [c[1], c[0]]);
  const line = L.polyline(latlngs, {
    color: sel ? COLOR.grn : COLOR.dim,
    weight: sel ? 6 : 4,
    opacity: sel ? 1 : 0.55,
    className: sel ? 'rt-sel' : ''
  }).addTo(routeLayer);
  line.on('click', () => emit('route:select', i));
}

/** Redraw all route lines, selected one last so it sits on top. */
export function drawRoutes(fit){
  routeLayer.clearLayers();
  S.routes.forEach((r, i) => { if (i !== S.selected) addLine(r, i, false); });
  if (S.routes[S.selected]) addLine(S.routes[S.selected], S.selected, true);

  if (fit && S.routes.length){
    const all = [];
    S.routes.forEach(r => r.coords.forEach(c => all.push([c[1], c[0]])));
    map.fitBounds(L.latLngBounds(all), { padding: [36, 36] });
  }
}
