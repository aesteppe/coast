/**
 * End-to-end behavior of the Coast UI against fully mocked services.
 * See helpers.js: no test here touches a real public API.
 */
import { test, expect } from '@playwright/test';
import { stubStatics, stubServices, netValues, OSRM_OK } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await stubStatics(page);
});

/** Drop start and destination pins through the map-click popup.
    .last(): Leaflet keeps the previous popup in the DOM while it fades out. */
async function setPointsByMap(page){
  await page.locator('#map').click({ position: { x: 150, y: 150 } });
  await page.getByRole('button', { name: 'Set as start' }).last().click();
  await page.locator('#map').click({ position: { x: 380, y: 260 } });
  await page.getByRole('button', { name: 'Set as destination' }).last().click();
}

test('demo trip renders three ranked cards, chart, and badges offline', async ({ page }) => {
  const count = await stubServices(page);
  await page.goto('/');
  await page.locator('#btnDemo').click();

  await expect(page.locator('#cards .card')).toHaveCount(3);
  await expect(page.locator('#chartBox')).toBeVisible();
  await expect(page.locator('#status')).toContainText('Demo trip loaded');
  await expect(page.locator('.badge').filter({ hasText: 'Most efficient' })).toHaveCount(1);
  await expect(page.locator('.badge').filter({ hasText: 'Fastest' })).toHaveCount(1);

  const nets = await netValues(page);
  expect(nets.length).toBe(3);
  expect([...nets].sort((a, b) => a - b)).toEqual(nets);

  /* the blocked-tiles notice appears instead of a silent black void */
  await expect(page.locator('.mapnote')).toBeVisible();

  /* demo mode must be network-free */
  expect(count.osrm + count.nominatim + count.elevation).toBe(0);
});

test('route selection works by click and by keyboard', async ({ page }) => {
  await stubServices(page);
  await page.goto('/');
  await page.locator('#btnDemo').click();

  const cards = page.locator('#cards .card');
  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveClass(/sel/);
  await expect(page.locator('#chartTitle')).toContainText('Route B');

  await cards.nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(cards.nth(2)).toHaveClass(/sel/);
  await expect(page.locator('#chartTitle')).toContainText('Route C');
});

test('full search: explicit geocoding, suggestion keyboard flow, ranked results', async ({ page }) => {
  const count = await stubServices(page);
  await page.goto('/');

  /* typing alone must never hit the geocoder (Nominatim forbids autocomplete) */
  await page.locator('#inA').fill('Alphaville');
  await page.waitForTimeout(700);
  expect(count.nominatim).toBe(0);

  /* Enter asks once; arrows pick the second suggestion */
  await page.locator('#inA').press('Enter');
  await expect(page.locator('#sugA li')).toHaveCount(3);
  await page.locator('#inA').press('ArrowDown');
  await page.locator('#inA').press('Enter');
  await expect(page.locator('#inA')).toHaveValue(/Alphaville 2/);
  await expect(page.locator('#status')).toContainText('Now set the destination');

  /* destination via click; choosing it starts the search automatically */
  await page.locator('#inB').fill('Betatown');
  await page.locator('#inB').press('Enter');
  await expect(page.locator('#sugB li')).toHaveCount(3);
  await page.locator('#sugB li').first().click();

  await expect(page.locator('#cards .card')).toHaveCount(3, { timeout: 20000 });
  await expect(page.locator('#status')).toContainText('Ranked by estimated net battery use');

  /* one geocode per explicit request, one routing call, one elevation call per route */
  expect(count.nominatim).toBe(2);
  expect(count.osrm).toBe(1);
  expect(count.elevation).toBe(3);

  /* ranking: the long-descent fixture wins and is a net charge */
  const nets = await netValues(page);
  expect(nets.length).toBe(3);
  expect([...nets].sort((a, b) => a - b)).toEqual(nets);
  expect(nets[0]).toBeLessThan(0);
  await expect(page.locator('#cards .card').first()
    .locator('.badge').filter({ hasText: 'Most efficient' })).toHaveCount(1);

  /* the climb-first fixture recovers the most regen yet does not win */
  const regs = await page.$$eval('#cards .card .energy .reg b', els =>
    els.map(el => parseFloat(el.textContent.replace(/[^\d.-]/g, ''))));
  expect(Math.max(...regs)).not.toBe(regs[0]);
});

