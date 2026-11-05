import { expect, test, type Page } from '@playwright/test';
import './ia';

const SAVE_KEY = 'incremental-automata.save.v2';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?nohelp');
  await page.waitForFunction(() => !!window.__ia);
  return errors;
}

async function runUntil(page: Page, pred: string, arg: number, timeout = 30_000) {
  await page.getByTestId('speed').fill('9');
  if ((await page.getByTestId('play').textContent()) === 'Play') await page.getByTestId('play').click();
  await page.waitForFunction(
    ([p, a]) => (new Function('ia', 'a', `return ${p}`) as (ia: unknown, a: number) => boolean)(window.__ia, a as number),
    [pred, arg] as const,
    { timeout },
  );
  await page.getByTestId('play').click();
}

async function clickCell(page: Page, x: number, y: number) {
  const p = await page.evaluate(([cx, cy]) => window.__ia.cellToClient(cx!, cy!), [x, y]);
  await page.mouse.click(p.x, p.y);
}

/** Follow goal 1: move the starter collector onto the stream (anchor 78,64). */
async function lineUpCollector(page: Page) {
  await page.getByTestId('collector-move').click();
  await clickCell(page, 79, 65);
  await page.getByTestId('tool-select').click();
}

test('goal card walks a new player from lining up the collector to buying a second gun', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('goal-index')).toHaveText('1 of 7');
  await expect(page.getByTestId('goal-name')).toHaveText('Line up the collector');
  await expect(page.getByTestId('tool-draw')).toBeHidden(); // no free editing in factory mode
  await expect(page.getByTestId('clear')).toBeHidden();
  await expect(page.getByTestId('shop-gun')).toBeDisabled(); // 0 energy

  await lineUpCollector(page);
  await runUntil(page, 'ia.energy() >= a', 10);
  await expect(page.getByTestId('goal-name')).toHaveText('Build a second glider gun');
  await expect(page.getByTestId('shop-gun')).toBeEnabled();
  await expect(page.getByTestId('shop-gun')).toHaveText('Build · 10 ⚡');

  const before = await page.evaluate(() => window.__ia.energy());
  await page.getByTestId('shop-gun').click();
  await clickCell(page, 22, 44); // 36×9 ghost is centred on the cursor ⇒ origin (4, 40)
  await expect(page.getByTestId('message')).toContainText('Gun built at (4, 40)');
  expect(await page.evaluate(() => window.__ia.energy())).toBe(before - 10);
  expect(await page.evaluate(() => window.__ia.machines().map((m) => [m.kind, m.x, m.y, m.paid]))).toEqual([
    ['gun', 4, 4, 0],
    ['collector', 78, 64, 0],
    ['gun', 4, 40, 10],
  ]);
  await expect(page.getByTestId('goal-name')).toHaveText('Collect two streams');
  await expect(page.getByTestId('shop-gun')).toHaveText('Build · 25 ⚡');
  expect(errors).toEqual([]);
});

test('a failed build explains why and costs nothing', async ({ page }) => {
  await open(page);
  await lineUpCollector(page);
  await runUntil(page, 'ia.energy() >= a', 10);
  const e = await page.evaluate(() => window.__ia.energy());
  await page.getByTestId('shop-gun').click();
  await clickCell(page, 24, 8); // on top of the starter gun
  await expect(page.getByTestId('message')).toContainText('insulating border');
  expect(await page.evaluate(() => window.__ia.energy())).toBe(e);
  expect(await page.evaluate(() => window.__ia.machines().length)).toBe(2);
});

