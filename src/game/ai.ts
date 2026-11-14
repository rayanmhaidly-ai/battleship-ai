// The AI only ever learns what a real opponent would: the result of each of its own shots.
// It must not import the Board module or receive ship positions in any form.
import { BOARD_SIZE, type Coord } from './types';
import { defaultRng, randomInt, shuffle, type Rng } from './random';

export type ShotResult = 'miss' | 'hit' | 'sunk';

export interface ShotReport {
  readonly result: ShotResult;
  /** Length of the ship that was sunk; required when result is 'sunk'. */
  readonly sunkLength?: number;
}

export type AiMode = 'hunt' | 'target';

type CellState = 'unknown' | 'miss' | 'hit' | 'sunk';

const AXES: readonly Coord[] = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
];

const step = (c: Coord, axis: Coord, n: number): Coord => ({
  row: c.row + axis.row * n,
  col: c.col + axis.col * n,
});

const mod = (n: number, m: number): number => ((n % m) + m) % m;

export class BattleshipAI {
  private readonly grid: CellState[][];
  private readonly remaining: number[];
  private readonly hitOrder: Coord[] = [];
  private readonly parityOffset: number;
  private shots = 0;

  constructor(
    fleetLengths: readonly number[],
    private readonly rng: Rng = defaultRng,
    readonly size = BOARD_SIZE,
  ) {
    if (fleetLengths.length === 0) throw new Error('Fleet must contain at least one ship');
    this.remaining = [...fleetLengths];
    this.grid = Array.from({ length: size }, () => Array<CellState>(size).fill('unknown'));
    this.parityOffset = randomInt(rng, 60);
  }

  get mode(): AiMode {
    return this.activeHits().length > 0 ? 'target' : 'hunt';
  }

  /** Hunt shots are spaced by the length of the smallest ship still afloat. */
  get huntSpacing(): number {
    return this.remaining.length > 0 ? Math.min(...this.remaining) : 1;
  }

  get remainingShipLengths(): readonly number[] {
    return this.remaining;
  }

  get shotsTaken(): number {
    return this.shots;
  }

  hasFiredAt(c: Coord): boolean {
    return this.state(c) !== 'unknown';
  }

  /** Returns true if the cell is a hunt-pattern cell for the current spacing. */
  isParityCell(c: Coord): boolean {
    return mod(c.row + c.col - this.parityOffset, this.huntSpacing) === 0;
  }

  nextShot(): Coord {
    const shot = (this.mode === 'target' ? this.pickTarget() : null) ?? this.pickHunt();
    if (!shot) throw new Error('No cells left to fire at');
    if (this.hasFiredAt(shot)) throw new Error('AI attempted to repeat a shot');
    return shot;
  }

  recordResult(c: Coord, report: ShotReport): void {
    if (!this.inBounds(c)) throw new RangeError(`Shot out of bounds: ${c.row},${c.col}`);
    if (this.hasFiredAt(c)) throw new Error(`Result already recorded for ${c.row},${c.col}`);
    this.shots++;
    if (report.result === 'miss') {
      this.grid[c.row][c.col] = 'miss';
      return;
    }
    this.grid[c.row][c.col] = 'hit';
    this.hitOrder.push(c);
    if (report.result === 'sunk') {
      if (!report.sunkLength) throw new Error('A sunk report must include the ship length');
      this.resolveSunk(c, report.sunkLength);
    }
  }

  private inBounds(c: Coord): boolean {
    return c.row >= 0 && c.row < this.size && c.col >= 0 && c.col < this.size;
  }

  private state(c: Coord): CellState | undefined {
    return this.inBounds(c) ? this.grid[c.row][c.col] : undefined;
  }

  private activeHits(): Coord[] {
    return this.hitOrder.filter((h) => this.state(h) === 'hit');
  }

  /** Number of consecutive cells matching `passable` going from c (exclusive) along axis * dir. */
  private extent(c: Coord, axis: Coord, dir: 1 | -1, passable: (s: CellState | undefined) => boolean): number {
    let n = 0;
    while (passable(this.state(step(c, axis, dir * (n + 1))))) n++;
    return n;
  }

