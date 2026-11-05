import { describe, expect, it } from 'vitest';
import { PLAYTEST_KEY, PLAYTEST_TASKS, buildReport, loadPlaytest, markPlaytest } from '../../src/ui/playtest';

const now = () => '2026-11-05T10:00:00.000Z';

describe('playtest checklist', () => {
  it('starts empty, records each event once, and survives a storage round-trip', () => {
    const store = new Map<string, string>();
    const s = loadPlaytest((k) => store.get(k) ?? null, now);
    expect(Object.keys(s.done)).toEqual([]);
    expect(markPlaytest(s, 'used-undo', 't1')).toBe(true);
    expect(markPlaytest(s, 'used-undo', 't2')).toBe(false);
    s.notes = 'the dashed line confused me';
    store.set(PLAYTEST_KEY, JSON.stringify(s));
    const again = loadPlaytest((k) => store.get(k) ?? null, now);
    expect(again.done).toEqual({ 'used-undo': 't1' });
    expect(again.notes).toBe('the dashed line confused me');
  });

  it('ignores corrupt storage', () => {
    expect(loadPlaytest(() => '{nope', now).done).toEqual({});
    expect(loadPlaytest(() => JSON.stringify({ version: 9 }), now).done).toEqual({});
  });

  it('ticks tasks from events and goals, and the report lists everything', () => {
    const s = loadPlaytest(() => null, now);
    markPlaytest(s, 'refused-too-close', 't');
    s.counts = { 'refused-too-close': 2 };
    s.notes = 'fun!';
    const goals = new Set(['first-glider', 'bank-10', 'second-gun', 'two-streams']);
    const ticked = PLAYTEST_TASKS.filter((t) => t.done(s, goals)).map((t) => t.id);
    expect(ticked).toEqual(['tutorial', 'too-close']);
    const report = buildReport(s, {
      now: now(), generation: 1234, energy: 7, guns: 2, collectors: 2, chamber: 128, rate: 20, lost: 0,
      goals: [{ id: 'first-glider', title: 'Line up the collector', generation: 410 }],
      completedTasks: goals,
    });
    expect(report).toContain('[x] Follow the Goal card');
    expect(report).toContain('[ ] Undo something');
    expect(report).toContain('Line up the collector (410)');
    expect(report).toContain('generation 1234, 7 energy, 2 gun(s), 2 collector(s)');
    expect(report).toContain('refused-too-close×2');
    expect(report).toContain('fun!');
  });
});
