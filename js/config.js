/**
 * Static configuration: API endpoints, physical constants, vehicle presets, palette.
 * Nothing here changes at runtime. Mutable values live in state.js.
 */

/* ---- service endpoints ---- */
export const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
export const NOMI = 'https://nominatim.openstreetmap.org';
export const OPEN_ELEV = 'https://api.open-elevation.com/api/v1/lookup';
export const OPEN_METEO = 'https://api.open-meteo.com/v1/elevation';
export const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

/* ---- unit conversion ---- */
export const MI = 1609.344;   /* meters per mile */
export const FT = 0.3048;     /* meters per foot */

/* ---- physics ----
   G          gravitational acceleration, m/s^2
   RHO        air density at sea level, kg/m^3
   CRR        coefficient of rolling resistance, typical passenger tire on asphalt
   ETA_DRIVE  drivetrain efficiency applied to energy drawn from the battery      */
export const G = 9.81;
export const RHO = 1.225;
export const CRR = 0.010;
export const ETA_DRIVE = 0.90;

/* ---- vehicle presets ----
   mass in kg (curb weight plus a driver), cda is the drag area Cd * A in m^2 */
export const PRESETS = {
  compact: { mass: 1650, cda: 0.55 },
  sedan:   { mass: 1900, cda: 0.58 },
  suv:     { mass: 2350, cda: 0.70 },
  truck:   { mass: 3100, cda: 0.86 }
};

/* ---- palette, kept in sync with the CSS custom properties in css/styles.css ---- */
export const COLOR = {
  grn: '#3DDC97',   /* descent and regen */
  amb: '#F2B33D',   /* ascent and cost */
  blu: '#6BB2F2',   /* fastest route */
  dim: '#5B6B7A',   /* flat and unselected */
  grid: 'rgba(255,255,255,.06)',
  tick: '#8FA0AE'
};

/* ---- service etiquette ----
   Nominatim's usage policy caps traffic at one request per second; every
   geocoding call is spaced at least this many ms after the previous one. */
export const NOMI_MIN_INTERVAL = 1100;

/* ---- routing behavior ---- */
export const MAX_ALTERNATIVES = 3;
export const SAMPLE_MIN = 40;    /* fewest elevation samples per route */
export const SAMPLE_MAX = 100;   /* most samples; also Open-Meteo's per-request coordinate limit, so keep it <= 100 */
export const SAMPLE_SPACING = 500; /* target meters between samples */

/* Sampled grades above this fraction are treated as terrain-model artifacts
   (bridge spans, canyon walls); the route card labels the estimate as rough. */
export const GRADE_SUSPECT = 0.30;
