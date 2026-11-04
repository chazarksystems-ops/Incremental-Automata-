import { expect, test, type Page } from '@playwright/test';
import './ia';

interface IA4 {
  snapshotJson(): string;
  history(): { undo: number; redo: number };
  experiment(): null | { baselineGeneration: number; running: boolean; baseline: { steadyRate: number; steadyLost: number } | null; variant: { steadyRate: number; steadyLost: number } | null };
  checkpoints(): Array<{ id: string; name: string; generation: number }>;
  hazards(): Array<{ kind: string; source: string; target: string }>;
}

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__ia);
  return errors;
}

async function clickCell(page: Page, x: number, y: number) {
  const p = await page.evaluate(([cx, cy]) => window.__ia.cellToClient(cx!, cy!), [x, y]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

async function runUntilEnergy(page: Page, energy: number) {
  await page.getByTestId('speed').fill('9');
  await page.getByTestId('play').click();
  await page.waitForFunction((e) => window.__ia.energy() >= e, energy, { timeout: 30_000 });
  await page.getByTestId('play').click();
}

const snapshot = (page: Page) => page.evaluate(() => (window.__ia as unknown as IA4).snapshotJson());

async function waitForTest(page: Page) {
  await page.waitForFunction(() => {
    const e = (window.__ia as unknown as IA4).experiment();
    return !!e && !e.running && !!e.variant;
  }, null, { timeout: 30_000 });
}

/** Move the starter collector onto the stream, aiming 2 lanes off and relying on snapping. */
async function lineUp(page: Page) {
  await page.getByTestId('collector-move').click();
  await clickCell(page, 77, 65);
  await page.getByTestId('tool-select').click();
}

test('collectors snap onto predicted lanes (Shift disables snapping)', async ({ page }) => {
  await open(page);
  await lineUp(page);
  expect((await page.evaluate(() => window.__ia.collector())).config).toMatchObject({ x: 78, y: 64 });
  await page.getByTestId('collector-move').click();
  await page.keyboard.down('Shift');
  await clickCell(page, 77, 65);
  await page.keyboard.up('Shift');
  expect((await page.evaluate(() => window.__ia.collector())).config).toMatchObject({ x: 76, y: 64 });
});

test('undo and redo restore exact states, including time', async ({ page }) => {
  const errors = await open(page);
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.getByTestId('step').click();
  const s0 = await snapshot(page);
  await lineUp(page);
  await runUntilEnergy(page, 10);
  const s1 = await snapshot(page);
  await page.getByTestId('undo').click();
  expect(await snapshot(page)).toBe(s0);
  await expect(page.getByTestId('message')).toContainText('Undid "move collector"');
  await page.keyboard.press('Control+Shift+z');
  expect(await snapshot(page)).toBe(s1);
  expect(errors).toEqual([]);
});

test('experiment: test detects the improvement; Discard restores the original bit for bit', async ({ page }) => {
  const errors = await open(page);
  await lineUp(page);
  await runUntilEnergy(page, 26);
  const original = await snapshot(page);

  await page.getByTestId('experiment-start').click();
  await expect(page.getByTestId('experiment-banner')).toBeVisible();
  await expect(page.getByTestId('play')).toBeDisabled();

  await page.getByTestId('shop-gun').click();
  await clickCell(page, 22, 44); // gun at (4, 40)
  await page.getByTestId('experiment-test').click();
  await waitForTest(page);
  await expect(page.getByTestId('experiment-verdict')).toHaveText('Worse: collected ±0 per 300 gen, lost +10.');

  await page.getByTestId('shop-collector').click();
  await clickCell(page, 50, 73); // snaps onto the new stream
  await expect(page.getByTestId('experiment-verdict')).toContainText('Layout changed since this test');
  await page.getByTestId('experiment-test').click();
  await waitForTest(page);
  await expect(page.getByTestId('experiment-verdict')).toHaveText('Better: collected +10 per 300 gen, lost ±0.');
  await expect(page.getByTestId('experiment-results')).toContainText('Collected / 300 gen (steady)');
  const gen = await page.evaluate(() => window.__ia.generation());
  expect(await page.evaluate(() => (window.__ia as unknown as IA4).experiment()!.baselineGeneration)).toBe(gen); // no time passed

  await page.getByTestId('experiment-discard').click();
  expect(await snapshot(page)).toBe(original);
  await expect(page.getByTestId('tested-rate')).toHaveText('10 / 300 · 0 lost');
  await expect(page.getByTestId('play')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('experiment: Keep commits the change, shows tested throughput, and one Undo reverts it all', async ({ page }) => {
  await open(page);
  await lineUp(page);
  await runUntilEnergy(page, 26);
  const original = await snapshot(page);
  await page.getByTestId('experiment-start').click();
  await page.getByTestId('shop-gun').click();
  await clickCell(page, 22, 44);
  await page.getByTestId('shop-collector').click();
  await clickCell(page, 50, 73);
  await page.getByTestId('experiment-test').click();
  await waitForTest(page);
  await page.getByTestId('experiment-keep').click();
  await expect(page.getByTestId('tested-rate')).toHaveText('20 / 300 · 0 lost');
  expect(await page.evaluate(() => window.__ia.machines().length)).toBe(4);
  await expect(page.getByTestId('undo')).toHaveAttribute('title', 'Undo experiment (Ctrl+Z)');
  await page.getByTestId('undo').click();
  expect(await snapshot(page)).toBe(original);
});

test('checkpoints: save, restore exactly, undo the restore, survive a reload', async ({ page }) => {
  await open(page);
  await lineUp(page);
  await runUntilEnergy(page, 5);
  await page.getByTestId('checkpoint-save').click();
  const cp = await snapshot(page);
  await runUntilEnergy(page, 12);
  const later = await snapshot(page);

  await page.getByTestId('checkpoint-restore').first().click();
  expect(await snapshot(page)).toBe(cp);
  await page.getByTestId('undo').click();
  expect(await snapshot(page)).toBe(later);

  await page.reload();
  await page.waitForFunction(() => !!window.__ia);
  const list = await page.evaluate(() => (window.__ia as unknown as IA4).checkpoints());
  expect(list).toHaveLength(1);
  await page.getByTestId('checkpoint-restore').first().click();
  expect(await snapshot(page)).toBe(cp);
});

test('the build preview warns when a new stream would hit a machine, and not on a safe spot', async ({ page }) => {
  await open(page);
  await lineUp(page);
  await runUntilEnergy(page, 12);
  await page.getByTestId('shop-gun').click();
  const p = await page.evaluate(() => window.__ia.cellToClient(22, 28)); // origin (4, 24)
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('preview-warning')).toBeVisible();
  await expect(page.getByTestId('preview-warning')).toContainText('stream runs into');
  // A safe spot shows no warning.
  const q = await page.evaluate(() => window.__ia.cellToClient(22, 44));
  await page.mouse.move(q.x, q.y);
  await expect(page.getByTestId('preview-warning')).toBeHidden();
  await page.keyboard.press('Escape');
});
