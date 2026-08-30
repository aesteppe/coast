/**
 * Network scaffolding for the browser tests.
 *
 * Everything Coast talks to is intercepted: the CDN libraries are served from
 * node_modules, and the routing / geocoding / elevation services are answered
 * with fixtures. The suite therefore runs offline, is deterministic, and sends
 * no traffic to the shared public services it would otherwise be leaning on.
 */

/* ---------------- CDN libraries from node_modules ---------------- */

const LIBS = [
  ['leaflet.min.js', 'node_modules/leaflet/dist/leaflet.js', 'application/javascript'],
  ['leaflet.min.css', 'node_modules/leaflet/dist/leaflet.css', 'text/css'],
  ['chart.umd.min.js', 'node_modules/chart.js/dist/chart.umd.min.js', 'application/javascript']
];

export async function stubStatics(page){
  /* The CDN tags carry SRI hashes for the real cdnjs bytes. The stand-ins
     served from node_modules are not byte-identical, so the integrity
     attributes are stripped from the document under test. */
  await page.route('http://localhost:8080/', async route => {
    const res = await route.fetch();
    const html = (await res.text()).replace(/\s+integrity="[^"]*"/g, '');
    return route.fulfill({ response: res, body: html, contentType: 'text/html' });
  });
  await page.route('https://cdnjs.cloudflare.com/**', route => {
    const url = route.request().url();
    const hit = LIBS.find(([suffix]) => url.endsWith(suffix));
    return hit
      ? route.fulfill({ path: hit[1], contentType: hit[2] })
      : route.abort();
  });
  await page.route('https://fonts.googleapis.com/**',
    route => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://*.basemaps.cartocdn.com/**', route => route.abort());
}

/* ---------------- service fixtures ---------------- */

export const A = { lat: 47.60, lon: -122.40 };
export const B = { lat: 47.50, lon: -122.20 };

/** A straight [lon,lat] polyline from A to B with a slight per-route offset. */
function line(off){
  const pts = [];
  for (let i = 0; i <= 9; i++){
    const t = i / 9;
    pts.push([
      A.lon + (B.lon - A.lon) * t,
      A.lat + (B.lat - A.lat) * t + off * Math.sin(Math.PI * t)
    ]);
  }
  return pts;
}

/* Distances chosen so each route requests a distinct sample count
   (distance / 500 m, clamped to 40..100), which is how the elevation stub
   below tells the three otherwise-parallel routes apart. */
export const OSRM_OK = {
  code: 'Ok',
  routes: [
    { distance: 30000, duration: 1500, geometry: { coordinates: line(0.00) } },  /* 60 samples */
    { distance: 25000, duration: 1250, geometry: { coordinates: line(0.02) } },  /* 50 samples */
    { distance: 28000, duration: 1400, geometry: { coordinates: line(-0.02) } }  /* 56 samples */
  ]
};

/** Elevation profile per sample count: descent, climb-then-drop, flat. */
function profileFor(n){
  const out = [];
  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    if (n === 60) out.push(800 - 700 * t);                                   /* long descent  */
    else if (n === 50) out.push(t < 0.3 ? 400 + 400 * (t / 0.3) : 800 - 700 * ((t - 0.3) / 0.7));
    else out.push(300);                                                      /* flat          */
  }
  return out;
}

export function nominatimHits(which){
  const p = which === 'alpha' ? A : B;
  return [0, 1, 2].map(i => ({
    lat: String(p.lat + i * 0.01),
    lon: String(p.lon),
    display_name: (which === 'alpha' ? 'Alphaville' : 'Betatown') + ' ' + (i + 1) +
      ', King County, Washington, United States'
  }));
}

/**
 * Install happy-path service stubs. Returns a counter object so tests can
 * assert how many requests each service actually received.
 */
export async function stubServices(page, overrides = {}){
  const count = { osrm: 0, nominatim: 0, elevation: 0 };

  await page.route('https://router.project-osrm.org/**', route => {
    count.osrm++;
    if (overrides.osrm) return overrides.osrm(route);
    return route.fulfill({ json: OSRM_OK });
  });

  await page.route('https://nominatim.openstreetmap.org/**', route => {
    count.nominatim++;
    if (overrides.nominatim) return overrides.nominatim(route);
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/reverse')){
      return route.fulfill({ json: { display_name: 'Clicked Corner, Somewhere, Washington' } });
    }
    const q = (url.searchParams.get('q') || '').toLowerCase();
    return route.fulfill({ json: nominatimHits(q.includes('alpha') ? 'alpha' : 'beta') });
  });

  await page.route('https://api.open-meteo.com/**', route => {
    count.elevation++;
    if (overrides.elevation) return overrides.elevation(route);
    const url = new URL(route.request().url());
    const n = (url.searchParams.get('latitude') || '').split(',').length;
    return route.fulfill({ json: { elevation: profileFor(n) } });
  });

  await page.route('https://api.open-elevation.com/**', route => {
    count.elevation++;
    if (overrides.openElevation) return overrides.openElevation(route);
    return route.fulfill({ status: 503, json: {} });
  });

  return count;
}

/** Read the net-battery Wh figure from every card, in display order. */
export async function netValues(page){
  return page.$$eval('#cards .card .energy span:first-child b', els =>
    els.map(el => {
      const t = el.textContent.trim();
      const v = parseFloat(t.replace(/[^\d.-]/g, ''));
      return t.includes('kWh') ? v * 1000 : v;
    }));
}
