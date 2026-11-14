import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BattleshipAI, type ShotReport } from '../src/game/ai';
import { Board, coordKey } from '../src/game/board';
import { FLEET } from '../src/game/fleet';
import { Game, toReport } from '../src/game/game';
import { randomizeFleet } from '../src/game/placement';
import { mulberry32 } from '../src/game/random';
import type { Coord, ShipSpec } from '../src/game/types';

const LENGTHS = FLEET.map((s) => s.length);
const adjacent = (a: Coord, b: Coord) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

/** Plays the AI against a board until every ship is sunk, returning every shot in order. */
function playOut(board: Board, ai: BattleshipAI): { coord: Coord; report: ShotReport; mode: string }[] {
  const log: { coord: Coord; report: ShotReport; mode: string }[] = [];
  while (!board.allSunk()) {
    const mode = ai.mode;
    const coord = ai.nextShot();
    const report = toReport(board.fire(coord));
    ai.recordResult(coord, report);
    log.push({ coord, report, mode });
    if (log.length > 100) throw new Error('AI took more than 100 shots');
  }
  return log;
}

function boardWith(ships: [ShipSpec, Coord, 'horizontal' | 'vertical'][]): Board {
  const board = new Board();
  for (const [spec, origin, orientation] of ships) board.place(spec, origin, orientation);
  return board;
}

describe('AI: never repeats a shot', () => {
  it('fires at unique cells across 500 full games and always finishes', () => {
    let totalShots = 0;
    for (let seed = 0; seed < 500; seed++) {
      const board = new Board();
      randomizeFleet(board, FLEET, mulberry32(seed));
      const log = playOut(board, new BattleshipAI(LENGTHS, mulberry32(seed + 10_000)));
      const keys = log.map((s) => coordKey(s.coord));
      expect(new Set(keys).size).toBe(keys.length);
      totalShots += log.length;
    }
    // Pure random play needs ~96 shots on average; a hunt/target AI should do far better.
    expect(totalShots / 500).toBeLessThan(65);
  });

  it('keeps finding fresh cells until the whole board is used up', () => {
    const ai = new BattleshipAI(LENGTHS, mulberry32(7));
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const c = ai.nextShot();
      expect(seen.has(coordKey(c))).toBe(false);
      seen.add(coordKey(c));
      ai.recordResult(c, { result: 'miss' });
    }
    expect(() => ai.nextShot()).toThrow();
  });

  it('rejects a result for a cell it has already fired at', () => {
    const ai = new BattleshipAI(LENGTHS, mulberry32(1));
    ai.recordResult({ row: 0, col: 0 }, { result: 'miss' });
    expect(() => ai.recordResult({ row: 0, col: 0 }, { result: 'miss' })).toThrow();
  });
});

describe('AI: hunt mode', () => {
  it('starts in hunt mode on a checkerboard pattern', () => {
    const ai = new BattleshipAI(LENGTHS, mulberry32(3));
    expect(ai.mode).toBe('hunt');
    expect(ai.huntSpacing).toBe(2);
    const parities = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const c = ai.nextShot();
      parities.add((c.row + c.col) % 2);
      ai.recordResult(c, { result: 'miss' });
    }
    expect(parities.size).toBe(1);
  });

  it('widens hunt spacing to the smallest ship still afloat', () => {
    const ai = new BattleshipAI(LENGTHS, mulberry32(11));
    ai.recordResult({ row: 0, col: 0 }, { result: 'hit' });
    ai.recordResult({ row: 0, col: 1 }, { result: 'sunk', sunkLength: 2 });
    expect(ai.mode).toBe('hunt');
    expect(ai.huntSpacing).toBe(3);
    const residues = new Set<number>();
    for (let i = 0; i < 25; i++) {
      const c = ai.nextShot();
      residues.add((c.row + c.col) % 3);
      ai.recordResult(c, { result: 'miss' });
    }
    expect(residues.size).toBe(1);
  });

  it('keeps spacing at 3 while a second ship of length 3 remains', () => {
    const ai = new BattleshipAI(LENGTHS, mulberry32(12));
    ai.recordResult({ row: 0, col: 0 }, { result: 'hit' });
    ai.recordResult({ row: 0, col: 1 }, { result: 'sunk', sunkLength: 2 });
    for (const col of [3, 4]) ai.recordResult({ row: 5, col }, { result: 'hit' });
    ai.recordResult({ row: 5, col: 5 }, { result: 'sunk', sunkLength: 3 });
    expect(ai.remainingShipLengths).toEqual([5, 4, 3]);
    expect(ai.huntSpacing).toBe(3);
  });

  it('skips cells where the smallest remaining ship cannot fit', () => {
    const ai = new BattleshipAI([3], mulberry32(5));
    // Box in the top-left corner so (0,0), (0,1) and (1,0) can never hold a ship of length 3.
    for (const c of [{ row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }]) {
      ai.recordResult(c, { result: 'miss' });
    }
    // ~33 spacing-3 cells exist; while any of them could still hold the ship, the corner is never chosen.
    for (let i = 0; i < 25; i++) {
      const c = ai.nextShot();
      expect(c.row + c.col).toBeGreaterThan(1);
      ai.recordResult(c, { result: 'miss' });
    }
  });
});

