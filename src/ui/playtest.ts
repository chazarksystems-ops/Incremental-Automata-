/**
 * Playtest guidance: what we ask a tester to try, ticked automatically from
 * game events, plus their notes and a plain-text report they can copy.
 * Stored only in this browser; nothing is sent anywhere.
 */
export interface PlaytestState {
  version: 1;
  startedAt: string;
  done: Record<string, string>; // task/event id → first time (ISO)
  counts: Record<string, number>;
  notes: string;
}

export interface PlaytestTask {
  id: string;
  text: string;
  done(state: PlaytestState, goals: ReadonlySet<string>): boolean;
}

const ev = (id: string) => (s: PlaytestState) => id in s.done;

export const PLAYTEST_TASKS: readonly PlaytestTask[] = [
  { id: 'tutorial', text: 'Follow the Goal card until “Collect two streams” is done.', done: (_s, g) => g.has('two-streams') },
  { id: 'too-close', text: 'Try building a gun right next to another one. The game should refuse and explain why.', done: ev('refused-too-close') },
  { id: 'stream-warning', text: 'Hover a new gun where its dashed line would hit another gun. Watch for the red warning.', done: ev('saw-stream-warning') },
  { id: 'add-collector', text: 'Use “Add collector” next to a new gun under Machines.', done: ev('add-collector') },
  { id: 'experiment', text: 'Run an experiment: Start experiment → change something → Test → Keep or Discard.', done: ev('ran-experiment') },
  { id: 'undo', text: 'Undo something (Ctrl+Z or the Undo button).', done: ev('used-undo') },
  { id: 'checkpoint', text: 'Save a checkpoint, play on, then restore it.', done: ev('restored-checkpoint') },
  { id: 'reload', text: 'Reload the page. Your game should continue where you left it.', done: ev('reloaded') },
  { id: 'sandbox', text: 'Open Sandbox and try placing patterns freely.', done: ev('tried-sandbox') },
  { id: 'all-goals', text: 'Stretch: finish all 7 goals.', done: (_s, g) => g.has('three-streams') },
];

export const PLAYTEST_KEY = 'incremental-automata.playtest.v1';

export function loadPlaytest(get: (k: string) => string | null, now: () => string): PlaytestState {
  const fresh: PlaytestState = { version: 1, startedAt: now(), done: {}, counts: {}, notes: '' };
  const text = get(PLAYTEST_KEY);
  if (!text) return fresh;
  try {
    const d = JSON.parse(text) as Partial<PlaytestState>;
    if (d.version !== 1 || typeof d.done !== 'object' || d.done === null) return fresh;
    return {
      version: 1,
      startedAt: typeof d.startedAt === 'string' ? d.startedAt : fresh.startedAt,
      done: { ...d.done },
      counts: typeof d.counts === 'object' && d.counts ? { ...d.counts } : {},
      notes: typeof d.notes === 'string' ? d.notes : '',
    };
  } catch {
    return fresh;
  }
}

export function savePlaytest(s: PlaytestState, set: (k: string, v: string) => boolean): void {
  set(PLAYTEST_KEY, JSON.stringify(s));
}

/** Record an event the first time it happens; returns true if it was new. */
export function markPlaytest(s: PlaytestState, id: string, at: string): boolean {
  if (id in s.done) return false;
  s.done[id] = at;
  return true;
}

export interface ReportContext {
  now: string;
  generation: number;
  energy: number;
  guns: number;
  collectors: number;
  chamber: number;
  rate: number;
  lost: number;
  goals: Array<{ id: string; title: string; generation: number }>;
  completedTasks: ReadonlySet<string>;
}

export function buildReport(s: PlaytestState, c: ReportContext): string {
  const lines: string[] = [];
  lines.push('Incremental Automata: playtest report', `Created: ${c.now}`, `Started: ${s.startedAt}`, '');
  lines.push('Checklist:');
  for (const t of PLAYTEST_TASKS) lines.push(`  [${t.done(s, c.completedTasks) ? 'x' : ' '}] ${t.text}`);
  lines.push('', 'Goals reached (generation):');
  if (!c.goals.length) lines.push('  none yet');
  for (const g of c.goals) lines.push(`  ${g.title} (${g.generation})`);
  lines.push(
    '',
    `Game state: generation ${c.generation}, ${c.energy} energy, ${c.guns} gun(s), ${c.collectors} collector(s), chamber ${c.chamber}×${c.chamber}`,
    `Production: ${c.rate} collected / ${c.lost} lost in the last 300 generations`,
  );
  const counts = Object.entries(s.counts).sort(([a], [b]) => a.localeCompare(b));
  if (counts.length) lines.push(`Events: ${counts.map(([k, v]) => `${k}×${v}`).join(', ')}`);
  lines.push('', 'Notes:', s.notes.trim() || '  (none)');
  return lines.join('\n');
}
