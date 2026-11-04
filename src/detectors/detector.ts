import type { WorldState } from '../core/world';
import type { DetectorParams } from '../game/config';
import { findIsolatedGliders, passageId } from './scan';
import { GLIDER_TEMPLATES, HEADING_VECTORS, type Heading } from './templates';

/**
 * Directional glider detector — a read-only game-layer sensor.
 *
 * Every generation it scans a small zone around its gate for *isolated*
 * gliders (a template match whose surrounding 1-cell ring is empty), links each
 * one to the previous generation's observation only if it is at the next phase
 * and the expected position, and emits a signal when a tracked glider's anchor
 * crosses the gate line in the gate's heading. Nothing here writes to the grid.
 *
 * Coordinates: for heading vector (hx, hy) and anchor (ax, ay)
 *   progress = hx*ax + hy*ay   (increases by 2 per glider period)
 *   lateral  = hx*ax - hy*ay   (constant along a glider's lane)
 * The gate at (x, y) sits at progress P and lateral L computed the same way.
 */

export interface DetectorConfig {
  id: string;
  x: number;
  y: number;
  heading: Heading;
}

export interface Track {
  phase: number;
  ax: number;
  ay: number;
  /** Consecutive consistent observations. */
  age: number;
  /** Set when the anchor crossed the gate line: lateral offset from the gate at that moment. */
  crossedOffset: number | null;
  crossedAt: number | null;
  resolved: boolean;
}

export interface DetectorState {
  config: DetectorConfig;
  tracks: Track[];
  collected: number;
  nearMisses: number;
  lastMissOffset: number | null;
  lastMissGeneration: number | null;
  lastSignalGeneration: number | null;
}

export interface DetectedSignal {
  /** Generation at which the signal was accepted (≥ crossingGeneration). */
  generation: number;
  crossingGeneration: number;
  detectorId: string;
  heading: Heading;
  /**
   * Identity of the glider's trajectory, independent of where the gate is:
   * heading, absolute lateral lane and timing. One glider ⇒ one passage id.
   */
  passageId: string;
  lateralOffset: number;
}

export interface NearMiss {
  generation: number;
  detectorId: string;
  lateralOffset: number;
}

export function createDetector(config: DetectorConfig): DetectorState {
  return {
    config: { ...config },
    tracks: [],
    collected: 0,
    nearMisses: 0,
    lastMissOffset: null,
    lastMissGeneration: null,
    lastSignalGeneration: null,
  };
}

export function gateCoordinates(c: DetectorConfig): { progress: number; lateral: number } {
  const [hx, hy] = HEADING_VECTORS[c.heading];
  return { progress: hx * c.x + hy * c.y, lateral: hx * c.x - hy * c.y };
}

interface Observation {
  phase: number;
  ax: number;
  ay: number;
}

/** Find isolated gliders of the detector's heading in its observation zone. */
export function observe(world: WorldState, c: DetectorConfig, p: DetectorParams): Observation[] {
  const [hx, hy] = HEADING_VECTORS[c.heading];
  const gate = gateCoordinates(c);
  const half = Math.ceil((p.observeDepth + p.observeHalfWidth) / 2) + 3;
  const out: Observation[] = [];
  for (const g of findIsolatedGliders(world, c.x - half, c.y - half, c.x + half, c.y + half, c.heading)) {
    const prog = hx * g.ax + hy * g.ay - gate.progress;
    const lat = hx * g.ax - hy * g.ay - gate.lateral;
    if (Math.abs(lat) > p.observeHalfWidth || Math.abs(prog) > p.observeDepth) continue;
    out.push({ phase: g.phase, ax: g.ax, ay: g.ay });
  }
  return out;
}

export interface DetectorUpdate {
  state: DetectorState;
  signals: DetectedSignal[];
  misses: NearMiss[];
}

/**
 * Advance the detector by one observed generation. Pure: returns a new state.
 * Must be called for every generation (the factory does this even when
 * fast-forwarding) — tracks only link across consecutive generations.
 */
export function updateDetector(state: DetectorState, world: WorldState, p: DetectorParams): DetectorUpdate {
  const c = state.config;
  const [hx, hy] = HEADING_VECTORS[c.heading];
  const gate = gateCoordinates(c);
  const progress = (ax: number, ay: number) => hx * ax + hy * ay - gate.progress;
  const lateral = (ax: number, ay: number) => hx * ax - hy * ay - gate.lateral;

  const signals: DetectedSignal[] = [];
  const misses: NearMiss[] = [];
  const tracks: Track[] = [];
  const used = new Set<Track>();
  let { collected, nearMisses, lastMissOffset, lastMissGeneration, lastSignalGeneration } = state;

  for (const o of observe(world, c, p)) {
    const prev = state.tracks.find((t) => {
      if (used.has(t) || (t.phase + 1) % 4 !== o.phase) return false;
      const ex = o.phase === 0 ? t.ax + hx : t.ax;
      const ey = o.phase === 0 ? t.ay + hy : t.ay;
      return ex === o.ax && ey === o.ay;
    });
    let track: Track;
    if (prev) {
      used.add(prev);
      track = { ...prev, phase: o.phase, ax: o.ax, ay: o.ay, age: prev.age + 1 };
      if (track.crossedAt === null && progress(prev.ax, prev.ay) < 0 && progress(o.ax, o.ay) >= 0) {
        track.crossedAt = world.generation;
        track.crossedOffset = lateral(o.ax, o.ay);
      }
    } else {
      track = { phase: o.phase, ax: o.ax, ay: o.ay, age: 1, crossedAt: null, crossedOffset: null, resolved: false };
    }

    if (track.crossedAt !== null && !track.resolved && track.age >= p.confirmGenerations) {
      track.resolved = true;
      const offset = track.crossedOffset!;
      if (Math.abs(offset) <= p.gateHalfWidth) {
        signals.push({
          generation: world.generation,
          crossingGeneration: track.crossedAt,
          detectorId: c.id,
          heading: c.heading,
          passageId: passageId(c.heading, track.ax, track.ay, track.phase, world.generation),
          lateralOffset: offset,
        });
        collected++;
        lastSignalGeneration = world.generation;
      } else {
        misses.push({ generation: world.generation, detectorId: c.id, lateralOffset: offset });
        nearMisses++;
        lastMissOffset = offset;
        lastMissGeneration = world.generation;
      }
    }
    tracks.push(track);
  }

  return {
    state: { config: c, tracks, collected, nearMisses, lastMissOffset, lastMissGeneration, lastSignalGeneration },
    signals,
    misses,
  };
}

/** Move/rotate a detector. In-flight tracks are dropped (passage ids still prevent double pay). */
export function reconfigureDetector(state: DetectorState, config: Partial<Omit<DetectorConfig, 'id'>>): DetectorState {
  return { ...state, config: { ...state.config, ...config }, tracks: [] };
}

/** How many cells to move the gate along x to put it on the lane of a near miss. */
export function suggestedShiftX(heading: Heading, lateralOffset: number): number {
  // Gate lateral L = hx*x − hy*y, so moving x by +1 changes L by hx.
  return lateralOffset * HEADING_VECTORS[heading][0];
}

/** Top-left cell of a tracked glider's current 3×3 shape (for overlays). */
export function trackTopLeft(heading: Heading, track: Track): { x: number; y: number } {
  const t = GLIDER_TEMPLATES.find((g) => g.heading === heading && g.phase === track.phase)!;
  return { x: track.ax - t.anchorDx, y: track.ay - t.anchorDy };
}
