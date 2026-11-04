import { hashWorld } from '../core/hash';
import { stepLife } from '../core/life';
import { encodeRle, parseRle } from '../core/rle';
import { stampGrid } from '../core/stamp';
import { IDENTITY, transformGrid, transformName, type Rotation, type Transform } from '../core/transform';
import { getCell, population, type Grid } from '../core/world';
import { GenerationClock } from '../game/clock';
import { Simulation } from '../game/simulation';
import { LIBRARY } from '../patterns/library';
import { fitBoard, panBy, screenToCellInt, zoomAt, type Camera } from '../render/camera';
import { BoardRenderer, type Overlay } from '../render/renderer';
import { defaultScenario } from '../scenarios/default';

export const SPEED_LEVELS = [1, 2, 5, 10, 15, 30, 60, 120, 240, 480] as const;

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
};

type Tool = 'draw' | 'pan' | 'place';

interface Blueprint {
  id: string;
  name: string;
  detail: string;
  grid: Grid;
}

const TOOL_HINTS: Record<Tool, string> = {
  draw: 'Click or drag to toggle cells. Right-drag pans, wheel zooms.',
  pan: 'Drag to move the view. Wheel or +/− to zoom.',
  place: 'Click to place the selected blueprint. R rotates, M mirrors, Esc cancels.',
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

export function startApp(): void {
  const canvas = $('board') as HTMLCanvasElement;
  const stage = canvas.parentElement!;
  const renderer = new BoardRenderer(canvas, THEME);

  const gun = LIBRARY.find((l) => l.entry.id === 'gosper-glider-gun')!.pattern.grid;
  const sim = new Simulation(defaultScenario(gun));
  const clock = new GenerationClock({ generationsPerSecond: SPEED_LEVELS[4], maxGenerationsPerTick: 64 });

  const blueprints: Blueprint[] = LIBRARY.map((l) => ({
    id: l.entry.id,
    name: l.entry.name,
    detail: `${l.entry.width}×${l.entry.height} · ${l.entry.kind}`,
    grid: l.pattern.grid,
  }));

  let running = false;
  let tool: Tool = 'draw';
  let selected: Blueprint = blueprints.find((b) => b.id === 'glider') ?? blueprints[0]!;
  let transform: Transform = { ...IDENTITY };
  let cam: Camera = { originX: 0, originY: 0, zoom: 4 };
  let viewW = 1, viewH = 1, dpr = 1;
  let hover: { x: number; y: number } | null = null;
  let messageTimer = 0;

  // ---------- UI helpers ----------
  const playBtn = $('play') as HTMLButtonElement;
  const speedInput = $('speed') as HTMLInputElement;
  const messageEl = $('message');

  function say(text: string, kind: 'info' | 'warn' | 'error' = 'info'): void {
    messageEl.textContent = text;
    messageEl.className = `message ${kind === 'info' ? '' : kind}`;
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => (messageEl.textContent = ''), 4000);
  }

  function setRunning(on: boolean): void {
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
    tool = t;
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
      b.setAttribute('aria-checked', String(b.dataset.tool === t));
    }
    canvas.classList.toggle('tool-pan', t === 'pan');
    $('tool-hint').textContent = TOOL_HINTS[t];
    renderPalette();
  }

  function setTransform(t: Transform): void {
    transform = t;
    $('orientation').textContent = transformName(t);
  }

  function renderPalette(): void {
    const palette = $('palette');
    palette.replaceChildren(
      ...blueprints.map((bp) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.testid = `blueprint-${bp.id}`;
        b.setAttribute('aria-pressed', String(tool === 'place' && bp === selected));
        b.append(bp.name);
        const small = document.createElement('small');
        small.textContent = bp.detail;
        b.append(small);
        b.addEventListener('click', () => {
          selected = bp;
          setTool('place');
        });
        return b;
      }),
    );
  }

  function fit(): void {
    cam = fitBoard(sim.world.width, sim.world.height, viewW, viewH);
  }

  function ghostOrigin(cell: { x: number; y: number }, g: Grid): { x: number; y: number } {
    return { x: cell.x - Math.floor(g.width / 2), y: cell.y - Math.floor(g.height / 2) };
  }

  // ---------- commands ----------
  function stepOnce(): void {
    setRunning(false);
    sim.step(1);
  }

  function placeAt(cell: { x: number; y: number }): void {
    const g = transformGrid(selected.grid, transform);
    const o = ghostOrigin(cell, g);
    const r = sim.apply({ type: 'stamp', patternId: selected.id, grid: selected.grid, x: o.x, y: o.y, transform });
    if (!r.ok) say(r.message, 'error');
    else if (r.warnings.length) say(r.warnings.join(' '), 'warn');
    else say(`Placed ${selected.name} at (${o.x}, ${o.y}), generation ${sim.world.generation}`);
  }

  // ---------- pointer input ----------
  type Drag =
    | { kind: 'pan'; lastX: number; lastY: number; id: number }
    | { kind: 'paint'; alive: boolean; id: number; last: string };
  let drag: Drag | null = null;

  const localPoint = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    const p = localPoint(e);
    const cell = screenToCellInt(cam, p.x, p.y);
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || tool === 'pan') {
      drag = { kind: 'pan', lastX: p.x, lastY: p.y, id: e.pointerId };
      canvas.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'place') {
      placeAt(cell);
      return;
    }
    const w = sim.world;
    if (cell.x < 0 || cell.y < 0 || cell.x >= w.width || cell.y >= w.height) return;
    const alive = getCell(w, cell.x, cell.y) === 0;
    sim.apply({ type: 'set-cell', x: cell.x, y: cell.y, alive });
    drag = { kind: 'paint', alive, id: e.pointerId, last: `${cell.x},${cell.y}` };
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = localPoint(e);
    const cell = screenToCellInt(cam, p.x, p.y);
    hover = cell;
    if (!drag || drag.id !== e.pointerId) return;
    if (drag.kind === 'pan') {
      cam = panBy(cam, p.x - drag.lastX, p.y - drag.lastY);
      drag.lastX = p.x;
      drag.lastY = p.y;
    } else {
      const key = `${cell.x},${cell.y}`;
      const w = sim.world;
      if (key !== drag.last && cell.x >= 0 && cell.y >= 0 && cell.x < w.width && cell.y < w.height) {
        drag.last = key;
        if ((getCell(w, cell.x, cell.y) === 1) !== drag.alive) {
          sim.apply({ type: 'set-cell', x: cell.x, y: cell.y, alive: drag.alive });
        }
      }
    }
  });

  const endDrag = (e: PointerEvent) => {
    if (drag && drag.id === e.pointerId) drag = null;
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
    setRunning(false);
    sim.reset();
    say('Chamber reset to its starting layout');
  });
  $('clear').addEventListener('click', () => {
    sim.apply({ type: 'clear' });
    say('Board cleared');
  });
  $('zoom-in').addEventListener('click', () => (cam = zoomAt(cam, viewW / 2, viewH / 2, 1.5)));
  $('zoom-out').addEventListener('click', () => (cam = zoomAt(cam, viewW / 2, viewH / 2, 1 / 1.5)));
  $('fit').addEventListener('click', fit);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    b.addEventListener('click', () => setTool(b.dataset.tool as Tool));
  }
  const rotate = () => setTransform({ ...transform, rotation: (((transform.rotation + 90) % 360) as Rotation) });
  const mirror = () => setTransform({ ...transform, mirror: !transform.mirror });
  $('rotate').addEventListener('click', rotate);
  $('mirror').addEventListener('click', mirror);

  // ---------- RLE dialog ----------
  const dialog = $('rle-dialog') as HTMLDialogElement;
  const rleText = $('rle-text') as HTMLTextAreaElement;
  const rleError = $('rle-error');
  const rleConfirm = $('rle-confirm') as HTMLButtonElement;
  let dialogMode: 'import' | 'export' = 'import';

  function openDialog(mode: 'import' | 'export'): void {
    dialogMode = mode;
    $('rle-title').textContent = mode === 'import' ? 'Import RLE' : 'Board as RLE';
    rleText.readOnly = mode === 'export';
    rleText.value = mode === 'export' ? encodeRle(sim.world, { comments: [`Generation ${sim.world.generation}`] }) : '';
    rleConfirm.textContent = mode === 'import' ? 'Use as blueprint' : 'Copy';
    rleError.textContent = '';
    dialog.showModal();
    rleText.focus();
    if (mode === 'export') rleText.select();
  }

  $('import-open').addEventListener('click', () => openDialog('import'));
  $('export').addEventListener('click', () => openDialog('export'));
  rleConfirm.addEventListener('click', (e) => {
    if (dialogMode === 'export') {
      e.preventDefault();
      void navigator.clipboard?.writeText(rleText.value).then(
        () => (rleError.textContent = 'Copied to clipboard'),
        () => (rleError.textContent = 'Copy failed — select the text and copy manually'),
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
      id: `imported-${blueprints.length}`,
      name: r.pattern.name ?? 'Imported',
      detail: `${r.pattern.grid.width}×${r.pattern.grid.height} · imported`,
      grid: r.pattern.grid,
    };
    blueprints.push(bp);
    selected = bp;
    setTransform({ ...IDENTITY });
    setTool('place');
    say(`Imported ${bp.name}: click the board to place it`);
  });

  // ---------- keyboard ----------
  window.addEventListener('keydown', (e) => {
    if (dialog.open || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === ' ') {
      e.preventDefault();
      setRunning(!running);
    } else if (k === 'n' || k === 'N' || k === '.') stepOnce();
    else if (k === 'r' || k === 'R') rotate();
    else if (k === 'm' || k === 'M') mirror();
    else if (k === 'f' || k === 'F') fit();
    else if (k === 'Escape') setTool('draw');
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

  // ---------- frame loop ----------
  const genEl = $('generation'), popEl = $('population'), rateEl = $('rate'), cursorEl = $('cursor');
  const rateWindow: Array<{ t: number; g: number }> = [];
  let last = performance.now();

  function frame(now: number): void {
    const dt = now - last;
    last = now;
    if (running) sim.step(clock.tick(dt));

    const w = sim.world;
    rateWindow.push({ t: now, g: w.generation });
    while (rateWindow.length > 2 && now - rateWindow[0]!.t > 1000) rateWindow.shift();
    const first = rateWindow[0]!;
    const rate = running && now > first.t ? ((w.generation - first.g) * 1000) / (now - first.t) : 0;

    genEl.textContent = String(w.generation);
    popEl.textContent = String(population(w));
    rateEl.textContent = `${rate.toFixed(rate < 10 ? 1 : 0)} gen/s${clock.lagging ? ' (capped)' : ''}`;
    cursorEl.textContent = hover && hover.x >= 0 && hover.y >= 0 && hover.x < w.width && hover.y < w.height ? `${hover.x}, ${hover.y}` : '–';

    const overlay: Overlay = {};
    if (hover && tool === 'place') {
      const g = transformGrid(selected.grid, transform);
      const o = ghostOrigin(hover, g);
      overlay.ghost = { grid: g, x: o.x, y: o.y, valid: stampGrid(w, selected.grid, o.x, o.y, { transform }).ok };
    } else if (hover && tool === 'draw') {
      overlay.hoverCell = hover;
    }
    renderer.draw(w, cam, dpr, overlay);
    requestAnimationFrame(frame);
  }

  setSpeed(4);
  setTool('draw');
  setTransform({ ...IDENTITY });
  $('board-size').textContent = `${sim.world.width} × ${sim.world.height}`;
  requestAnimationFrame(frame);

  // Read-only debug handle for /playtest and e2e tests (dev builds only).
  if (import.meta.env.DEV) {
    (window as unknown as { __ia: unknown }).__ia = {
      generation: () => sim.world.generation,
      population: () => population(sim.world),
      boardHash: () => hashWorld(sim.world),
      running: () => running,
      camera: () => ({ ...cam }),
      cellToClient: (x: number, y: number) => {
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (x + 0.5 - cam.originX) * cam.zoom, y: r.top + (y + 0.5 - cam.originY) * cam.zoom };
      },
      cell: (x: number, y: number) => getCell(sim.world, x, y),
      log: () => sim.log.map((l) => ({ generation: l.generation, type: l.command.type })),
      /** Times rendering and stepping on copies; never changes the live board. */
      benchmark: (frames = 200) => {
        let t = performance.now();
        for (let i = 0; i < frames; i++) renderer.draw(sim.world, cam, dpr);
        const renderMs = (performance.now() - t) / frames;
        let w = sim.world;
        t = performance.now();
        for (let i = 0; i < frames; i++) w = stepLife(w);
        const stepMs = (performance.now() - t) / frames;
        return { renderMs, stepMs, canvas: { width: canvas.width, height: canvas.height }, dpr };
      },
    };
  }
}
