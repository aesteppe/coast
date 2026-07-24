# Issues to open

Working document, not part of the repo. Paste each block into a new issue at
`https://github.com/aesteppe/coast/issues/new`, apply the listed labels, then
delete this file or keep it locally.

Open them in this order. The first four are the ones that make the repo look
approachable; the last four are what a serious contributor would pick up.

---

## 1. Sync a position marker on the map to elevation chart hover

**Labels:** `good first issue`, `enhancement`

**Body:**

When you hover the elevation profile, the tooltip tells you the distance and
elevation at that point, but there is no way to see *where* on the map that is.
A marker that follows the cursor would connect the two views and make the
grade-colored segments much easier to interpret.

**Where to look**

- `js/chartview.js` builds the Chart.js instance. Chart.js exposes hover
  through `options.onHover` or a custom plugin.
- `js/mapview.js` owns all Leaflet code. Add an exported function there, for
  example `showProbe(lat, lon)` and `hideProbe()`, rather than reaching into
  the map from the chart module.
- `js/bus.js` is the intended way for the two to talk. Emit something like
  `chart:hover` with an index and let `js/app.js` wire the response, so
  `chartview.js` never imports `mapview.js`.

**Approach**

The route's sampled points are already stored on `r.prof`, but only distance
and elevation are kept. You will need the latitude and longitude too, which
means keeping them when the profile is built in `js/routing.js` (see the
`resample` call). That is the main piece of work.

**Acceptance**

- Hovering the chart shows a small marker at the corresponding point on the map
- Leaving the chart removes it
- Works after switching routes and after toggling units
- `node test/model.test.js` still passes

**Out of scope**

Hovering the map to highlight the chart. That is the reverse direction and can
be a separate issue.

---

## 2. Add auxiliary load to the energy model

**Labels:** `good first issue`, `model`

**Body:**

The model currently accounts only for moving the car: rolling resistance,
aerodynamic drag, and grade work. Real EVs also draw a roughly constant load
for climate control, lights, and electronics, typically somewhere in the range
of a few hundred watts to a couple of kilowatts depending on conditions.

This matters for ranking, not just for accuracy. Auxiliary load is charged per
unit of *time*, not per unit of distance, so it penalizes slow routes. A
winding descent that takes twenty minutes longer is currently free in the model
and should not be.

**Where to look**

`js/energy.js`, in `computeEnergy`. The segment loop has distance but the route
also carries `duration`, so segment time can be apportioned.

**Approach**

Add an `aux` field to `S.veh` in `js/state.js` with a sensible default, expose
it as a slider in the vehicle panel in `index.html` and `js/app.js` alongside
mass and regen, and add `aux * segmentSeconds` to the energy drawn.

Note that auxiliary load is drawn from the battery directly and should not pass
through `ETA_DRIVE`, since it does not go through the drivetrain.

**Acceptance**

- Vehicle panel has an auxiliary load control
- Raising it increases net energy on every route
- Raising it penalizes slower routes more than faster ones
- An assertion in `test/model.test.js` covers the time dependence

---

## 3. Cache elevation lookups across searches

**Labels:** `good first issue`, `enhancement`

**Body:**

Every search fetches elevation fresh, including for road segments the app has
already sampled. Re-running the same trip, or a trip that overlaps a previous
one, hits the public elevation services again for data already retrieved. Those
services are shared community infrastructure and the README commits to keeping
traffic light.

**Where to look**

`js/elevation.js`, in `fetchElev`.

**Approach**

Key an in-memory `Map` on rounded coordinates. Five decimal places is roughly a
meter, which is finer than the terrain model resolution, so four is likely
enough and will hit far more often. On each call, split the requested points
into hits and misses, fetch only the misses, then reassemble in the original
order.

Do not use `localStorage`. Keeping it in memory for the session is enough and
avoids stale data questions.

**Acceptance**

- Repeating the same route makes no elevation network request the second time
- Partial overlap fetches only the new points
- Results are identical to the uncached path

---

## 4. Accessibility pass on keyboard navigation

**Labels:** `good first issue`, `accessibility`

**Body:**

The route cards are focusable and respond to Enter and Space, but the app has
not had a real accessibility review. Known gaps:

- The geocoding suggestion lists cannot be navigated with arrow keys; you have
  to click. The CSS already has an `.hi` class for a highlighted item that
  nothing currently applies.
- The suggestion lists are not marked up as a combobox, so screen readers do
  not announce that suggestions appeared.
- The status line changes without an `aria-live` region, so updates are silent.
- Focus is not moved or announced when results render.

**Where to look**

`js/geocode.js` for `wireAuto`, `js/cards.js` for `status` and `renderCards`,
and `index.html` for the markup.

**Approach**

Take these one at a time rather than all at once. Arrow-key navigation of the
suggestion list is the highest-value single fix and is self-contained.

**Acceptance**