describe('AI: target mode', () => {
  it('fires next to a fresh hit', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ai = new BattleshipAI(LENGTHS, mulberry32(seed));
      ai.recordResult({ row: 5, col: 5 }, { result: 'hit' });
      expect(ai.mode).toBe('target');
      expect(adjacent(ai.nextShot(), { row: 5, col: 5 })).toBe(true);
    }
  });

  it('follows the direction of the ship once it has two hits in a line', () => {
    const ai = new BattleshipAI(LENGTHS, mulberry32(1));
    ai.recordResult({ row: 5, col: 5 }, { result: 'hit' });
    ai.recordResult({ row: 5, col: 6 }, { result: 'hit' });
    const next = ai.nextShot();
    expect(next.row).toBe(5);
    expect([4, 7]).toContain(next.col);
  });

  it('keeps going in the same direction, then reverses when it reaches a miss', () => {
    const ai = new BattleshipAI(LENGTHS, mulberry32(2));
    ai.recordResult({ row: 3, col: 4 }, { result: 'hit' });
    ai.recordResult({ row: 4, col: 4 }, { result: 'hit' });
    expect(ai.nextShot()).toEqual({ row: 5, col: 4 });
    ai.recordResult({ row: 5, col: 4 }, { result: 'hit' });
    expect(ai.nextShot()).toEqual({ row: 6, col: 4 });
    ai.recordResult({ row: 6, col: 4 }, { result: 'miss' });
    expect(ai.nextShot()).toEqual({ row: 2, col: 4 });
    ai.recordResult({ row: 2, col: 4 }, { result: 'sunk', sunkLength: 4 });
    expect(ai.mode).toBe('hunt');
    expect(ai.remainingShipLengths).toEqual([5, 3, 3, 2]);
  });

  it('reverses direction at the edge of the board', () => {
    const ai = new BattleshipAI(LENGTHS, mulberry32(3));
    ai.recordResult({ row: 0, col: 8 }, { result: 'hit' });
    ai.recordResult({ row: 0, col: 9 }, { result: 'hit' });
    expect(ai.nextShot()).toEqual({ row: 0, col: 7 });
  });

  it('stays on the ship line from the second hit until the ship sinks', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed);
      const board = new Board();
      randomizeFleet(board, [FLEET[0]], rng);
      const ship = board.placedShips[0];
      const log = playOut(board, new BattleshipAI([5], mulberry32(seed + 1)));
      const hitIdx = log.map((s, i) => (s.report.result !== 'miss' ? i : -1)).filter((i) => i >= 0);
      const afterSecondHit = log.slice(hitIdx[1]);
      const onLine = afterSecondHit.every((s) =>
        ship.orientation === 'horizontal' ? s.coord.row === ship.cells[0].row : s.coord.col === ship.cells[0].col,
      );
      expect(onLine).toBe(true);
      // Two hits fix the direction: at most one wasted shot (hitting the far end) after that.
      expect(afterSecondHit.filter((s) => s.report.result === 'miss').length).toBeLessThanOrEqual(1);
    }
  });

  it('finishes off a neighbouring ship that it hit while sinking another', () => {
    for (let seed = 0; seed < 50; seed++) {
      const board = boardWith([
        [FLEET[4], { row: 4, col: 4 }, 'horizontal'],
        [FLEET[2], { row: 5, col: 3 }, 'horizontal'],
      ]);
      const ai = new BattleshipAI([2, 3], mulberry32(seed));
      // First hit on the destroyer, second on the cruiser below it: looks like one vertical ship.
      for (const c of [{ row: 4, col: 4 }, { row: 5, col: 4 }]) ai.recordResult(c, toReport(board.fire(c)));
      const log = playOut(board, ai);
      expect(board.allSunk()).toBe(true);
      expect(log.every((s) => s.mode === 'target')).toBe(true);
      expect(log.length).toBeLessThanOrEqual(8);
    }
  });

  it('handles ships packed side by side', () => {
    const board = boardWith([
      [FLEET[0], { row: 0, col: 0 }, 'vertical'],
      [FLEET[1], { row: 0, col: 1 }, 'vertical'],
      [FLEET[2], { row: 0, col: 2 }, 'vertical'],
      [FLEET[3], { row: 0, col: 3 }, 'vertical'],
      [FLEET[4], { row: 0, col: 4 }, 'vertical'],
    ]);
    for (let seed = 0; seed < 50; seed++) {
      const copy = boardWith(board.placedShips.map((s) => [s.spec, s.cells[0], s.orientation]));
      const log = playOut(copy, new BattleshipAI(LENGTHS, mulberry32(seed)));
      expect(new Set(log.map((s) => coordKey(s.coord))).size).toBe(log.length);
    }
  });
});

