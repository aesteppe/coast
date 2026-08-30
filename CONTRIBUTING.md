# Contributing to Coast

Contributions are welcome, including bug reports, model corrections, and
feature work. This document covers what you need to get running and how the
code is laid out.

## Running locally

Coast uses native ES modules, which browsers refuse to load from `file://`.
You need any static server. Two that require nothing to install:

```
python3 -m http.server 8000
```

```
npx serve
```

Then open `http://localhost:8000`. There is no build step, no bundler, and no
dependency install. Edit a file, refresh the page.

## Running the tests

```
npm test
```

That runs every file in `test/` through `node --test`, with no dependencies to
install: geometry, resampling, smoothing, OSRM response parsing, elevation
provider fallback (fetch is stubbed), and the energy model checked against
closed-form arithmetic. Run one file directly for the detailed per-assertion
output, for example `node test/model.test.js`.

Lint and the browser suite need a one-time `npm install`:

```
npm run lint
npx playwright install chromium   # first time only
npm run e2e
```

The browser tests mock every external service, so they are deterministic and
hit no public API. CI runs all three on every push and pull request.

If you change `js/energy.js`, add an assertion. The model is the part of this
project most worth protecting.

## Project layout

```
index.html            markup only
css/styles.css        all styling, design tokens at the top as CSS variables
js/
  config.js           endpoints, physical constants, vehicle presets, palette
  state.js            the shared mutable state object
  utils.js            DOM shorthands, fetch with timeout, haversine
  bus.js              tiny event emitter, used to keep the graph acyclic
  format.js           unit-aware display formatting
  energy.js           the physics model and route ranking
  elevation.js        polyline resampling, elevation APIs, smoothing
  geocode.js          Nominatim lookup and input autocomplete
  mapview.js          all Leaflet code
  chartview.js        the elevation profile
  cards.js            route comparison cards and the status line
  routing.js          OSRM parsing and the search pipeline
  demo.js             offline synthetic demo trip
  app.js              entry point, render pipeline, event wiring
test/                 dependency-free unit tests, one concern per file
e2e/                  Playwright browser tests with all services mocked
```

Three conventions worth knowing:

- **All math is SI.** Meters, joules, kilograms, seconds. Unit conversion
  happens only in `format.js`. If you find yourself dividing by 1609 outside
  that file, something has gone wrong.
- **Modules do not import each other in a cycle.** The map and the cards both
  need to trigger a selection change and both need to react to one. Rather than
  importing each other they emit on `bus.js`, and `app.js` owns the response.
  Keep it that way.
- **Respect the shared services.** Every geocoding call must go through the
  limiter in `js/geocode.js`; Nominatim's policy caps traffic at one request
  per second and forbids search-as-you-type autocomplete, so do not reintroduce
  it. One routing call per search. If you add an endpoint, add it to the CSP
  `connect-src` list in `index.html` too.

## Where to start

Issues labeled `good first issue` are scoped small and have context in the
description. Broadly, the areas most open to help:

- **The energy model.** Temperature, headwind, and payload all matter and none
  are modeled. Auxiliary load (climate, lights) is also missing.
- **Vehicle data.** The presets are reasonable guesses. Real EPA efficiency
  figures per model would be a significant accuracy improvement.
- **Routing services.** The OSRM demo server is not meant for production
  traffic. Support for OpenRouteService with a user-supplied key would make the
  app deployable for real use.
- **Terrain quality.** Elevation models measure ground, not road deck, so
  bridges and tunnels produce artifacts. Detecting and flattening those is an
  open problem here.

## Pull requests

- One concern per pull request. A model change and a styling change should be
  two.
- Run the tests before opening it.
- Describe what changed and why. If it changes the model, say what physical
  effect you are capturing and where the numbers came from.
- Match the surrounding style: two-space indent, single quotes, semicolons,
  JSDoc on exported functions. `npm run lint` enforces only correctness rules;
  for formatting, read the neighbors.

## Scope

Coast is a comparison tool that shows why one route costs less energy than
another. It is not a turn-by-turn navigator and not a range predictor, and
changes that push it toward either are probably out of scope. Charging-stop
planning is a maybe; open an issue to discuss before building it.

Accuracy claims should stay honest. Every number this app shows is an estimate
from a simplified model, and the UI says so. Please keep it that way.