test('save, reload and continue; autosave status is shown', async ({ page }) => {
  await open(page);
  await lineUpCollector(page);
  await runUntil(page, 'ia.energy() >= a', 12);
  await page.getByTestId('shop-gun').click();
  await clickCell(page, 22, 44);
  await page.getByTestId('save-now').click();
  await expect(page.getByTestId('save-status')).toContainText('Saved at generation');
  const before = await page.evaluate(() => ({
    g: window.__ia.generation(),
    e: window.__ia.energy(),
    m: window.__ia.machines(),
    goals: window.__ia.goals(),
    hash: window.__ia.boardHash(),
  }));

  await page.reload();
  await page.waitForFunction(() => !!window.__ia);
  await expect(page.getByTestId('message')).toContainText('Welcome back');
  const after = await page.evaluate(() => ({
    g: window.__ia.generation(),
    e: window.__ia.energy(),
    m: window.__ia.machines(),
    goals: window.__ia.goals(),
    hash: window.__ia.boardHash(),
  }));
  expect(after).toEqual(before);
  await expect(page.getByTestId('goal-name')).toHaveText('Collect two streams');
});

test('a corrupt save is kept as a backup and the game starts fresh with an explanation', async ({ page }) => {
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, '{"format":"incremental-automata-save","version":2,"snapshot":{"rule":"B36/S23"}}');
      sessionStorage.setItem('seeded', '1');
    }
  }, SAVE_KEY);
  await open(page);
  await expect(page.getByTestId('message')).toContainText('could not be loaded');
  expect(await page.evaluate(() => window.__ia.generation())).toBe(0);
  expect(await page.evaluate((k) => localStorage.getItem(`${k}.corrupt`), SAVE_KEY)).toContain('B36/S23');
});

test('sandbox is separate: free editing there never touches the factory', async ({ page }) => {
  await open(page);
  await lineUpCollector(page);
  await runUntil(page, 'ia.energy() >= a', 3);
  const factory = await page.evaluate(() => ({ g: window.__ia.generation(), e: window.__ia.energy(), h: window.__ia.boardHash() }));

  await page.getByTestId('mode-sandbox').click();
  await expect(page.getByTestId('tool-draw')).toBeVisible();
  await expect(page.getByTestId('goal')).toBeHidden();
  expect(await page.evaluate(() => window.__ia.generation())).toBe(0);
  await page.getByTestId('tool-draw').click();
  await clickCell(page, 100, 100);
  await page.getByTestId('clear').click();
  expect(await page.evaluate(() => window.__ia.population())).toBe(0);

  await page.getByTestId('mode-factory').click();
  expect(await page.evaluate(() => ({ g: window.__ia.generation(), e: window.__ia.energy(), h: window.__ia.boardHash() }))).toEqual(factory);
});

test('removing a bought machine refunds it; orientation tools enable rotated builds', async ({ page }) => {
  await open(page);
  await lineUpCollector(page);
  await runUntil(page, 'ia.energy() >= a', 30);
  await page.getByTestId('shop-gun').click();
  await clickCell(page, 22, 44);
  const e = await page.evaluate(() => window.__ia.energy());
  const id = await page.evaluate(() => window.__ia.machines().find((m) => m.y === 40)!.id);
  await page.getByTestId(`remove-${id}`).click();
  expect(await page.evaluate(() => window.__ia.energy())).toBe(e + 10);

  // Rotation is refused without the upgrade…
  await page.getByTestId('shop-gun').click();
  await page.keyboard.press('r');
  await expect(page.getByTestId('message')).toContainText('Orientation tools');
  await expect(page.getByTestId('orientation')).toHaveText('rot0');
  await page.keyboard.press('Escape');
  // …and allowed after buying it.
  await page.getByTestId('shop-orientation').click();
  await expect(page.getByTestId('shop-orientation')).toHaveText('Owned');
  await page.getByTestId('shop-gun').click();
  await page.keyboard.press('r');
  await expect(page.getByTestId('orientation')).toHaveText('rot90');
  await clickCell(page, 110, 30); // 9×36 vertical gun
  const built = await page.evaluate(() => window.__ia.machines().find((m) => m.paid === 10 && m.x > 90));
  expect(built).toBeTruthy();
});
