import { expect, test, type Page } from '@playwright/test';
import './ia';

// Regression tests for the first human playtest (2026-11-05):
//  1. two Gosper guns placed side by side wrecked each other
//  2. no clear way to collect a second gun's stream
//  3. not enough in-game instructions on what to do and test

async function open(page: Page, query = '?nohelp') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => !!window.__ia);
  return errors;
}

async function cellPoint(page: Page, x: number, y: number) {
  return page.evaluate(([cx, cy]) => window.__ia.cellToClient(cx!, cy!), [x, y]);
}

async function clickCell(page: Page, x: number, y: number) {
  const p = await cellPoint(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

async function earn(page: Page, energy: number) {
  await page.getByTestId('speed').fill('9');
  await page.getByTestId('play').click();
  await page.waitForFunction((e) => window.__ia.energy() >= e, energy, { timeout: 30_000 });
  await page.getByTestId('play').click();
}

async function lineUp(page: Page) {
  await page.getByTestId('collector-move').click();
  await clickCell(page, 79, 65);
  await page.getByTestId('tool-select').click();
}

test('first visit opens How to play; it stays closed after that and reopens from Help', async ({ page }) => {
  const errors = await open(page, '');
  await expect(page.getByTestId('help-dialog')).toBeVisible();
  await expect(page.getByTestId('help-dialog')).toContainText('insulating border');
  await page.getByTestId('help-close').click();
  await expect(page.getByTestId('help-dialog')).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => !!window.__ia);
  await expect(page.getByTestId('help-dialog')).toBeHidden();
  await page.getByTestId('help-open').click();
  await expect(page.getByTestId('help-dialog')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the goal card gives numbered steps and highlights the control to use', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('goal-steps').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('goal-steps')).toContainText('Press “Move collector”');
  await expect(page.getByTestId('collector-move')).toHaveClass(/pulse/);
  await page.getByTestId('goal-show').click();
  await expect(page.getByTestId('collector-move')).toBeInViewport();
  await expect(page.getByTestId('collector-move')).toBeFocused();
  await lineUp(page);
  await earn(page, 10);
  await expect(page.getByTestId('goal-name')).toHaveText('Build a second glider gun');
  await expect(page.getByTestId('shop-gun')).toHaveClass(/pulse/);
  await expect(page.getByTestId('collector-move')).not.toHaveClass(/pulse/);
});

test('a gun right next to another is refused with an explanation, before and after clicking', async ({ page }) => {
  await open(page);
  await lineUp(page);
  await earn(page, 10);
  const e = await page.evaluate(() => window.__ia.energy());
  await page.getByTestId('shop-gun').click();
  // The playtester's placement: second gun directly to the right of the starter, one empty column apart.
  const p = await cellPoint(page, 41 + 18, 4 + 4); // ghost origin (41, 4)
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('preview-warning')).toContainText('insulating border');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('message')).toContainText('insulating border');
  expect(await page.evaluate(() => window.__ia.energy())).toBe(e);
  expect(await page.evaluate(() => window.__ia.machines().length)).toBe(2);
  await expect(page.getByTestId('task-too-close')).toHaveClass(/done/);
});

test('a new gun is marked "not collected" and "Add collector" puts a working collector on its stream', async ({ page }) => {
  await open(page);
  await lineUp(page);
  await expect(page.getByTestId('coverage-gun-1')).toHaveText('✓ collected');
  await earn(page, 20);
  await page.getByTestId('shop-gun').click();
  await clickCell(page, 22, 44); // gun at (4, 40)
  await expect(page.getByTestId('message')).toContainText('not collected yet');
  const gunId = await page.evaluate(() => window.__ia.machines().find((m) => m.y === 40)!.id);
  await expect(page.getByTestId(`coverage-${gunId}`)).toHaveText('⚠ not collected');
  const add = page.getByTestId(`collect-${gunId}`);
  await expect(add).toHaveText('Add collector · 10 ⚡');
  await expect(add).toHaveClass(/pulse/); // goal "Collect two streams" points at it
  await add.click();
  await expect(page.getByTestId(`coverage-${gunId}`)).toHaveText('✓ collected');
  await expect(page.getByTestId('goal-name')).toHaveText('Collect two streams');
  await page.getByTestId('speed').fill('9');
  await page.getByTestId('play').click();
  await page.waitForFunction(() => (window.__ia as unknown as { goals(): string[] }).goals().includes('two-streams'), null, { timeout: 30_000 });
  await page.getByTestId('play').click();
  await expect(page.getByTestId('task-add-collector')).toHaveClass(/done/);
  await expect(page.getByTestId('task-tutorial')).toHaveClass(/done/);
});

test('the playtest checklist ticks itself, keeps notes, and produces a copyable report', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('playtest-count')).toHaveText('0 / 10');
  await lineUp(page);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('task-undo')).toHaveClass(/done/);
  await page.getByTestId('playtest').locator('summary').click(); // the checklist starts collapsed
  await page.getByTestId('playtest-notes').fill('Dashed line was clear once I read the help.');
  await page.reload();
  await page.waitForFunction(() => !!window.__ia);
  await expect(page.getByTestId('playtest-notes')).toHaveValue('Dashed line was clear once I read the help.');
  await page.getByTestId('playtest').locator('summary').click();
  await page.getByTestId('playtest-report').click();
  const report = await page.getByTestId('report-text').inputValue();
  expect(report).toContain('[x] Undo something');
  expect(report).toContain('[ ] Use “Add collector”');
  expect(report).toContain('Dashed line was clear once I read the help.');
});