- Up and down arrows move through suggestions, Enter selects, Escape closes
- Status line is announced by a screen reader when it changes
- Full search flow is completable without a mouse

---

## 5. Replace the vehicle presets with real efficiency data

**Labels:** `help wanted`, `model`

**Body:**

The four vehicle presets in `js/config.js` are reasonable engineering guesses,
not measurements. Mass is close enough, but drag area (`cda`) is estimated and
the rolling resistance coefficient is a single constant for all vehicles.

Real per-model data would meaningfully improve accuracy and would let the app
say "2023 Model 3 Long Range" instead of "Sedan EV," which is what people
actually want to select.

**What is needed**

- A source. EPA publishes efficiency figures; manufacturer specs give mass and
  sometimes drag coefficient. Frontal area usually has to be estimated from
  dimensions.
- A format. A JSON file under a new `data/` directory, loaded at startup, with
  the current presets kept as a fallback for vehicles not in the list.
- A searchable selector in the vehicle panel, since a full list is too long for
  a dropdown.

**Discussion first**

Please open discussion before building this one. The data licensing and the
maintenance burden of a vehicle list are worth agreeing on up front.

---

## 6. Support OpenRouteService as a routing backend

**Labels:** `help wanted`, `enhancement`

**Body:**

Coast currently uses the OSRM public demo server, which is explicitly not
intended for production traffic. That is fine for a demo and wrong for anything
real. It also means the app cannot be self-hosted for actual use without code
changes.

**Goal**

Let the user supply an OpenRouteService API key and route through it instead,
falling back to the OSRM demo server when no key is present.

**Where to look**

`js/config.js` holds the endpoint. `js/routing.js` builds the request and
parses the response. The response shape differs between the two services, so
this needs a small adapter rather than a URL swap.

**Approach**

Add a provider abstraction in `js/routing.js` that normalizes both responses to
the shape the rest of the app expects, which is `{ distance, duration, coords }`
with coords in GeoJSON `[lon, lat]` order.

The key goes in a settings field and stays in memory or `sessionStorage`. Do
not commit a key, and do not put one in a default value.

**Acceptance**

- With no key, behavior is unchanged
- With a key, routes come from OpenRouteService and render identically
- The key is never written to the repo or to persistent storage without consent

---

## 7. Detect and flatten bridge and tunnel artifacts

**Labels:** `help wanted`, `model`

**Body:**

Terrain elevation models measure the ground surface, not the road deck. Where a
road crosses a valley on a bridge, the profile dives to the valley floor and
climbs back out. Where it passes through a tunnel, the profile climbs over the
mountain. Both create ascent and descent that the vehicle never experiences, and
both inflate the energy estimate.

This is the largest known source of error in the model and it is most severe in
exactly the mountainous terrain the app is designed for.

**Approach ideas**

None of these is obviously right, which is why this is labeled `help wanted`
rather than `good first issue`:

- Grade thresholding. Real roads rarely exceed about 10 percent sustained. A
  spike beyond that over a short distance is almost certainly an artifact and
  could be interpolated across.
- OSM tags. OSRM can return step-level data that includes `bridge` and `tunnel`
  tags. Using them would be exact but requires requesting `steps=true` and
  matching steps to sampled points.
- Outlier smoothing. A more aggressive filter than the current 3-point mean,
  applied only where the second derivative is extreme.

**Acceptance**

- A route with a known long bridge or tunnel shows materially less phantom
  ascent
- Genuine steep grades are not flattened
- Assertions in `test/model.test.js` cover both cases

---

## 8. Add temperature and headwind to the energy model

**Labels:** `help wanted`, `model`

**Body:**

Two effects with real magnitude are missing:

- **Air density** varies with temperature and altitude, and drag scales with it
  directly. The model uses a fixed sea-level value of 1.225 kg/m^3. At 2000 m
  elevation on a warm day the real figure is roughly 15 percent lower.
- **Headwind** adds to the effective air speed, and since drag goes with the
  square, a moderate headwind is not a small correction.

Battery performance also degrades in cold weather, which is a third effect and
probably a separate issue.

**Where to look**

`js/energy.js` uses `RHO` from `js/config.js` as a constant and computes `fAero`
from vehicle speed alone.

**Approach**

Air density from temperature and elevation is a closed-form calculation and the
elevation is already sampled per point, so this can be done per segment rather
than per route.

Wind requires a data source. Open-Meteo, already used as the elevation fallback,
also serves wind speed and direction, so the dependency is not new. The harder
part is projecting wind onto the direction of travel per segment.

**Acceptance**

- Air density varies with sampled elevation and a user-set temperature
- Headwind increases energy use, tailwind decreases it, crosswind mostly does not
- Assertions cover the sign and rough magnitude of both

**Discussion first**

Worth agreeing on how much configuration surface to add before building. The
vehicle panel is already at three controls.