test('unit toggle converts card figures', async ({ page }) => {
  await stubServices(page);
  await page.goto('/');
  await page.locator('#btnDemo').click();

  const dist = page.locator('#cards .card').first().locator('.stat b').first();
  await expect(dist).toContainText('mi');
  await page.locator('#uKm').click();
  await expect(dist).toContainText('km');
  await expect(page.locator('#uKm')).toHaveAttribute('aria-pressed', 'true');
});

test('vehicle changes rescore instantly with no refetch', async ({ page }) => {
  const count = await stubServices(page);
  await page.goto('/');
  await page.locator('#btnDemo').click();

  const net = page.locator('#cards .card').first().locator('.energy span b').first();
  const before = await net.textContent();

  /* the vehicle panel is a collapsed <details>; open it the way a user would */
  await page.locator('#veh summary').click();
  await expect(page.locator('#vMass')).toBeVisible();

  /* keyboard on the slider: accessibility and the recompute path in one go */
  await page.locator('#vMass').focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await expect(net).not.toHaveText(before);
  await expect(page.locator('#vMassOut')).not.toHaveText('1900 kg');

  expect(count.osrm + count.nominatim + count.elevation).toBe(0);
});

test('routing-service failure surfaces a friendly error, not a crash', async ({ page }) => {
  await stubServices(page, {
    osrm: route => route.fulfill({ status: 503, json: {} })
  });
  await page.goto('/');
  await setPointsByMap(page);
  await page.locator('#btnGo').click();

  await expect(page.locator('#status')).toHaveClass(/err/, { timeout: 15000 });
  await expect(page.locator('#status')).toContainText('try again in a moment');
  await expect(page.locator('#btnGo')).toBeEnabled();
});

test('no-route response explains itself', async ({ page }) => {
  await stubServices(page, {
    osrm: route => route.fulfill({ json: { code: 'NoRoute', routes: [] } })
  });
  await page.goto('/');
  await setPointsByMap(page);
  await page.locator('#btnGo').click();

  await expect(page.locator('#status')).toContainText('No drivable route', { timeout: 15000 });
});

test('elevation outage still shows routes, labeled honestly', async ({ page }) => {
  await stubServices(page, {
    elevation: route => route.fulfill({ status: 500, json: {} }),
    openElevation: route => route.fulfill({ status: 500, json: {} })
  });
  await page.goto('/');
  await setPointsByMap(page);
  await page.locator('#btnGo').click();

  await expect(page.locator('#cards .card')).toHaveCount(3, { timeout: 20000 });
  await expect(page.locator('#status')).toContainText('elevation data was unavailable');
  await expect(page.locator('#cards .card .noel')).toHaveCount(3);
  /* distance and duration still render */
  await expect(page.locator('#cards .card').first().locator('.stat b').first()).toContainText('mi');
});

test('single-route response says there is nothing to compare', async ({ page }) => {
  await stubServices(page, {
    osrm: route => route.fulfill({ json: { code: 'Ok', routes: [OSRM_OK.routes[0]] } })
  });
  await page.goto('/');
  await setPointsByMap(page);
  await page.locator('#btnGo').click();

  await expect(page.locator('#cards .card')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('#status')).toContainText('Only one road route');
});

test('phone-sized layout stays usable', async ({ page }) => {
  await stubServices(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#btnDemo').click();

  await expect(page.locator('#cards .card')).toHaveCount(3);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const map = await page.locator('#map').boundingBox();
  expect(map.height).toBeGreaterThan(200);

  await page.locator('#cards .card').nth(1).scrollIntoViewIfNeeded();
  await page.locator('#cards .card').nth(1).click();
  await expect(page.locator('#cards .card').nth(1)).toHaveClass(/sel/);
});
