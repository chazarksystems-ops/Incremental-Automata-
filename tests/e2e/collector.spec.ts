import { expect, test, type Page } from '@playwright/test';
import './ia';


async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?nohelp');
  await page.waitForFunction(() => !!window.__ia);
  return errors;
}

async function runUntil(page: Page, generation: number) {
  await page.getByTestId('speed').fill('9');
  if ((await page.getByTestId('play').textContent()) === 'Play') await page.getByTestId('play').click();
  await page.waitForFunction((g) => window.__ia.generation() >= g, generation, { timeout: 20_000 });
  await page.getByTestId('play').click();
}

/** Move the collector so its anchor lands on (78, 64) — 6 cells right of the default, on the gun's lane. */
async function moveCollectorOnLane(page: Page) {
  await page.getByTestId('tool-collector').click();
  const p = await page.evaluate(() => window.__ia.cellToClient(79, 65)); // gate centre = anchor + 1
  await page.mouse.click(p.x, p.y);
}

test('off-lane collector explains itself; moving it onto the lane earns energy', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('energy')).toHaveText('0');
  await expect(page.getByTestId('diagnostic')).toContainText('No gliders near the collector');

  await runUntil(page, 500);
  await expect(page.getByTestId('energy')).toHaveText('0');
  await expect(page.getByTestId('diagnostic')).toHaveText(
    'Gliders are passing 6 lanes off the gate. Move the collector 6 cells right.',
  );
  expect(Number(await page.getByTestId('near-misses').textContent())).toBeGreaterThan(0);

  // Follow the advice using the panel's "Move collector" button.
  await page.getByTestId('collector-move').click();
  await expect(page.getByTestId('tool-collector')).toHaveAttribute('aria-checked', 'true');
  const p = await page.evaluate(() => window.__ia.cellToClient(79, 65));
  await page.mouse.click(p.x, p.y);
  expect((await page.evaluate(() => window.__ia.collector())).config).toMatchObject({ x: 78, y: 64 });

  const g0 = await page.evaluate(() => window.__ia.generation());
  await runUntil(page, g0 + 360);
  const energy = await page.evaluate(() => window.__ia.energy());
  const receipts = await page.evaluate(() => window.__ia.receipts());
  expect(energy).toBeGreaterThanOrEqual(10);
  expect(energy).toBe(receipts.reduce((s, r) => s + r.amount, 0));
  expect(new Set(receipts.map((r) => r.passageId)).size).toBe(receipts.length);
  await expect(page.getByTestId('energy')).toHaveText(String(energy));
  // Gun period 30 ⇒ 10 per 300 generations, regardless of simulation speed.
  await expect(page.getByTestId('rate-300')).toHaveText('10');
  await expect(page.getByTestId('diagnostic')).toContainText('Collecting: 10 gliders');
  expect(errors).toEqual([]);
});

test('rotating the collector away from the stream stops payouts', async ({ page }) => {
  await open(page);
  await moveCollectorOnLane(page);
  await page.getByTestId('collector-rotate').click();
  await expect(page.getByTestId('collector-heading')).toHaveText('SW');
  await runUntil(page, 700);
  await expect(page.getByTestId('energy')).toHaveText('0');
});

test('step-by-step and fast play earn identical receipts', async ({ page }) => {
  await open(page);
  await moveCollectorOnLane(page);
  await runUntil(page, 400);
  const g = await page.evaluate(() => window.__ia.generation());
  const fast = await page.evaluate(() => window.__ia.receipts());
  expect(fast.length).toBeGreaterThan(0);

  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('reset').click();
  await moveCollectorOnLane(page);
  await page.getByTestId('tool-select').click();
  for (let i = 0; i < g; i++) await page.keyboard.press('n');
  await expect(page.getByTestId('generation')).toHaveText(String(g));
  expect(await page.evaluate(() => window.__ia.receipts())).toEqual(fast);
});

test('New game (confirmed) restores energy and the collector', async ({ page }) => {
  await open(page);
  await moveCollectorOnLane(page);
  await runUntil(page, 400);
  expect(await page.evaluate(() => window.__ia.energy())).toBeGreaterThan(0);
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('energy')).toHaveText('0');
  expect((await page.evaluate(() => window.__ia.collector())).config).toMatchObject({ x: 72, y: 64, heading: 'SE' });
});