  private pickTarget(): Coord | null {
    const active = this.activeHits();
    const recentFirst = [...active].reverse();
    for (const anchor of recentFirst) {
      const line = this.lineTargets(anchor);
      if (line) return line;
    }
    for (const anchor of recentFirst) {
      const neighbour = this.neighbourTarget(anchor);
      if (neighbour) return neighbour;
    }
    return null;
  }

  /** If the anchor is part of a line of 2+ hits, continue along that line. */
  private lineTargets(anchor: Coord): Coord | null {
    const isHit = (s: CellState | undefined) => s === 'hit';
    const last = this.hitOrder[this.hitOrder.length - 1];
    const lines = AXES.map((axis) => {
      const back = this.extent(anchor, axis, -1, isHit);
      const fwd = this.extent(anchor, axis, 1, isHit);
      const ends = [step(anchor, axis, -(back + 1)), step(anchor, axis, fwd + 1)]
        .filter((c) => this.state(c) === 'unknown')
        .sort((a, b) => dist(a, last) - dist(b, last));
      return { length: back + fwd + 1, ends };
    })
      .filter((l) => l.length >= 2 && l.ends.length > 0)
      .sort((a, b) => b.length - a.length);
    return lines.length > 0 ? lines[0].ends[0] : null;
  }

  /** Probe an unknown neighbour of a lone hit, preferring directions with more open water. */
  private neighbourTarget(anchor: Coord): Coord | null {
    const open = (s: CellState | undefined) => s === 'unknown' || s === 'hit';
    const minLen = this.huntSpacing;
    const candidates: { cell: Coord; room: number; fits: boolean }[] = [];
    for (const axis of AXES) {
      const back = this.extent(anchor, axis, -1, open);
      const fwd = this.extent(anchor, axis, 1, open);
      const fits = back + fwd + 1 >= minLen;
      for (const [dir, room] of [[-1, back], [1, fwd]] as const) {
        const cell = step(anchor, axis, dir);
        if (this.state(cell) === 'unknown') candidates.push({ cell, room, fits });
      }
    }
    if (candidates.length === 0) return null;
    const fitting = candidates.filter((c) => c.fits);
    const pool = shuffle(fitting.length > 0 ? fitting : candidates, this.rng);
    pool.sort((a, b) => b.room - a.room);
    return pool[0].cell;
  }

  private pickHunt(): Coord | null {
    const k = this.huntSpacing;
    const unknown: Coord[] = [];
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        if (this.grid[row][col] === 'unknown') unknown.push({ row, col });
      }
    }
    const isUnknown = (s: CellState | undefined) => s === 'unknown';
    const fits = unknown.filter((c) =>
      AXES.some((axis) => this.extent(c, axis, -1, isUnknown) + this.extent(c, axis, 1, isUnknown) + 1 >= k),
    );
    const parity = fits.filter((c) => this.isParityCell(c));
    const pool = parity.length > 0 ? parity : fits.length > 0 ? fits : unknown;
    return pool.length > 0 ? pool[randomInt(this.rng, pool.length)] : null;
  }

  /**
   * The board only reports the sunk ship's length, so work out which of our hits it occupied:
   * a straight run of `length` hits through the final shot, preferring runs that end on it.
   */
  private resolveSunk(c: Coord, length: number): void {
    const options: { cells: Coord[]; score: number }[] = [];
    for (const axis of AXES) {
      const isHit = (s: CellState | undefined) => s === 'hit';
      const runLength = this.extent(c, axis, -1, isHit) + this.extent(c, axis, 1, isHit) + 1;
      for (let offset = 0; offset < length; offset++) {
        const cells = Array.from({ length }, (_, i) => step(c, axis, i - offset));
        if (!cells.every((cell) => this.state(cell) === 'hit')) continue;
        const endsOnShot = offset === 0 || offset === length - 1;
        options.push({ cells, score: (endsOnShot ? 2 : 0) + (runLength === length ? 1 : 0) });
        if (length === 1) break;
      }
      if (length === 1) break;
    }
    options.sort((a, b) => b.score - a.score);
    const sunkCells = options.length > 0 ? options[0].cells : [c];
    for (const cell of sunkCells) this.grid[cell.row][cell.col] = 'sunk';
    const index = this.remaining.indexOf(length);
    if (index !== -1) this.remaining.splice(index, 1);
  }
}

function dist(a: Coord, b: Coord | undefined): number {
  return b ? Math.abs(a.row - b.row) + Math.abs(a.col - b.col) : 0;
}
