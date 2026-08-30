/**
 * Nominatim forward and reverse geocoding, plus the suggestion behavior on
 * the start and destination inputs.
 *
 * Nominatim is shared community infrastructure with a strict usage policy:
 * at most one request per second, results must be cached, and client-side
 * search-as-you-type autocomplete is explicitly forbidden.
 * https://operations.osmfoundation.org/policies/nominatim/
 *
 * Coast therefore geocodes only on an explicit action (Enter in an input, or
 * the search button resolving typed text), funnels every request through a
 * limiter that spaces them out, and caches results for the session.
 */
import { NOMI, NOMI_MIN_INTERVAL } from './config.js';
import { el, jfetch, shortName, friendly } from './utils.js';
import { S } from './state.js';
import { emit } from './bus.js';
import { status } from './cards.js';

/* ---------------- request limiter ----------------
   One Nominatim call at a time, each spaced NOMI_MIN_INTERVAL from the
   completion of the previous one, whatever part of the app asked. */
let chain = Promise.resolve();
let lastAt = 0;

function limited(fn){
  const run = chain.then(async () => {
    const wait = lastAt + NOMI_MIN_INTERVAL - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastAt = Date.now();
    }
  });
  chain = run.catch(() => {});   /* a failed call must not wedge the queue */
  return run;
}

/* ---------------- session caches ----------------
   The policy requires caching; it also makes repeat searches instant. */
const CACHE_MAX = 100;
const fwdCache = new Map();   /* normalized query -> hits */
const revCache = new Map();   /* rounded "lat,lon"  -> label or null */

function remember(cache, key, val){
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, val);
}

/** Forward geocode a free-text query. @returns {Promise<{lat,lon,label}[]>} */
export async function geocode(q){
  const key = q.trim().toLowerCase();
  if (fwdCache.has(key)) return fwdCache.get(key);

  const j = await limited(() => jfetch(
    NOMI + '/search?format=jsonv2&limit=5&q=' + encodeURIComponent(q), {}, 9000));

  const hits = (Array.isArray(j) ? j : [])
    .map(r => ({ lat: +r.lat, lon: +r.lon, label: shortName(r.display_name) }))
    .filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lon) && h.label);

  remember(fwdCache, key, hits);
  return hits;
}

/** Reverse geocode. Returns null rather than throwing; callers fall back to coordinates. */
export async function reverse(lat, lon){
  const key = lat.toFixed(4) + ',' + lon.toFixed(4);
  if (revCache.has(key)) return revCache.get(key);

  try {
    const j = await limited(() => jfetch(
      NOMI + '/reverse?format=jsonv2&lat=' + lat + '&lon=' + lon, {}, 8000));
    const name = j && j.display_name ? shortName(j.display_name) : null;
    remember(revCache, key, name);
    return name;
  } catch (_) {
    return null;
  }
}

/**
 * Wire on-demand place search onto one input.
 *
 * Enter fetches suggestions for the typed text (one request); arrow keys and
 * Enter, or a click, choose one. Choosing the second endpoint starts routing.
 * There is deliberately no request while typing; see the policy note above.
 *
 * @param {HTMLInputElement} input
 * @param {HTMLElement} list   the <ul> that holds suggestions
 * @param {'start'|'end'} which
 */
export function wireSearchInput(input, list, which){
  let items = [];   /* current suggestion objects */
  let hi = -1;      /* highlighted index */

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-autocomplete', 'list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', (which === 'start' ? 'Start' : 'Destination') + ' suggestions');

  const isOpen = () => list.style.display === 'block';

  function close(){
    list.style.display = 'none';
    list.textContent = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    items = [];
    hi = -1;
  }

  function highlight(i){
    hi = i;
    [...list.children].forEach((n, k) => {
      n.classList.toggle('hi', k === i);
      n.setAttribute('aria-selected', k === i ? 'true' : 'false');
    });
    if (i >= 0 && list.children[i]){
      input.setAttribute('aria-activedescendant', list.children[i].id);
      list.children[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function choose(i){
    const h = items[i];
    if (!h) return;
    S[which] = h;
    input.value = h.label;
    close();
    emit('points:changed');
    if (S.start && S.end) emit('route:request');
    else status('Now set the ' + (which === 'start' ? 'destination' : 'start') + '.');
  }

  function show(hits){
    close();
    items = hits;
    hits.forEach((h, i) => {
      const li = el('li');
      li.textContent = h.label;   /* textContent on purpose: API data is not markup */
      li.id = list.id + '-opt-' + i;
      li.setAttribute('role', 'option');
      /* mousedown, not click: blur fires first and would close the list */
      li.addEventListener('mousedown', ev => { ev.preventDefault(); choose(i); });
      list.appendChild(li);
    });
    list.style.display = 'block';
    input.setAttribute('aria-expanded', 'true');
    highlight(0);
  }

  async function search(){
    const q = input.value.trim();
    if (q.length < 2){
      status('Type a place name first, then press Enter.', 'err');
      return;
    }
    status('Searching for “' + q + '”…');
    try {
      const hits = await geocode(q);
      if (!hits.length){
        status('No places found for “' + q + '”. Try adding a city or region.', 'err');
        return;
      }
      show(hits);
      status(hits.length === 1
        ? 'One match. Press Enter to use it.'
        : hits.length + ' matches. Choose with the arrow keys or a click.');
    } catch (err) {
      close();
      status('Place search failed. ' + friendly(err), 'err');
    }
  }

  input.addEventListener('input', () => {
    S[which] = null;   /* edited text invalidates the confirmed point */
    close();
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ close(); return; }
    if (e.key === 'ArrowDown' && isOpen()){
      e.preventDefault();
      highlight(Math.min(hi + 1, items.length - 1));
      return;
    }
    if (e.key === 'ArrowUp' && isOpen()){
      e.preventDefault();
      highlight(Math.max(hi - 1, 0));
      return;
    }
    if (e.key === 'Enter'){
      e.preventDefault();
      if (isOpen()) choose(hi >= 0 ? hi : 0);
      else if (S[which] && S.start && S.end) emit('route:request');
      else search();
    }
  });

  input.addEventListener('blur', () => setTimeout(close, 150));
}
