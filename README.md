# Coast

Regen-optimized EV routing in a single HTML file. Coast compares real driving routes by how much energy the trip will actually cost after regenerative braking, and highlights the alternative that recovers the most on descents.

**Live demo:** [aesteppe.github.io/coast](https://aesteppe.github.io/coast/)

![Coast interface](screenshot.png)

## What it does

- Geocoded start and destination search with live suggestions, plus map-click point placement and browser geolocation
- Requests up to three road alternatives from OSRM for every trip
- Samples each route against a terrain elevation model (40 to 100 evenly spaced points per route)
- Runs a physics-based energy estimate per route and ranks alternatives by net battery use
- Grade-painted elevation profile: descents render green, climbs render amber
- Per-route comparison cards with distance, drive time, ascent, descent, downhill share, net battery draw, regen recovered, and efficiency
- Adjustable vehicle model: preset classes (compact, sedan, SUV, pickup), mass, and regen efficiency, with instant recomputation
- Imperial and metric unit toggle
- Built-in offline demo trip: a synthetic mountain-pass descent with three contrasting alternatives, so the entire interface can be exercised without any network access

## How the ranking works

For each sampled segment the model computes mechanical energy as rolling resistance plus aerodynamic drag plus grade work:

```
E = (Crr * m * g + 0.5 * rho * CdA * v^2) * d + m * g * dh
```

Positive segments draw from the battery through a fixed drivetrain efficiency (90 percent). Negative segments, where the descent is steep enough to overcome resistance, return energy through regenerative braking at the configured regen efficiency (50 to 80 percent, default 68 percent). Routes are sorted by estimated net battery use, which naturally favors downhill-heavy paths where braking energy is recovered instead of wasted. The model is intentionally honest: a detour that climbs first can never pay for itself, so the winner is the route that wastes the least. Elevation samples pass through a short moving average to suppress terrain-model noise before ascent and descent are summed. All figures are comparative estimates, not range predictions.

## Stack

- Vanilla HTML, CSS, and JavaScript in one file; no build step, no framework
- [Leaflet](https://leafletjs.com) 1.9 for the map, with CARTO dark basemap tiles
- [Chart.js](https://www.chartjs.org) 4 for the elevation profile
- [OSRM](https://project-osrm.org) public demo server for routing with alternatives
- [Nominatim](https://nominatim.org) for forward and reverse geocoding
- [Open-Elevation](https://open-elevation.com) for terrain data, with automatic fallback to the [Open-Meteo](https://open-meteo.com) elevation API

## Running it

Open `index.html` in any modern browser. No server, keys, or install required; the app calls public APIs directly from the page.

Sandboxed previews (for example the claude.ai artifact viewer) block outside network requests, which disables map tiles, routing, geocoding, and elevation. In those environments use the demo trip button; open the file in a normal browser for live routing.

The live demo is served with GitHub Pages from the repository root. Netlify Drop also works with the same files.

## API notes and limits

- The OSRM demo server and Nominatim are shared community infrastructure with fair-use policies. Coast keeps traffic light: one routing call per search, debounced geocoding at roughly one request per keystroke pause, and at most three elevation calls per search.
- The public Open-Elevation instance can be slow or briefly unavailable; Coast falls back to Open-Meteo automatically, and a route still renders with distance and time if both elevation sources fail.
- Terrain models measure ground elevation, not road grade separations, so bridges and tunnels can introduce small artifacts in the profile.

## Disclaimer

Coast is a comparison tool. Energy figures depend on speed, temperature, payload, and driving style, and should not be used for range-critical planning. Drive safely and follow posted roads.
