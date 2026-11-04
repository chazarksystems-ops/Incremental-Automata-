import { suggestedShiftX, type DetectorState } from '../detectors/detector';

export type DiagnosticLevel = 'ok' | 'warn' | 'idle';

export interface Diagnostic {
  level: DiagnosticLevel;
  text: string;
}

const ARROWS = { SE: '↘', SW: '↙', NW: '↖', NE: '↗' } as const;

/**
 * Explain, from detector state alone, why the collector is or isn't
 * producing. Pure, so it is unit-tested. `recentWindow` is how far back
 * (generations) a near miss still counts as current.
 */
export function diagnoseCollector(d: DetectorState, generation: number, recentCollected: number, recentWindow: number): Diagnostic {
  const arrow = ARROWS[d.config.heading];
  const missIsRecent = d.lastMissGeneration !== null && generation - d.lastMissGeneration <= recentWindow;
  const paidRecently = d.lastSignalGeneration !== null && generation - d.lastSignalGeneration <= recentWindow;

  if (missIsRecent && (!paidRecently || d.lastMissGeneration! > d.lastSignalGeneration!)) {
    const off = d.lastMissOffset!;
    const dx = suggestedShiftX(d.config.heading, off);
    const lanes = Math.abs(off);
    return {
      level: 'warn',
      text:
        `Gliders are passing ${lanes} lane${lanes === 1 ? '' : 's'} off the gate. ` +
        `Move the collector ${Math.abs(dx)} cell${Math.abs(dx) === 1 ? '' : 's'} ${dx > 0 ? 'right' : 'left'}.`,
    };
  }
  if (recentCollected > 0) {
    return { level: 'ok', text: `Collecting: ${recentCollected} glider${recentCollected === 1 ? '' : 's'} in the last ${recentWindow} generations.` };
  }
  if (d.tracks.length > 0) {
    return { level: 'idle', text: `Tracking ${d.tracks.length} glider${d.tracks.length === 1 ? '' : 's'} near the gate…` };
  }
  return { level: 'idle', text: `No gliders near the collector. It only counts gliders moving ${arrow} through its gate.` };
}
