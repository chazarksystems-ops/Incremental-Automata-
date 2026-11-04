import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { hashWorld } from '../../src/core/hash';
import { stepLifeN } from '../../src/core/life';
import { parseRleOrThrow } from '../../src/core/rle';
import { defaultScenario } from '../../src/scenarios/default';

interface IA {
  generation(): number;
  population(): number;
  boardHash(): string;
  running(): boolean;
  camera(): { originX: number; originY: number; zoom: number };
  cellToClient(x: number, y: number): { x: number; y: number };
  cell(x: number, y: number): number;
  log(): Array<{ generation: number; type: string }>;
}
declare global {
  interface Window { __ia: IA }
}

const gun = parseRleOrThrow(readFileSync('src/patterns/rle/gosper-glider-gun.rle', 'utf8')).grid;
const start = defaultScenario(gun);
const expectedHash = (g: number) => hashWorld(stepLifeN(start, g));

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__ia);
  return errors;
}

const gen = (page: Page) => page.evaluate(() => window.__ia.generation());
const hash = (page: Page) => page.evaluate(() => window.__ia.boardHash());

async function clickCell(page: Page, x: number, y: number) {
  const p = await page.evaluate(([cx, cy]) => window.__ia.cellToClient(cx!, cy!), [x, y]);
  await page.mouse.click(p.x, p.y);
}

test('starts with the Gosper gun chamber', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('generation')).toHaveText('0');
  await expect(page.getByTestId('population')).toHaveText('36');
  await expect(page.getByTestId('board-size')).toHaveText('128 × 128');
  expect(await hash(page)).toBe(hashWorld(start));
  expect(errors).toEqual([]);
});

test('step, play and pause; browser board matches the pure engine', async ({ page }) => {
  await open(page);
  await page.getByTestId('step').click();
  await page.keyboard.press('n');
  await expect(page.getByTestId('generation')).toHaveText('2');
  expect(await hash(page)).toBe(expectedHash(2));

  await page.getByTestId('speed').fill('9'); // 480 gen/s
  await expect(page.getByTestId('speed-value')).toHaveText('480 gen/s');
  await page.getByTestId('play').click();
  await expect(page.getByTestId('play')).toHaveText('Pause');
  await page.waitForFunction(() => window.__ia.generation() > 250);
  await page.keyboard.press(' ');
  expect(await page.evaluate(() => window.__ia.running())).toBe(false);
  const g = await gen(page);
  await page.waitForTimeout(200);
  expect(await gen(page)).toBe(g); // paused means paused
  // Running at speed in the browser must equal stepping the pure engine.
  expect(await hash(page)).toBe(expectedHash(g));
});

test('draw tool toggles cells and logs commands', async ({ page }) => {
  await open(page);
  await clickCell(page, 100, 100);
  expect(await page.evaluate(() => window.__ia.cell(100, 100))).toBe(1);
  await expect(page.getByTestId('population')).toHaveText('37');
  await clickCell(page, 100, 100);
  expect(await page.evaluate(() => window.__ia.cell(100, 100))).toBe(0);
  expect(await page.evaluate(() => window.__ia.log())).toEqual([
    { generation: 0, type: 'set-cell' },
    { generation: 0, type: 'set-cell' },
  ]);
});

test('placing a blueprint validates bounds and overlap', async ({ page }) => {
  await open(page);
  await page.getByTestId('blueprint-glider').click();
  await expect(page.getByTestId('tool-place')).toHaveAttribute('aria-checked', 'true');
  await clickCell(page, 80, 80);
  await expect(page.getByTestId('population')).toHaveText('41');
  await expect(page.getByTestId('message')).toContainText('Placed Glider');

  await clickCell(page, 80, 80); // overlaps the glider just placed
  await expect(page.getByTestId('message')).toContainText('within 1 cell');
  await expect(page.getByTestId('population')).toHaveText('41');

  await page.keyboard.press('r');
  await expect(page.getByTestId('orientation')).toHaveText('rot90');
  await page.getByTestId('blueprint-gosper-glider-gun').click();
  await clickCell(page, 127, 127); // gun can't fit at the corner
  await expect(page.getByTestId('message')).toContainText('does not fit');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-draw')).toHaveAttribute('aria-checked', 'true');
});

test('zoom, pan and fit move the camera only', async ({ page }) => {
  await open(page);
  const h = await hash(page);
  const c0 = await page.evaluate(() => window.__ia.camera());
  await page.getByTestId('zoom-in').click();
  const c1 = await page.evaluate(() => window.__ia.camera());
  expect(c1.zoom).toBeGreaterThan(c0.zoom);

  await page.getByTestId('tool-pan').click();
  const box = (await page.getByTestId('board').boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 250, { steps: 5 });
  await page.mouse.up();
  const c2 = await page.evaluate(() => window.__ia.camera());
  expect(c2.originX).toBeGreaterThan(c1.originX);

  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.wheel(0, 400);
  expect((await page.evaluate(() => window.__ia.camera())).zoom).toBeLessThan(c2.zoom);

  await page.keyboard.press('f');
  expect(await page.evaluate(() => window.__ia.camera())).toEqual(c0);
  expect(await hash(page)).toBe(h); // view changes never touch the board
});

test('RLE import rejects bad input and accepts a valid blueprint; export round-trips', async ({ page }) => {
  await open(page);
  await page.getByTestId('import-open').click();
  await page.getByTestId('rle-text').fill('x = 3, y = 3, rule = B36/S23\n3o!');
  await page.getByTestId('rle-confirm').click();
  await expect(page.getByTestId('rle-error')).toContainText('not B3/S23');
  await page.getByTestId('rle-text').fill('#N Beehive\nx = 4, y = 3, rule = B3/S23\nb2o$o2bo$b2o!');
  await page.getByTestId('rle-confirm').click();
  await expect(page.getByTestId('rle-dialog')).not.toBeVisible();
  await expect(page.getByTestId('blueprint-imported-5')).toContainText('Beehive');
  await clickCell(page, 60, 90);
  await expect(page.getByTestId('population')).toHaveText('42');

  await page.getByTestId('export').click();
  const text = await page.getByTestId('rle-text').inputValue();
  expect(text).toContain('x = 128, y = 128, rule = B3/S23');
  const exported = parseRleOrThrow(text).grid;
  expect(exported.cells.reduce((a, b) => a + b, 0)).toBe(42);
});

test('reset returns to the starting layout', async ({ page }) => {
  await open(page);
  await clickCell(page, 100, 100);
  for (let i = 0; i < 5; i++) await page.keyboard.press('n');
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('generation')).toHaveText('0');
  expect(await hash(page)).toBe(hashWorld(start));
  expect(await page.evaluate(() => window.__ia.log())).toEqual([]);
});

test('layout fits a phone-width viewport without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('board')).toBeVisible();
});
