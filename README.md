# Coast

Regen-optimized EV routing in the browser. Coast compares real driving routes by
how much energy the trip will actually cost after regenerative braking, and
highlights the alternative that recovers the most on descents.

**Live demo:** [aesteppe.github.io/coast](https://aesteppe.github.io/coast/)

![Coast comparing three demo routes](screenshot.png)

## What it does

- Geocoded start and destination search, plus map-click point placement and browser geolocation
- Requests up to three road alternatives from OSRM for every trip
- Samples each route against a terrain elevation model (40 to 100 evenly spaced points per route)
- Runs a physics-based energy estimate per route and ranks alternatives by net battery use
- Grade-painted elevation profile: descents render green, climbs render amber
- Per-route comparison cards with distance, drive time, ascent, descent, downhill share, net battery draw, regen recovered, and efficiency
- Adjustable vehicle model: preset classes (compact, sedan, SUV, pickup), mass, and regen efficiency, with instant recomputation and no refetch
- Imperial and metric unit toggle
- Built-in offline demo trip: a synthetic mountain-pass descent with three contrasting alternatives, so the entire interface can be exercised without the live services

Place search is deliberately on demand: type a place, press Enter, pick a
suggestion with the arrow keys or a click. Nominatim's usage policy forbids
search-as-you-type autocomplete, so Coast does not do it.

## How the ranking works

For each sampled segment the model computes mechanical energy as rolling
resistance plus aerodynamic drag plus grade work:

```
E = (Crr * m * g + 0.5 * rho * CdA * v^2) * d + m * g * dh
```

Positive segments draw from the battery through a fixed drivetrain efficiency
(90 percent). Negative segments, where the descent is steep enough to overcome
resistance, return energy through regenerative braking at the configured regen
efficiency (50 to 80 percent, default 68 percent).

That asymmetry is the entire point. A climb costs the full grade work plus
losses, while the matching descent returns only a fraction of it. So routes are
ranked by estimated **net** battery use, which favors downhill-heavy paths
without pretending a detour that climbs to reach a descent could ever pay for
itself. The winner is the route that wastes the least.

The demo trip makes this visible: the alternative that recovers the most regen
is not the one that finishes ahead, because it climbs a ridge first.

Elevation samples pass through a short moving average before ascent and descent
are summed, since terrain-model noise would otherwise inflate both. If a
profile still contains grades no road sustains (over 30 percent, usually a
bridge span or canyon wall in the terrain model), the route card says so and
labels the figures as rough.

### Model assumptions, stated plainly

These are the simplifications behind every number the app shows:

- Speed is one average per route, taken from OSRM's duration estimate and clamped to 6 to 33 m/s. There is no speed profile, no traffic, and no stop-and-go.
- Temperature, wind, payload, and auxiliary loads (climate, lights) are not modeled. Real consumption will usually be somewhat higher than these estimates.
- Rolling resistance (Crr 0.010), air density (1.225 kg/m3), and drivetrain efficiency (90 percent) are fixed representative constants.
- Regen efficiency is one number bundling motor, inverter, and battery losses, and assumes the vehicle can absorb all braking energy on any grade.
- Vehicle presets are representative class values (curb weight plus a driver, typical drag area), not measured specifications of any particular model.
- Terrain models measure ground elevation, not road deck, so bridges and tunnels can introduce artifacts in the profile.

All figures are comparative estimates, not range predictions. The model is
tested against closed-form arithmetic and physical bounds in `test/`, so it is
internally consistent; it is still an estimate.

## Prior art

[ABRP](https://abetterrouteplanner.com) is the established EV trip planner and
already accounts for elevation, weather, and charging stops. Coast is not trying
to replace it. The difference is transparency and openness: the entire energy
model is about forty lines you can read, the whole stack is open data with no
API keys or account, and the interface is built to show *why* one route costs
less rather than just returning an answer.

## Stack

- Vanilla HTML, CSS, and JavaScript as native ES modules; no build step, no framework, nothing to install to run it
- [Leaflet](https://leafletjs.com) 1.9 for the map, with CARTO dark basemap tiles
- [Chart.js](https://www.chartjs.org) 4 for the elevation profile
- [OSRM](https://project-osrm.org) public demo server for routing with alternatives
- [Nominatim](https://nominatim.org) for forward and reverse geocoding
- [Open-Meteo](https://open-meteo.com) elevation API (Copernicus DEM GLO-90) for terrain, with automatic fallback to [Open-Elevation](https://open-elevation.com)

Both CDN scripts are pinned with subresource integrity hashes, and the page
ships a Content-Security-Policy meta tag restricting scripts and connections
to exactly the services above.

## Running it

Browsers refuse to load ES modules from `file://`, so open it through any static
server:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. No build, no keys, no install.

Deployment is equally plain: the live demo is GitHub Pages serving the
repository root.

## Tests

The unit suite has no dependencies at all:

```
npm test
```

That runs `node --test "test/*.test.js"`: geometry, resampling, smoothing,
OSRM response parsing against malformed payloads, elevation provider fallback
with a stubbed fetch, and the energy model checked against closed-form
arithmetic and physical bounds. Any file can also be run directly, for
example `node test/model.test.js`.

Lint and browser tests need a one-time dev install:

```
npm install
npm run lint
npx playwright install chromium   # first time only
npm run e2e
```

The Playwright suite drives the full interface (search, suggestions, routing,
elevation, ranking, unit toggle, vehicle rescoring, error paths, a phone-sized
viewport) with every external service mocked, so it is deterministic and sends
no traffic to the public APIs. If your environment provides its own Chromium,
point `CHROMIUM_PATH` at the binary instead of running `playwright install`.

All three run in CI on every push and pull request.

## Project layout

```
index.html            markup only
css/styles.css        all styling
js/config.js          endpoints, constants, vehicle presets, palette
js/state.js           shared mutable state
js/utils.js           DOM, fetch, error text, and geometry helpers
js/bus.js             tiny event emitter
js/format.js          unit-aware formatting
js/energy.js          the physics model and ranking
js/elevation.js       resampling, elevation APIs, smoothing, artifact check
js/geocode.js         Nominatim lookup, rate limiting, on-demand search UI
js/mapview.js         Leaflet
js/chartview.js       elevation profile
js/cards.js           route cards and status line
js/routing.js         OSRM parsing and the search pipeline
js/demo.js            offline demo trip
js/app.js             entry point and wiring
test/                 dependency-free unit tests (node --test)
e2e/                  Playwright browser tests, all services mocked
```

All internal math is SI. Unit conversion happens only in `format.js`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues labeled `good first issue` are
scoped small and have context in the description.

## Roadmap

- Temperature and headwind terms in the energy model
- Auxiliary load (climate, lights) as a constant draw
- Real EPA efficiency data behind the vehicle presets
- OpenRouteService support with a user-supplied key, so the app does not depend on the OSRM demo server
- Charging stop overlay from Open Charge Map
- Bridge and tunnel artifact detection in the elevation profile
- Position marker on the map synced to elevation chart hover

## External services: what this deployment can honestly support

Coast runs entirely on shared community infrastructure. That is a feature for
an open demo and a hard limit for anything bigger. Where each service stands:

| Service | Used for | Policy highlights | Suitable for |
| --- | --- | --- | --- |
| OSRM demo server | routing | max 1 request/second, non-commercial, no uptime guarantee | demo and personal use |
| Nominatim | geocoding | max 1 request/second, no autocomplete, results must be cached, attribution required | demo and personal use |
| Open-Meteo elevation | terrain | free for non-commercial use, 100 coordinates per request, Copernicus attribution | demo and personal use |
| Open-Elevation | terrain fallback | best-effort community instance, frequently slow | fallback only |
| CARTO raster basemaps | map tiles | free tier with required CARTO and OSM attribution; CARTO has signaled the keyless raster endpoints may eventually be retired | demo and personal use |
| GitHub Pages | hosting | static only, no custom headers (hence the CSP meta tag) | fine as is |

How Coast stays inside those policies: one routing call per search, geocoding
only on explicit user action through a shared limiter spaced at least 1.1
seconds apart with session caching, at most three elevation calls per search,
and attribution in the footer and map corner.

**Do not point production traffic at this configuration.** A real deployment
with meaningful traffic needs its own routing (self-hosted OSRM, or
OpenRouteService with a key), a commercial or self-hosted geocoder, Open-Meteo
on a commercial plan, and a tile plan. Every endpoint lives in `js/config.js`,
so swapping providers is a one-line change each, plus the matching
`connect-src` entry in the CSP tag in `index.html`.

## License

[MIT](LICENSE).

## Disclaimer

Coast is a comparison tool. Energy figures depend on speed, temperature,
payload, and driving style, and should not be used for range-critical planning.
Drive safely and follow posted roads.