describe('AI: never sees the player\'s ships', () => {
  it('does not import the board module or anything that can expose ship positions', () => {
    const source = readFileSync(new URL('../src/game/ai.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['./random', './types']);
  });

  it('holds no reference to a Board after a full game', () => {
    const game = new Game(mulberry32(21));
    game.randomizePlayerFleet();
    game.start();
    for (let i = 0; i < 100 && game.phase !== 'lost'; i++) {
      game.phase = 'ai-turn';
      game.aiFire();
    }
    const visited = new Set<unknown>();
    const walk = (value: unknown): void => {
      if (value === null || typeof value !== 'object' || visited.has(value)) return;
      visited.add(value);
      expect(value).not.toBeInstanceOf(Board);
      Object.values(value).forEach(walk);
    };
    walk(game.ai);
  });

  it('receives only hit / miss / sunk-length reports from the game', () => {
    const game = new Game(mulberry32(22));
    game.randomizePlayerFleet();
    game.start();
    const spy = vi.spyOn(game.ai, 'recordResult');
    for (let i = 0; i < 100 && game.phase !== 'lost'; i++) {
      game.phase = 'ai-turn';
      game.aiFire();
    }
    expect(spy).toHaveBeenCalled();
    for (const [, report] of spy.mock.calls) {
      expect(Object.keys(report).sort()).toEqual(report.result === 'sunk' ? ['result', 'sunkLength'] : ['result']);
      expect(['hit', 'miss', 'sunk']).toContain(report.result);
    }
  });

  it('makes identical decisions when replayed from the reports alone, with no board at all', () => {
    for (let seed = 0; seed < 20; seed++) {
      const board = new Board();
      randomizeFleet(board, FLEET, mulberry32(seed));
      const live = playOut(board, new BattleshipAI(LENGTHS, mulberry32(seed + 500)));

      const replay = new BattleshipAI(LENGTHS, mulberry32(seed + 500));
      for (const { coord, report } of live) {
        expect(replay.nextShot()).toEqual(coord);
        replay.recordResult(coord, report);
      }
    }
  });
});
