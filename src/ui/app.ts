import { hashWorld } from '../core/hash';
import { stepLife } from '../core/life';
import { encodeRle, parseRle } from '../core/rle';
import { stampGrid } from '../core/stamp';
import { IDENTITY, transformGrid, transformName, type Rotation, type Transform } from '../core/transform';
import { getCell, population, type Grid } from '../core/world';
import { trackTopLeft, type DetectorState } from '../detectors/detector';
import { HEADINGS, HEADING_VECTORS, type Heading } from '../detectors/templates';
import { collectedCount, receiptsInWindow } from '../economy/ledger';
import { GenerationClock } from '../game/clock';
import { DEFAULT_CONFIG, type UpgradeId } from '../game/config';
import { Factory, type FactoryCommand, type GameSnapshot, type Machine } from '../game/factory';
import { describeHazard, laneForGun, laneHazards, snapToLane, type Box, type Hazard, type Lane } from '../game/guides';
import { History } from '../game/history';
import { Trial, compareTrials, type TrialResult } from '../game/trial';
import { GOALS } from '../game/goals';
import { lossesInWindow } from '../game/losses';
import { CHECKPOINTS_KEY, SAVE_KEY, parseCheckpoints, parseSave, serializeCheckpoints, serializeSave, type Checkpoint } from '../game/save';
import { gunOutput } from '../patterns/gun-output';
import { LIBRARY } from '../patterns/library';
import { fitBoard, panBy, screenToCellInt, zoomAt, type Camera } from '../render/camera';
import { BoardRenderer, type CollectorOverlay, type Overlay } from '../render/renderer';
import { newGame, newSandbox } from '../scenarios/default';
import { diagnoseCollector } from './diagnostics';

export const SPEED_LEVELS = [1, 2, 5, 10, 15, 30, 60, 120, 240, 480] as const;
const AUTOSAVE_MS = 5000;

const THEME = {
  background: '#0b0f14',
  board: '#0f161e',
  cell: '#7ee7c1',
  gridLine: 'rgba(138,160,180,0.12)',
  edge: '#f5b041',
  ghostOk: 'rgba(126,231,193,0.12)',
  ghostBad: 'rgba(242,119,122,0.22)',
  ghostCell: 'rgba(219,230,240,0.75)',
  hover: 'rgba(219,230,240,0.6)',
  machine: 'rgba(138,160,180,0.35)',
  machineHighlight: 'rgba(219,230,240,0.9)',
  lanePredicted: 'rgba(126,231,193,0.7)',
  loss: '#f2777a',
  gate: '#f5b041',
  gateFlash: '#fff3c4',
  zone: 'rgba(245,176,65,0.05)',
  lane: 'rgba(245,176,65,0.16)',
  tracked: 'rgba(245,176,65,0.75)',
};

type Mode = 'factory' | 'sandbox';
type Tool = 'select' | 'pan' | 'collector' | 'draw' | 'place' | 'build-gun' | 'build-collector';

const TOOL_HINTS: Record<Tool, string> = {
  select: 'Click a collector to select it. Drag empty space to pan; wheel zooms.',
  pan: 'Drag to move the view. Wheel or +/− to zoom.',
  collector: 'Click or drag to move the selected collector gate.',
  draw: 'Click or drag to toggle cells (sandbox only).',
  place: 'Click to place the selected blueprint. R rotates, M mirrors, Esc cancels.',
  'build-gun': 'Click to build the gun. The dashed line is its predicted stream. Esc cancels.',
  'build-collector': 'Click to place the new collector on a stream. R turns its direction. Esc cancels.',
};

const ARROWS: Record<Heading, string> = { SE: '↘', SW: '↙', NW: '↖', NE: '↗' };

interface Blueprint {
  id: string;
  name: string;
  detail: string;
  grid: Grid;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
export function startApp(): void {
  const canvas = $('board') as HTMLCanvasElement;
  const stage = canvas.parentElement!;
  const renderer = new BoardRenderer(canvas, THEME);
  const gun = LIBRARY.find((l) => l.entry.id === 'gosper-glider-gun')!.pattern.grid;
  const blueprintsForFactory = { gun };

  // ---------- game state ----------
  type StartupMessage = { text: string; kind: 'info' | 'warn' | 'error' };
  let startupMessage = null as StartupMessage | null;
  function loadOrNew(): Factory {
    const text = storageGet(SAVE_KEY);
    if (text) {
      const r = parseSave(text, blueprintsForFactory);
      if (r.ok) {
        startupMessage = { text: `Welcome back: loaded your chamber at generation ${r.factory.generation}.`, kind: 'info' };
        return r.factory;
      }
      storageSet(`${SAVE_KEY}.corrupt`, text);
      startupMessage = { text: `Your save could not be loaded (${r.error}). Started a new game; the old save was kept as a backup.`, kind: 'error' };
    }
    return new Factory(newGame(gun), blueprintsForFactory);
  }

  let game = loadOrNew();
  let sandbox: Factory | null = null;
  let mode: Mode = 'factory';
  const f = (): Factory => (mode === 'factory' ? game : sandbox!);
  const selected: Record<Mode, string | null> = { factory: game.detectors[0]?.config.id ?? null, sandbox: null };

  const history: Record<Mode, History> = { factory: new History(), sandbox: new History() };
  interface ExperimentState {
    baseline: GameSnapshot;
    baselineSig: string;
    mainHistory: History;
    baselineResult: TrialResult | null;
    variantResult: TrialResult | null;
    testedSig: string | null;
    running: { base: Trial | null; variant: Trial } | null;
  }
  let experiment: ExperimentState | null = null;
  let testedThroughput: { rate: number; lost: number; sig: string; generation: number } | null = null;
  let checkpoints: Checkpoint[] = [];
  let gestureSeq = 0;
  let shiftDown = false;

  const clock = new GenerationClock({ generationsPerSecond: SPEED_LEVELS[4], maxGenerationsPerTick: 64 });
  const sandboxBlueprints: Blueprint[] = LIBRARY.map((l) => ({
    id: l.entry.id,
    name: l.entry.name,
    detail: `${l.entry.width}×${l.entry.height} · ${l.entry.kind}`,
    grid: l.pattern.grid,
  }));

  let running = false;
  let tool: Tool = 'select';
  let selectedBlueprint: Blueprint = sandboxBlueprints.find((b) => b.id === 'glider') ?? sandboxBlueprints[0]!;
  let transform: Transform = { ...IDENTITY };
  let newCollectorHeading: Heading = 'SE';
  let cam: Camera = { originX: 0, originY: 0, zoom: 4 };
  let viewW = 1, viewH = 1, dpr = 1;
  let lastBoardSize = 0;
  let hover: { x: number; y: number } | null = null;
  let hoverMachine: string | null = null;
  let flashUntil = 0;
  let messageTimer = 0;
  let dirty = false;
  let lastSave: { at: number; generation: number } | null = null;

  // ---------- helpers ----------
  const playBtn = $('play') as HTMLButtonElement;
  const speedInput = $('speed') as HTMLInputElement;
  const messageEl = $('message');

  function say(text: string, kind: 'info' | 'warn' | 'error' = 'info'): void {
    messageEl.textContent = text;
    messageEl.className = `message ${kind === 'info' ? '' : kind}`;
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => (messageEl.textContent = ''), kind === 'error' ? 8000 : 4500);
  }

