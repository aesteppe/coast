/**
 * Nominatim forward and reverse geocoding, plus the autocomplete behavior
 * on the start and destination inputs.
 */
import { NOMI } from './config.js';
import { $, el, debounce, jfetch, shortName } from './utils.js';
import { S } from './state.js';
import { emit } from './bus.js';

/** Forward geocode a free-text query. @returns {{lat,lon,label}[]} */
export async function geocode(q){
  const j = await jfetch(NOMI + '/search?format=json&limit=5&q=' + encodeURIComponent(q), {}, 9000);
  return (j || []).map(r => ({
    lat: +r.lat,
    lon: +r.lon,
    label: shortName(r.display_name)
  }));
}

/** Reverse geocode. Returns null rather than throwing; callers fall back to coordinates. */
export async function reverse(lat, lon){
  try {
    const j = await jfetch(NOMI + '/reverse?format=json&lat=' + lat + '&lon=' + lon, {}, 8000);
    return j && j.display_name ? shortName(j.display_name) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Wire suggestion behavior onto one input.
 * Debounced to roughly one request per typing pause, which keeps Coast inside
 * Nominatim's fair-use expectations.
 *
 * @param {HTMLInputElement} input
 * @param {HTMLElement} list   the <ul> that holds suggestions
 * @param {'start'|'end'} which
 */
export function wireAuto(input, list, which){
  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 3){ list.style.display = 'none'; return; }

    try {
      const hits = await geocode(q);
      list.innerHTML = '';
      if (!hits.length){ list.style.display = 'none'; return; }

      hits.forEach(h => {
        const li = el('li', null, h.label);
        /* mousedown, not click: blur fires first and would close the list */
        li.addEventListener('mousedown', ev => {
          ev.preventDefault();
          S[which] = h;
          input.value = h.label;
          list.style.display = 'none';
          emit('points:changed');
        });
        list.appendChild(li);
      });
      list.style.display = 'block';
    } catch (_) {
      list.style.display = 'none';
    }
  }, 380);

  input.addEventListener('input', () => { S[which] = null; run(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') list.style.display = 'none';
    if (e.key === 'Enter'){ list.style.display = 'none'; emit('route:request'); }
  });
  input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 150));
}