  function setRunning(on: boolean): void {
    if (on && experiment && mode === 'factory') {
      say('Live play is paused during an experiment. Use Test, then Keep or Discard.', 'warn');
      on = false;
    }
    running = on;
    clock.reset();
    playBtn.textContent = on ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(on));
  }

  function setSpeed(level: number): void {
    const i = Math.max(0, Math.min(SPEED_LEVELS.length - 1, level));
    speedInput.value = String(i);
    clock.generationsPerSecond = SPEED_LEVELS[i]!;
    $('speed-value').textContent = `${SPEED_LEVELS[i]} gen/s`;
  }

  function setTool(t: Tool): void {
    if ((t === 'draw' || t === 'place') && mode !== 'sandbox') t = 'select';
    tool = t;
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      b.setAttribute('aria-checked', String(b.dataset.tool === t));
    }
    canvas.classList.toggle('tool-pan', t === 'pan' || t === 'select');
    $('tool-hint').textContent = TOOL_HINTS[t];
    renderPalette();
    shopSig = '';
  }

  function setTransform(t: Transform): void {
    transform = t;
    $('orientation').textContent = transformName(t);
  }

  function canOrient(): boolean {
    return f().hasUpgrade('orientation');
  }

  function rotate(): void {
    if (tool === 'build-collector') {
      newCollectorHeading = HEADINGS[(HEADINGS.indexOf(newCollectorHeading) + 1) % HEADINGS.length] as Heading;
      return;
    }
    if (tool === 'build-gun' && !canOrient()) {
      say('Rotating guns needs the Orientation tools upgrade (Shop).', 'warn');
      return;
    }
    setTransform({ ...transform, rotation: ((transform.rotation + 90) % 360) as Rotation });
  }

  function mirror(): void {
    if (tool === 'build-gun' && !canOrient()) {
      say('Mirroring guns needs the Orientation tools upgrade (Shop).', 'warn');
      return;
    }
    setTransform({ ...transform, mirror: !transform.mirror });
  }

  const LABELS: Record<FactoryCommand['type'], string> = {
    'set-cell': 'draw', stamp: 'place pattern', clear: 'clear board', 'clear-rect': 'clear area', resize: 'resize',
    'build-gun': 'build gun', 'build-collector': 'build collector', 'remove-machine': 'remove machine',
    'buy-upgrade': 'buy upgrade', 'move-detector': 'move collector', 'set-detector-heading': 'rotate collector',
  };

  /** Apply a player command; on success it becomes one undo step (or joins the current gesture). */
  function apply(cmd: FactoryCommand, gestureKey?: string): boolean {
    const h = history[mode];
    const before = h.isCoalescing(gestureKey) ? null : f().snapshot();
    const r = f().apply(cmd);
    if (!r.ok) say(r.message, 'error');
    else if (r.warnings.length) say(r.warnings.join(' '), 'warn');
    if (r.ok) {
      if (before) h.record(before, LABELS[cmd.type], gestureKey);
      dirty = true;
      refreshPanels();
    }
    return r.ok;
  }

  /** Panels that depend on layout/experiment state; called every frame and right after any action. */
  function refreshPanels(): void {
    const fac = f();
    if (mode === 'factory') {
      const t = testedThroughput && testedThroughput.sig === layoutSig(fac) ? testedThroughput : null;
      const text = t ? `${t.rate} / 300 · ${t.lost} lost` : '–';
      const el = $('tested-rate');
      if (el.textContent !== text) el.textContent = text;
      el.title = t ? `Measured over ${DEFAULT_CONFIG.trialGenerations} generations from generation ${t.generation}` : 'Run an experiment to measure this layout';
    }
    expEls.banner.hidden = mode !== 'factory' || !experiment;
    if (experiment && !experiment.running && experiment.variantResult) {
      const stale = experiment.testedSig !== layoutSig(fac);
      if ((expEls.verdict.dataset.verdict === 'stale') !== stale) renderExperiment();
    }
  }

  function replaceFactory(next: Factory): void {
    if (mode === 'factory') game = next;
    else sandbox = next;
    setRunning(false);
    if (!next.detectors.some((d) => d.config.id === selected[mode])) selected[mode] = next.detectors[0]?.config.id ?? null;
    shopSig = machinesSig = goalSig = hazardSig = checkpointSig = '';
    if (mode === 'factory') dirty = true;
    refreshPanels();
  }

  const restoreSnapshot = (snap: GameSnapshot) => Factory.fromSnapshot(snap, blueprintsForFactory);

  function undo(): void {
    const e = history[mode].undo(f().snapshot());
    if (!e) return;
    replaceFactory(restoreSnapshot(e.snapshot));
    say(`Undid "${e.label}". Back to generation ${e.generation}.`);
  }

  function redo(): void {
    const e = history[mode].redo(f().snapshot());
    if (!e) return;
    replaceFactory(restoreSnapshot(e.snapshot));
    say(`Redid "${e.label}". Generation ${e.generation}.`);
  }

  /** Signature of everything that affects production (not the cells in flight). */
  function layoutSig(fac: Factory = f()): string {
    return JSON.stringify([
      fac.world.width,
      fac.unlocks,
      fac.machines.map((m) => [m.id, m.kind, m.x, m.y, m.transform]),
      fac.detectors.map((d) => [d.config.id, d.config.x, d.config.y, d.config.heading]),
    ]);
  }

  // ---------- construction guides ----------
  function currentLanes(fac: Factory = f()): Lane[] {
    return fac.machines.filter((m) => m.kind === 'gun').map((m) => laneForGun(m.id, gun, m.x, m.y, m.transform ?? IDENTITY));
  }
  function gunBoxes(fac: Factory = f()): Box[] {
    return fac.machines.filter((m) => m.kind === 'gun').map((m) => ({ id: m.id, x: m.x, y: m.y, width: m.width!, height: m.height! }));
  }
  function machineName(id: string): string {
    if (id === 'preview') return 'The new gun';
    const m = f().machines.find((x) => x.id === id);
    return m ? `${m.kind === 'gun' ? 'Gun' : 'Collector'} at (${m.x}, ${m.y})` : id;
  }
  let hazardSig = '';
  let hazards: Hazard[] = [];
  function renderWarnings(): void {
    const fac = f();
    const sig = layoutSig(fac);
    if (sig === hazardSig) return;
    hazardSig = sig;
    hazards = laneHazards(currentLanes(fac), gunBoxes(fac), fac.world.width, fac.world.height);
    $('warnings').replaceChildren(
      ...hazards.map((h) => {
        const li = document.createElement('li');
        li.dataset.testid = `warning-${h.kind}`;
        li.textContent = `⚠ ${describeHazard(h, machineName)}`;
        return li;
      }),
    );
  }

  /** Collector anchor under the cursor, snapped onto a predicted lane unless Shift is held. */
  function collectorTarget(cell: { x: number; y: number }, heading?: Heading): { x: number; y: number; heading?: Heading; snapped: boolean } {
    const a = anchorAt(cell);
    if (shiftDown) return { ...a, snapped: false };
    const s = snapToLane(a.x, a.y, currentLanes(), 3, heading);
    return s ? { x: s.x, y: s.y, heading: s.heading, snapped: true } : { ...a, snapped: false };
  }

  function selectedCollector(): DetectorState | null {
    const id = selected[mode];
    return f().detectors.find((d) => d.config.id === id) ?? f().detectors[0] ?? null;
  }

  function fit(): void {
    cam = fitBoard(f().world.width, f().world.height, viewW, viewH);
  }

  function setMode(m: Mode): void {
    if (m === mode) return;
    if (m === 'sandbox' && !sandbox) sandbox = new Factory(newSandbox(gun), blueprintsForFactory);
    mode = m;
    setRunning(false);
    document.body.classList.toggle('mode-sandbox', m === 'sandbox');
    document.body.classList.toggle('mode-factory', m === 'factory');
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      b.setAttribute('aria-checked', String(b.dataset.mode === m));
    }
    $('reset').textContent = m === 'factory' ? 'New game' : 'Reset sandbox';
    $('reset').title = m === 'factory' ? 'Start over (your current chamber and energy are lost)' : 'Back to the sandbox starting layout';
    setTool('select');
    setTransform({ ...IDENTITY });
    shopSig = machinesSig = hazardSig = '';
    renderExperiment();
    fit();
    say(m === 'sandbox' ? 'Sandbox: free editing and all tools. Nothing here is saved or counts toward goals.' : 'Factory mode.');
  }

  // ---------- saving ----------
  function saveNow(reason: 'auto' | 'manual'): void {
    if (mode !== 'factory' && reason === 'auto') return;
    const toSave = experiment ? restoreSnapshot(experiment.baseline) : game;
    if (storageSet(SAVE_KEY, serializeSave(toSave))) {
      lastSave = { at: performance.now(), generation: game.generation };
      dirty = false;
      if (reason === 'manual') say(`Saved at generation ${game.generation}.`);
    } else if (reason === 'manual') {
      say('Could not save: browser storage is unavailable.', 'error');
    }
  }
  window.setInterval(() => {
    if (dirty) saveNow('auto');
  }, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && dirty) saveNow('auto');
  });
  window.addEventListener('pagehide', () => {
    if (dirty) saveNow('auto');
  });

  // ---------- panel: palette (sandbox) ----------
  function renderPalette(): void {
    const palette = $('palette');
    palette.replaceChildren(
      ...sandboxBlueprints.map((bp) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.testid = `blueprint-${bp.id}`;
        b.setAttribute('aria-pressed', String(tool === 'place' && bp === selectedBlueprint));
        b.append(bp.name);
        const small = document.createElement('small');
        small.textContent = bp.detail;
        b.append(small);
        b.addEventListener('click', () => {
          selectedBlueprint = bp;
          setTool('place');
        });
        return b;
      }),
    );
  }

  // ---------- panel: shop ----------
  let shopSig = '';
  function renderShop(): void {
    const fac = f();
    const sig = [mode, tool, fac.economy.energy, fac.unlocks.join(','), fac.count('gun'), fac.count('collector')].join('|');
    if (sig === shopSig) return;
    shopSig = sig;
    const items: HTMLElement[] = [];
    const item = (testid: string, name: string, desc: string, label: string, enabled: boolean, onClick: () => void, pressed = false) => {
      const row = document.createElement('div');
      row.className = 'shop-item';
      const text = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = name;
      const p = document.createElement('small');
      p.textContent = desc;
      text.append(strong, p);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.testid = testid;
      btn.textContent = label;
      btn.disabled = !enabled;
      btn.setAttribute('aria-pressed', String(pressed));
      btn.addEventListener('click', onClick);
      row.append(text, btn);
      items.push(row);
    };
    const e = fac.economy.energy;
    const machine = (kind: 'gun' | 'collector', name: string, desc: string, buildTool: Tool) => {
      const cost = fac.machineCost(kind);
      const label = cost === null ? 'Limit reached' : `Build · ${cost} ⚡`;
      item(`shop-${kind}`, name, desc, label, cost !== null && cost <= e, () => {
        setTool(tool === buildTool ? 'select' : buildTool);
      }, tool === buildTool);
    };
    machine('gun', 'Gosper glider gun', 'Fires one glider every 30 generations. Needs a clear runway.', 'build-gun');
    machine('collector', 'Collector', 'Read-only gate: 1 energy per glider crossing it.', 'build-collector');
    for (const u of DEFAULT_CONFIG.upgrades) {
      const owned = fac.hasUpgrade(u.id);
      const cost = fac.upgradeCost(u.id);
      item(`shop-${u.id}`, u.name, u.description, owned ? 'Owned' : `Buy · ${cost} ⚡`, !owned && cost <= e, () => buyUpgrade(u.id));
    }
    $('shop').replaceChildren(...items);
  }

  function buyUpgrade(id: UpgradeId): void {
    if (apply({ type: 'buy-upgrade', upgrade: id })) {
      say(id === 'expansion' ? 'Chamber expanded to 192 × 192.' : 'Orientation tools unlocked: R rotates and M mirrors guns while building.');
    }
  }

  // ---------- panel: machines ----------
  let machinesSig = '';
  function machineLabel(m: Machine): string {
    if (m.kind === 'gun') {
      const o = gunOutput(gun, m.transform ?? IDENTITY);
      return `Gosper gun ${ARROWS[o.heading]} at (${m.x}, ${m.y})`;
    }
    const d = f().detectors.find((x) => x.config.id === m.id);
    return `Collector ${d ? ARROWS[d.config.heading] : ''} at (${d?.config.x ?? m.x}, ${d?.config.y ?? m.y})`;
  }
  function renderMachines(): void {
    const fac = f();
    const sel = selectedCollector()?.config.id ?? null;
    const sig = [mode, sel, ...fac.machines.map((m) => `${m.id}@${m.x},${m.y}`), ...fac.detectors.map((d) => d.config.heading)].join('|');
    if (sig === machinesSig) return;
    machinesSig = sig;
    $('machines').replaceChildren(
      ...fac.machines.map((m) => {
        const li = document.createElement('li');
        li.dataset.testid = `machine-${m.id}`;
        li.classList.toggle('selected', m.id === sel);
        const label = document.createElement('span');
        label.textContent = machineLabel(m);
        li.append(label);
        li.addEventListener('mouseenter', () => (hoverMachine = m.id));
        li.addEventListener('mouseleave', () => (hoverMachine = null));
        if (m.kind === 'collector') {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = m.id === sel ? 'Selected' : 'Select';
          b.disabled = m.id === sel;
          b.dataset.testid = `select-${m.id}`;
          b.addEventListener('click', () => {
            selected[mode] = m.id;
            machinesSig = '';
          });
          li.append(b);
        }
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = m.paid > 0 ? `Remove (+${m.paid})` : 'Remove';
        rm.dataset.testid = `remove-${m.id}`;
        rm.addEventListener('click', () => {
          if (apply({ type: 'remove-machine', id: m.id })) say(`Removed ${m.kind}${m.paid ? `, refunded ${m.paid} energy` : ''}.`);
        });
        li.append(rm);
        return li;
      }),
    );
  }

  // ---------- panel: goal ----------
  let goalSig = '';
  function renderGoal(): void {
    if (mode !== 'factory') return;
    const done = new Set(game.completedGoals.map((g) => g.id));
    const idx = GOALS.findIndex((g) => !done.has(g.id));
    const view = game.goalView();
    const goal = idx >= 0 ? GOALS[idx]! : null;
    const p = goal ? goal.progress(view) : { value: 1, target: 1 };
    const sig = `${idx}|${p.value}|${p.target}`;
    if (sig === goalSig) return;
    goalSig = sig;
    $('goal-index').textContent = goal ? `${idx + 1} of ${GOALS.length}` : `${GOALS.length} of ${GOALS.length}`;
    $('goal-name').textContent = goal ? goal.title : 'All goals complete. Keep improving your layout!';
    $('goal-hint').textContent = goal ? goal.hint : 'Try Sandbox mode to prototype layouts without spending energy.';
    const bar = $('goal-progress');
    bar.setAttribute('aria-valuemax', String(p.target));
    bar.setAttribute('aria-valuenow', String(p.value));
    bar.setAttribute('aria-label', goal ? `${goal.title}: ${p.value} of ${p.target}` : 'All goals complete');
    (bar.firstElementChild as HTMLElement).style.width = `${Math.round((100 * Math.min(p.value, p.target)) / p.target)}%`;
  }

  // ---------- pointer input ----------
  type Drag =
    | { kind: 'pan'; lastX: number; lastY: number; id: number }
    | { kind: 'paint'; alive: boolean; id: number; last: string; key: string }
    | { kind: 'collector'; id: number; last: string; key: string };
  let drag: Drag | null = null;

  const localPoint = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inBoard = (c: { x: number; y: number }) => c.x >= 0 && c.y >= 0 && c.x < f().world.width && c.y < f().world.height;
  const ghostOrigin = (cell: { x: number; y: number }, g: Grid) => ({ x: cell.x - Math.floor(g.width / 2), y: cell.y - Math.floor(g.height / 2) });
  /** The gate's glider centre sits at anchor + 1.5, so centre it under the cursor. */
  const anchorAt = (cell: { x: number; y: number }) => ({ x: cell.x - 1, y: cell.y - 1 });

  function collectorNear(cell: { x: number; y: number }): DetectorState | null {
    let best: DetectorState | null = null;
    let bestD = 4;
    for (const d of f().detectors) {
      const dist = Math.max(Math.abs(d.config.x + 1 - cell.x), Math.abs(d.config.y + 1 - cell.y));
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  function moveSelectedTo(cell: { x: number; y: number }, gestureKey?: string): void {
    const d = selectedCollector();
    if (!d) return say('There is no collector to move. Build one from the Shop.', 'warn');
    const a = collectorTarget(cell, d.config.heading);
    const w = f().world;
    const x = Math.min(w.width - 1, Math.max(0, a.x)), y = Math.min(w.height - 1, Math.max(0, a.y));
    if (d.config.x === x && d.config.y === y) return;
    apply({ type: 'move-detector', id: d.config.id, x, y }, gestureKey);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    const p = localPoint(e);
    const cell = screenToCellInt(cam, p.x, p.y);
    canvas.setPointerCapture(e.pointerId);
    shiftDown = e.shiftKey;
    const gestureKey = `gesture-${++gestureSeq}`;
    const startPan = () => {
      drag = { kind: 'pan', lastX: p.x, lastY: p.y, id: e.pointerId };
      canvas.classList.add('panning');
    };
    if (e.button === 1 || e.button === 2 || tool === 'pan') return startPan();
    if (e.button !== 0) return;
    switch (tool) {
      case 'select': {
        const near = collectorNear(cell);
        if (near) {
          selected[mode] = near.config.id;
          machinesSig = '';
          say(`Selected ${near.config.id}. Use Move collector to reposition it.`);
        } else startPan();
        return;
      }
      case 'collector':
        moveSelectedTo(cell, gestureKey);
        drag = { kind: 'collector', id: e.pointerId, last: `${cell.x},${cell.y}`, key: gestureKey };
        return;
      case 'build-gun': {
        const o = ghostOrigin(cell, transformGrid(gun, transform));
        if (apply({ type: 'build-gun', x: o.x, y: o.y, transform })) {
          say(`Built a Gosper gun at (${o.x}, ${o.y}). Its stream follows the dashed line.`);
          setTool('select');
        }
        return;
      }
      case 'build-collector': {
        const a = collectorTarget(cell);
        const heading = a.heading ?? newCollectorHeading;
        const before = new Set(f().detectors.map((d) => d.config.id));
        if (apply({ type: 'build-collector', x: a.x, y: a.y, heading })) {
          const added = f().detectors.find((d) => !before.has(d.config.id));
          if (added) selected[mode] = added.config.id;
          say('Collector built and selected.');
          setTool('select');
        }
        return;
      }
      case 'place': {
        const g = transformGrid(selectedBlueprint.grid, transform);
        const o = ghostOrigin(cell, g);
        if (apply({ type: 'stamp', patternId: selectedBlueprint.id, grid: selectedBlueprint.grid, x: o.x, y: o.y, transform })) {
          say(`Placed ${selectedBlueprint.name} at (${o.x}, ${o.y}), generation ${f().generation}`);
        }
        return;
      }
      case 'draw': {
        if (!inBoard(cell)) return;
        const alive = getCell(f().world, cell.x, cell.y) === 0;
        apply({ type: 'set-cell', x: cell.x, y: cell.y, alive }, gestureKey);
        drag = { kind: 'paint', alive, id: e.pointerId, last: `${cell.x},${cell.y}`, key: gestureKey };
        return;
      }
      default:
        return;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    shiftDown = e.shiftKey;
    const p = localPoint(e);
    const cell = screenToCellInt(cam, p.x, p.y);
    hover = cell;
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.kind === 'pan') {
      cam = panBy(cam, p.x - drag.lastX, p.y - drag.lastY);
      drag.lastX = p.x;
      drag.lastY = p.y;
      return;
    }
    const key = `${cell.x},${cell.y}`;
    if (key === drag.last) return;
    drag.last = key;
    shiftDown = e.shiftKey;
    if (drag.kind === 'collector') moveSelectedTo(cell, drag.key);
    else if (inBoard(cell) && (getCell(f().world, cell.x, cell.y) === 1) !== drag.alive) {
      apply({ type: 'set-cell', x: cell.x, y: cell.y, alive: drag.alive }, drag.key);
    }
  });

  const endDrag = (e: PointerEvent) => {
    if (drag && drag.id === e.pointerId) {
      drag = null;
      history[mode].endGesture();
    }
    canvas.classList.remove('panning');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => (hover = null));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = localPoint(e);
      cam = zoomAt(cam, p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );

  // ---------- buttons ----------
  playBtn.addEventListener('click', () => setRunning(!running));
  $('step').addEventListener('click', stepOnce);
  speedInput.addEventListener('input', () => setSpeed(Number(speedInput.value)));
  $('reset').addEventListener('click', () => {
    if (mode === 'sandbox') {
      sandbox = new Factory(newSandbox(gun), blueprintsForFactory);
      selected.sandbox = null;
      history.sandbox = new History();
      setRunning(false);
      fit();
      say('Sandbox reset.');
      return;
    }
    if (!window.confirm('Start a new game? Your current chamber, machines and energy will be lost (checkpoints are kept).')) return;
    experiment = null;
    history.factory = new History();
    testedThroughput = null;
    setRunning(false);
    game = new Factory(newGame(gun), blueprintsForFactory);
    selected.factory = game.detectors[0]?.config.id ?? null;
    shopSig = machinesSig = goalSig = '';
    fit();
    saveNow('auto');
    say('New game started.');
  });
  $('clear').addEventListener('click', () => {
    if (apply({ type: 'clear' })) say('Board cleared');
  });
  $('save-now').addEventListener('click', () => saveNow('manual'));
  $('zoom-in').addEventListener('click', () => (cam = zoomAt(cam, viewW / 2, viewH / 2, 1.5)));
  $('zoom-out').addEventListener('click', () => (cam = zoomAt(cam, viewW / 2, viewH / 2, 1 / 1.5)));
  $('fit').addEventListener('click', fit);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    b.addEventListener('click', () => setTool(b.dataset.tool as Tool));
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    b.addEventListener('click', () => setMode(b.dataset.mode as Mode));
  }
  $('rotate').addEventListener('click', rotate);
  $('mirror').addEventListener('click', mirror);
  $('collector-move').addEventListener('click', () => setTool('collector'));
  $('collector-rotate').addEventListener('click', () => {
    const d = selectedCollector();
    if (!d) return;
    const next = HEADINGS[(HEADINGS.indexOf(d.config.heading) + 1) % HEADINGS.length] as Heading;
    apply({ type: 'set-detector-heading', id: d.config.id, heading: next });
  });

  function stepOnce(): void {
    setRunning(false);
    if (experiment && mode === 'factory') return say('Stepping is paused during an experiment. Use Test.', 'warn');
    handleEvents(f().step(1), performance.now());
  }

  function handleEvents(ev: ReturnType<Factory['step']>, now: number): void {
    if (ev.receipts.length) flashUntil = now + 350;
    if (ev.receipts.length || ev.losses.length || ev.goals.length) dirty = true;
    for (const id of ev.goals) {
      const g = GOALS.find((x) => x.id === id);
      if (g) say(`Goal complete: ${g.title}!`);
    }
  }

  // ---------- experiments ----------
  const expEls = {
    status: $('experiment-status'),
    start: $('experiment-start') as HTMLButtonElement,
    test: $('experiment-test') as HTMLButtonElement,
    keep: $('experiment-keep') as HTMLButtonElement,
    discard: $('experiment-discard') as HTMLButtonElement,
    progress: $('experiment-progress'),
    results: $('experiment-results') as HTMLTableElement,
    verdict: $('experiment-verdict'),
    banner: $('experiment-banner'),
  };

  function startExperiment(): void {
    if (mode !== 'factory' || experiment) return;
    setRunning(false);
    experiment = {
      baseline: game.snapshot(),
      baselineSig: layoutSig(game),
      mainHistory: history.factory,
      baselineResult: null,
      variantResult: null,
      testedSig: null,
      running: null,
    };
    history.factory = new History();
    renderExperiment();
    say('Experiment started. Change the layout (build, move, remove), then press Test.');
  }

  function testExperiment(): void {
    if (!experiment || experiment.running) return;
    const gens = DEFAULT_CONFIG.trialGenerations;
    experiment.running = {
      base: experiment.baselineResult ? null : new Trial(experiment.baseline, 'Original', gens, blueprintsForFactory),
      variant: new Trial(game.snapshot(), 'With changes', gens, blueprintsForFactory),
    };
    experiment.variantResult = null;
    experiment.testedSig = layoutSig(game);
    renderExperiment();
  }

  /** Advance running trials within a per-frame time budget so the page stays responsive. */
  function advanceTrials(budgetMs: number): void {
    const run = experiment?.running;
    if (!run || !experiment) return;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (run.base && !run.base.done) run.base.advance(20);
      else if (!run.variant.done) run.variant.advance(20);
      else break;
    }
    const total = (run.base ? 1 : 0) + 1;
    const done = (run.base ? run.base.progress : 0) + run.variant.progress;
    ((expEls.progress.firstElementChild as HTMLElement).style.width = `${Math.round((100 * Math.min(done, total)) / total)}%`);
    if ((!run.base || run.base.done) && run.variant.done) {
      if (run.base) experiment.baselineResult = run.base.result();
      experiment.variantResult = run.variant.result();
      experiment.running = null;
      renderExperiment();
    }
  }

  function keepExperiment(): void {
    const ex = experiment;
    if (!ex || ex.running) return;
    history.factory = ex.mainHistory;
    if (layoutSig(game) !== ex.baselineSig) history.factory.record(ex.baseline, 'experiment');
    if (ex.variantResult && ex.testedSig === layoutSig(game)) {
      testedThroughput = { rate: ex.variantResult.steadyRate, lost: ex.variantResult.steadyLost, sig: ex.testedSig, generation: ex.variantResult.startGeneration };
    }
    experiment = null;
    dirty = true;
    renderExperiment();
    refreshPanels();
    say('Kept your changes. Live play can resume; Undo reverts the whole experiment.');
  }

  function discardExperiment(): void {
    const ex = experiment;
    if (!ex || ex.running) return;
    history.factory = ex.mainHistory;
    experiment = null;
    replaceFactory(restoreSnapshot(ex.baseline));
    if (ex.baselineResult) {
      testedThroughput = { rate: ex.baselineResult.steadyRate, lost: ex.baselineResult.steadyLost, sig: ex.baselineSig, generation: ex.baselineResult.startGeneration };
    }
    renderExperiment();
    refreshPanels();
    say('Discarded: the original layout is back, exactly as it was.');
  }

  function renderExperiment(): void {
    const ex = mode === 'factory' ? experiment : null;
    expEls.banner.hidden = !ex;
    expEls.start.hidden = !!ex;
    expEls.test.hidden = expEls.keep.hidden = expEls.discard.hidden = !ex;
    const busy = !!ex?.running;
    expEls.test.disabled = expEls.keep.disabled = expEls.discard.disabled = busy;
    expEls.test.textContent = `Test (${DEFAULT_CONFIG.trialGenerations} gen)`;
    expEls.progress.hidden = !busy;
    playBtn.disabled = !!ex;
    ($('step') as HTMLButtonElement).disabled = !!ex;
    ($('checkpoint-save') as HTMLButtonElement).disabled = !!ex;
    checkpointSig = '';
    if (!ex) {
      expEls.status.textContent = 'Try a change without risk: start an experiment, change the layout, then Test. It compares your change with the original over the same generations.';
      expEls.results.hidden = true;
      expEls.verdict.textContent = '';
      return;
    }
    expEls.status.textContent = busy
      ? `Testing both layouts for ${DEFAULT_CONFIG.trialGenerations} generations…`
      : `Experiment from generation ${ex.baseline.generation}. Change the layout, then Test.`;
    const b = ex.baselineResult, v = ex.variantResult;
    if (!b || !v) {
      expEls.results.hidden = true;
      expEls.verdict.textContent = '';
      return;
    }
    const rows: Array<[string, (r: TrialResult) => number]> = [
      ['Collected / 300 gen (steady)', (r) => r.steadyRate],
      ['Lost / 300 gen (steady)', (r) => r.steadyLost],
      [`Collected in ${v.generations} gen`, (r) => r.collected],
      ['Energy gained', (r) => r.energyGained],
      ['Near misses', (r) => r.nearMisses],
    ];
    expEls.results.tBodies[0]!.replaceChildren(
      ...rows.map(([label, get]) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = label;
        const tb = document.createElement('td');
        tb.textContent = String(get(b));
        const tv = document.createElement('td');
        tv.textContent = String(get(v));
        tr.append(th, tb, tv);
        return tr;
      }),
    );
    expEls.results.hidden = false;
    const cmp = compareTrials(b, v);
    const stale = ex.testedSig !== layoutSig(game);
    expEls.verdict.textContent = stale ? `${cmp.summary} (Layout changed since this test. Test again.)` : cmp.summary;
    expEls.verdict.dataset.verdict = stale ? 'stale' : cmp.verdict;
  }

  expEls.start.addEventListener('click', startExperiment);
  expEls.test.addEventListener('click', testExperiment);
  expEls.keep.addEventListener('click', keepExperiment);
  expEls.discard.addEventListener('click', discardExperiment);

  // ---------- checkpoints ----------
  let checkpointSig = '';
  {
    const text = storageGet(CHECKPOINTS_KEY);
    if (text) {
      const r = parseCheckpoints(text, blueprintsForFactory);
      checkpoints = r.checkpoints;
      if (r.error || r.dropped) {
        startupMessage = { text: `${r.dropped || 'Some'} checkpoint(s) could not be loaded and were skipped.`, kind: 'warn' };
      }
    }
  }
  function persistCheckpoints(): void {
    if (!storageSet(CHECKPOINTS_KEY, serializeCheckpoints(checkpoints))) say('Could not store checkpoints: browser storage is unavailable or full.', 'error');
  }
  function saveCheckpoint(): void {
    if (mode !== 'factory' || experiment) return;
    const g = game;
    const cp: Checkpoint = {
      id: `cp-${Date.now()}-${checkpoints.length}`,
      name: `Gen ${g.generation} · ${g.count('gun')} gun${g.count('gun') === 1 ? '' : 's'} · ${g.economy.energy} ⚡`,
      generation: g.generation,
      createdAt: new Date().toISOString(),
      snapshot: g.snapshot(),
    };
    checkpoints.push(cp);
    let dropped = '';
    while (checkpoints.length > DEFAULT_CONFIG.maxCheckpoints) dropped = checkpoints.shift()!.name;
    persistCheckpoints();
    checkpointSig = '';
    say(`Checkpoint saved: ${cp.name}${dropped ? ` (oldest "${dropped}" removed)` : ''}.`);
  }
  function restoreCheckpoint(cp: Checkpoint): void {
    if (experiment) return say('Finish the experiment (Keep or Discard) before restoring a checkpoint.', 'warn');
    history.factory.record(game.snapshot(), 'restore checkpoint');
    replaceFactory(restoreSnapshot(cp.snapshot));
    say(`Restored checkpoint "${cp.name}". Undo returns to where you were.`);
  }
  function renderCheckpoints(): void {
    const sig = [mode, !!experiment, ...checkpoints.map((c) => c.id)].join('|');
    if (sig === checkpointSig) return;
    checkpointSig = sig;
    $('checkpoints').replaceChildren(
      ...checkpoints.map((cp) => {
        const li = document.createElement('li');
        li.dataset.testid = `checkpoint-${cp.id}`;
        const label = document.createElement('span');
        label.textContent = cp.name;
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.textContent = 'Restore';
        restoreBtn.disabled = !!experiment;
        restoreBtn.dataset.testid = 'checkpoint-restore';
        restoreBtn.addEventListener('click', () => restoreCheckpoint(cp));
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = 'Delete';
        del.dataset.testid = 'checkpoint-delete';
        del.addEventListener('click', () => {
          checkpoints = checkpoints.filter((c) => c !== cp);
          persistCheckpoints();
          checkpointSig = '';
        });
        li.append(label, restoreBtn, del);
        return li;
      }),
    );
  }
  $('checkpoint-save').addEventListener('click', saveCheckpoint);
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);

  // ---------- RLE dialog (sandbox) ----------
  const dialog = $('rle-dialog') as HTMLDialogElement;
  const rleText = $('rle-text') as HTMLTextAreaElement;
  const rleError = $('rle-error');
  const rleConfirm = $('rle-confirm') as HTMLButtonElement;
  let dialogMode: 'import' | 'export' = 'import';

  function openDialog(m: 'import' | 'export'): void {
    dialogMode = m;
    $('rle-title').textContent = m === 'import' ? 'Import RLE' : 'Board as RLE';
    rleText.readOnly = m === 'export';
    rleText.value = m === 'export' ? encodeRle(f().world, { comments: [`Generation ${f().generation}`] }) : '';
    rleConfirm.textContent = m === 'import' ? 'Use as blueprint' : 'Copy';
    rleError.textContent = '';
    dialog.showModal();
    rleText.focus();
    if (m === 'export') rleText.select();
  }
  $('import-open').addEventListener('click', () => openDialog('import'));
  $('export').addEventListener('click', () => openDialog('export'));
  rleConfirm.addEventListener('click', (e) => {
    if (dialogMode === 'export') {
      e.preventDefault();
      void navigator.clipboard?.writeText(rleText.value).then(
        () => (rleError.textContent = 'Copied to clipboard'),
        () => (rleError.textContent = 'Copy failed. Select the text and copy it manually.'),
      );
      return;
    }
    const r = parseRle(rleText.value);
    if (!r.ok) {
      e.preventDefault();
      rleError.textContent = `${r.error.message}${r.error.line ? ` (line ${r.error.line})` : ''}`;
      return;
    }
    const bp: Blueprint = {
      id: `imported-${sandboxBlueprints.length}`,
      name: r.pattern.name ?? 'Imported',
      detail: `${r.pattern.grid.width}×${r.pattern.grid.height} · imported`,
      grid: r.pattern.grid,
    };
    sandboxBlueprints.push(bp);
    selectedBlueprint = bp;
    setTransform({ ...IDENTITY });
    setTool('place');
    say(`Imported ${bp.name}: click the board to place it`);
  });

  // ---------- keyboard ----------
  window.addEventListener('keyup', (e) => (shiftDown = e.shiftKey));
  window.addEventListener('keydown', (e) => {
    shiftDown = e.shiftKey;
    if (dialog.open || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || k === 'Z' || k === 'y' || k === 'Y')) {
      e.preventDefault();
      if (k === 'y' || k === 'Y' || e.shiftKey) redo();
      else undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === ' ') {
      e.preventDefault();
      setRunning(!running);
    } else if (k === 'n' || k === 'N' || k === '.') stepOnce();
    else if (k === 'r' || k === 'R') rotate();
    else if (k === 'm' || k === 'M') mirror();
    else if (k === 'f' || k === 'F') fit();
    else if (k === 'c' || k === 'C') setTool('collector');
    else if (k === 'Escape') setTool('select');
    else if (k === '+' || k === '=') cam = zoomAt(cam, viewW / 2, viewH / 2, 1.25);
    else if (k === '-' || k === '_') cam = zoomAt(cam, viewW / 2, viewH / 2, 0.8);
    else if (k.startsWith('Arrow')) {
      e.preventDefault();
      const d = 40;
      cam = panBy(cam, k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0, k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0);
    }
  });

  // ---------- sizing ----------
  const resize = () => {
    const r = stage.getBoundingClientRect();
    const first = viewW === 1;
    viewW = Math.max(1, r.width);
    viewH = Math.max(1, r.height);
    dpr = window.devicePixelRatio || 1;
    renderer.resize(viewW, viewH, dpr);
    if (first) fit();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---------- frame ----------
  const genEl = $('generation'), popEl = $('population'), rateEl = $('rate'), cursorEl = $('cursor');
  const energyEl = $('energy'), collectedEl = $('signals-collected'), rate300El = $('rate-300'), lost300El = $('lost-300');
  const missesEl = $('near-misses'), diagEl = $('diagnostic'), headingEl = $('collector-heading'), collectorNameEl = $('collector-name');
  const saveStatusEl = $('save-status');
  const rateWindow: Array<{ t: number; g: number }> = [];
  let last = performance.now();

  function collectorOverlay(d: DetectorState, sel: boolean, ghost = false): CollectorOverlay {
    const [hx, hy] = HEADING_VECTORS[d.config.heading];
    const p = f().detectorParams;
    return {
      x: d.config.x,
      y: d.config.y,
      hx,
      hy,
      gateHalfWidth: p.gateHalfWidth,
      observeHalfWidth: p.observeHalfWidth,
      observeDepth: p.observeDepth,
      tracks: d.tracks.map((t) => trackTopLeft(d.config.heading, t)),
      flash: sel && performance.now() < flashUntil ? (flashUntil - performance.now()) / 350 : 0,
      selected: sel,
      ghost,
    };
  }

  function frame(now: number): void {
    const dt = now - last;
    last = now;
    const fac = f();
    if (running) handleEvents(fac.step(clock.tick(dt)), now);
    advanceTrials(8);

    const w = fac.world;
    if (w.width !== lastBoardSize) {
      if (lastBoardSize !== 0) fit();
      lastBoardSize = w.width;
      $('board-size').textContent = `${w.width} × ${w.height}`;
    }
    rateWindow.push({ t: now, g: w.generation });
    while (rateWindow.length > 2 && now - rateWindow[0]!.t > 1000) rateWindow.shift();
    const first = rateWindow[0]!;
    const rate = running && now > first.t ? ((w.generation - first.g) * 1000) / (now - first.t) : 0;

    genEl.textContent = String(w.generation);
    popEl.textContent = String(population(w));
    rateEl.textContent = `${rate.toFixed(rate < 10 ? 1 : 0)} gen/s${clock.lagging ? ' (capped)' : ''}`;
    cursorEl.textContent = hover && inBoard(hover) ? `${hover.x}, ${hover.y}` : '–';

    const win = DEFAULT_CONFIG.rateWindow;
    const recent = receiptsInWindow(fac.economy, w.generation, win);
    energyEl.textContent = String(fac.economy.energy);
    collectedEl.textContent = String(collectedCount(fac.economy));
    rate300El.textContent = String(recent);
    lost300El.textContent = String(lossesInWindow(fac.losses, w.generation, win));

    const det = selectedCollector();
    if (det) {
      collectorNameEl.textContent = det.config.id;
      missesEl.textContent = String(det.nearMisses);
      headingEl.textContent = det.config.heading;
      const ownRecent = fac.economy.receipts.filter((r) => r.detectorId === det.config.id && r.generation > w.generation - win).length;
      const dg = diagnoseCollector(det, w.generation, ownRecent, win);
      if (diagEl.textContent !== dg.text) diagEl.textContent = dg.text;
      diagEl.dataset.level = dg.level;
    } else {
      collectorNameEl.textContent = '';
      missesEl.textContent = '–';
      headingEl.textContent = '–';
      diagEl.textContent = 'No collector. Build one from the Shop.';
      diagEl.dataset.level = 'warn';
    }
    renderShop();
    renderMachines();
    renderGoal();
    renderWarnings();
    renderCheckpoints();
    const h = history[mode];
    const undoBtn = $('undo') as HTMLButtonElement, redoBtn = $('redo') as HTMLButtonElement;
    undoBtn.disabled = !h.canUndo || !!experiment?.running;
    redoBtn.disabled = !h.canRedo || !!experiment?.running;
    undoBtn.title = h.undoLabel ? `Undo ${h.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
    redoBtn.title = h.redoLabel ? `Redo ${h.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo';
    refreshPanels();
    if (mode === 'factory') {
      saveStatusEl.textContent = lastSave
        ? `Saved at generation ${lastSave.generation} (${Math.round((now - lastSave.at) / 1000)} s ago)`
        : 'Not saved yet';
    }

    // ----- overlay -----
    const overlay: Overlay = { collectors: [], guns: [], lanes: [] };
    for (const m of fac.machines) {
      if (m.kind !== 'gun') continue;
      overlay.guns!.push({ x: m.x, y: m.y, width: m.width!, height: m.height!, highlight: m.id === hoverMachine });
      const o = gunOutput(gun, m.transform ?? IDENTITY);
      const [hx, hy] = HEADING_VECTORS[o.heading];
      const danger = hazards.some((hz) => hz.source === m.id || (hz.kind !== 'hits-machine' && hz.target === m.id));
      overlay.lanes!.push({ ax: m.x + o.anchorDx, ay: m.y + o.anchorDy, hx, hy, strong: m.id === hoverMachine, danger });
    }
    overlay.hazardMarks = hazards.map((hz) => ({ x: hz.x, y: hz.y }));
    let previewWarning = '';
    for (const d of fac.detectors) overlay.collectors!.push(collectorOverlay(d, d === det));
    overlay.lossMarks = fac.losses.recent
      .filter((l) => w.generation - l.generation < 120)
      .map((l) => ({ x: l.x, y: l.y, alpha: 1 - (w.generation - l.generation) / 120 }));

    if (hover && (tool === 'build-gun' || tool === 'place')) {
      const base = tool === 'build-gun' ? gun : selectedBlueprint.grid;
      const g = transformGrid(base, transform);
      const o = ghostOrigin(hover, g);
      const affordable = tool !== 'build-gun' || (fac.machineCost('gun') ?? Infinity) <= fac.economy.energy;
      overlay.ghost = { grid: g, x: o.x, y: o.y, valid: affordable && stampGrid(w, base, o.x, o.y, { transform }).ok };
      if (tool === 'build-gun') {
        const out = gunOutput(gun, transform);
        const [hx, hy] = HEADING_VECTORS[out.heading];
        const previewLane = laneForGun('preview', gun, o.x, o.y, transform);
        const previewHz = laneHazards(
          [...currentLanes(fac), previewLane],
          [...gunBoxes(fac), { id: 'preview', x: o.x, y: o.y, width: g.width, height: g.height }],
          w.width,
          w.height,
        ).filter((hz) => hz.source === 'preview' || hz.target === 'preview');
        overlay.lanes!.push({ ax: o.x + out.anchorDx, ay: o.y + out.anchorDy, hx, hy, strong: true, danger: previewHz.length > 0 });
        overlay.hazardMarks!.push(...previewHz.map((hz) => ({ x: hz.x, y: hz.y })));
        previewWarning = previewHz.map((hz) => `⚠ ${describeHazard(hz, machineName)}`).join(' ');
      }
    } else if (hover && (tool === 'build-collector' || tool === 'collector')) {
      const sel = selectedCollector();
      const t = collectorTarget(hover, tool === 'collector' ? sel?.config.heading : undefined);
      const heading = tool === 'collector' ? (sel?.config.heading ?? 'SE') : (t.heading ?? newCollectorHeading);
      if (t.snapped) overlay.snapMark = { x: t.x, y: t.y };
      overlay.collectors!.push(
        collectorOverlay({ config: { id: 'ghost', x: t.x, y: t.y, heading }, tracks: [], collected: 0, nearMisses: 0, lastMissOffset: null, lastMissGeneration: null, lastSignalGeneration: null }, true, true),
      );
    } else if (hover && tool === 'draw') {
      overlay.hoverCell = hover;
    }
    const pw = $('preview-warning');
    if (pw.textContent !== previewWarning) pw.textContent = previewWarning;
    pw.hidden = !previewWarning;
    renderer.draw(w, cam, dpr, overlay);
    requestAnimationFrame(frame);
  }

  setSpeed(4);
  document.body.classList.add('mode-factory');
  setTool('select');
  setTransform({ ...IDENTITY });
  const sm = startupMessage as StartupMessage | null;
  if (sm) say(sm.text, sm.kind);
  requestAnimationFrame(frame);

  // Read-only debug handle for /playtest and e2e tests (dev builds only).
  if (import.meta.env.DEV) {
    (window as unknown as { __ia: unknown }).__ia = {
      mode: () => mode,
      generation: () => f().generation,
      population: () => population(f().world),
      boardHash: () => hashWorld(f().world),
      running: () => running,
      camera: () => ({ ...cam }),
      cellToClient: (x: number, y: number) => {
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (x + 0.5 - cam.originX) * cam.zoom, y: r.top + (y + 0.5 - cam.originY) * cam.zoom };
      },
      cell: (x: number, y: number) => getCell(f().world, x, y),
      log: () => f().log.map((l) => ({ generation: l.generation, type: l.command.type })),
      energy: () => f().economy.energy,
      receipts: () => f().economy.receipts.map((r) => ({ ...r })),
      collector: () => structuredClone(selectedCollector()),
      collectors: () => structuredClone(f().detectors),
      machines: () => structuredClone(f().machines),
      goals: () => f().completedGoals.map((g) => g.id),
      losses: () => lossesInWindow(f().losses, f().generation, DEFAULT_CONFIG.rateWindow),
      unlocks: () => [...f().unlocks],
      boardSize: () => ({ width: f().world.width, height: f().world.height }),
      snapshotJson: () => JSON.stringify(f().snapshot()),
      history: () => history[mode].depth,
      experiment: () =>
        experiment && {
          baselineGeneration: experiment.baseline.generation,
          running: !!experiment.running,
          baseline: experiment.baselineResult,
          variant: experiment.variantResult,
        },
      hazards: () => hazards.map((h) => ({ ...h })),
      checkpoints: () => checkpoints.map((c) => ({ id: c.id, name: c.name, generation: c.generation })),
      benchmark: (frames = 200) => {
        let t = performance.now();
        for (let i = 0; i < frames; i++) renderer.draw(f().world, cam, dpr);
        const renderMs = (performance.now() - t) / frames;
        let ww = f().world;
        t = performance.now();
        for (let i = 0; i < frames; i++) ww = stepLife(ww);
        const stepMs = (performance.now() - t) / frames;
        return { renderMs, stepMs, canvas: { width: canvas.width, height: canvas.height }, dpr };
      },
    };
  }
}
