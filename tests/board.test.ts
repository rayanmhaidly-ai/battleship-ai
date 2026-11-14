import { describe, expect, it } from 'vitest';
import { Board, coordKey } from '../src/game/board';
import { FLEET } from '../src/game/fleet';
import { randomizeFleet } from '../src/game/placement';
import { mulberry32 } from '../src/game/random';

const [carrier, battleship, cruiser, submarine, destroyer] = FLEET;

describe('fleet', () => {
  it('is the classic 5, 4, 3, 3, 2 fleet', () => {
    expect(FLEET.map((s) => s.length)).toEqual([5, 4, 3, 3, 2]);
  });
});

describe('placement validation', () => {
  it('accepts ships that fit on the board', () => {
    const board = new Board();
    expect(board.validatePlacement(carrier, { row: 0, col: 5 }, 'horizontal')).toBeNull();
    expect(board.validatePlacement(carrier, { row: 5, col: 9 }, 'vertical')).toBeNull();
  });

  it('rejects ships that go off the board', () => {
    const board = new Board();
    expect(board.validatePlacement(carrier, { row: 0, col: 6 }, 'horizontal')).toBe('out-of-bounds');
    expect(board.validatePlacement(carrier, { row: 6, col: 0 }, 'vertical')).toBe('out-of-bounds');
    expect(board.validatePlacement(destroyer, { row: -1, col: 0 }, 'vertical')).toBe('out-of-bounds');
    expect(board.validatePlacement(destroyer, { row: 0, col: -1 }, 'horizontal')).toBe('out-of-bounds');
    expect(() => board.place(carrier, { row: 9, col: 9 }, 'horizontal')).toThrow();
  });

  it('rejects overlapping ships', () => {
    const board = new Board();
    board.place(battleship, { row: 2, col: 2 }, 'horizontal');
    expect(board.validatePlacement(cruiser, { row: 0, col: 4 }, 'vertical')).toBe('overlap');
    expect(board.validatePlacement(cruiser, { row: 2, col: 5 }, 'horizontal')).toBe('overlap');
    expect(() => board.place(cruiser, { row: 2, col: 0 }, 'horizontal')).toThrow();
  });

  it('allows ships to touch without overlapping', () => {
    const board = new Board();
    board.place(battleship, { row: 2, col: 2 }, 'horizontal');
    expect(board.validatePlacement(cruiser, { row: 3, col: 2 }, 'horizontal')).toBeNull();
    expect(board.validatePlacement(cruiser, { row: 2, col: 6 }, 'horizontal')).toBeNull();
  });

  it('rejects placing the same ship twice', () => {
    const board = new Board();
    board.place(destroyer, { row: 0, col: 0 }, 'horizontal');
    expect(board.validatePlacement(destroyer, { row: 5, col: 5 }, 'horizontal')).toBe('already-placed');
  });

  it('lets a ship be removed and placed again', () => {
    const board = new Board();
    board.place(destroyer, { row: 0, col: 0 }, 'horizontal');
    expect(board.remove('destroyer')).toBe(true);
    expect(board.shipAt({ row: 0, col: 0 })).toBeUndefined();
    expect(board.validatePlacement(destroyer, { row: 0, col: 0 }, 'vertical')).toBeNull();
  });

  it('random placement always produces a legal, complete fleet', () => {
    for (let seed = 0; seed < 300; seed++) {
      const board = new Board();
      randomizeFleet(board, FLEET, mulberry32(seed));
      expect(board.hasFleet(FLEET)).toBe(true);
      const cells = board.placedShips.flatMap((s) => s.cells);
      expect(cells).toHaveLength(17);
      expect(new Set(cells.map(coordKey)).size).toBe(17);
      for (const c of cells) {
        expect(c.row).toBeGreaterThanOrEqual(0);
        expect(c.row).toBeLessThan(10);
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.col).toBeLessThan(10);
      }
    }
  });

  it('random placement keeps ships the player already placed', () => {
    const board = new Board();
    board.place(carrier, { row: 0, col: 0 }, 'horizontal');
    randomizeFleet(board, FLEET, mulberry32(1));
    expect(board.shipAt({ row: 0, col: 0 })?.spec.id).toBe('carrier');
    expect(board.hasFleet(FLEET)).toBe(true);
  });
});

describe('hit and sunk detection', () => {
  const setup = () => {
    const board = new Board();
    board.place(destroyer, { row: 4, col: 4 }, 'horizontal');
    board.place(submarine, { row: 0, col: 0 }, 'vertical');
    return board;
  };

  it('reports a miss on empty water', () => {
    const board = setup();
    expect(board.fire({ row: 9, col: 9 })).toEqual({ result: 'miss' });
    expect(board.shotAt({ row: 9, col: 9 })).toBe('miss');
  });

  it('reports a hit, then sunk on the final cell of a ship', () => {
    const board = setup();
    expect(board.fire({ row: 4, col: 4 })).toEqual({ result: 'hit' });
    expect(board.shipAt({ row: 4, col: 4 })?.sunk).toBe(false);
    expect(board.fire({ row: 4, col: 5 })).toEqual({ result: 'sunk', ship: destroyer });
    expect(board.shipAt({ row: 4, col: 4 })?.sunk).toBe(true);
    expect(board.shotAt({ row: 4, col: 5 })).toBe('hit');
  });

  it('only sinks the ship whose every cell was hit', () => {
    const board = setup();
    board.fire({ row: 0, col: 0 });
    board.fire({ row: 1, col: 0 });
    expect(board.fire({ row: 4, col: 4 })).toEqual({ result: 'hit' });
    expect(board.fire({ row: 2, col: 0 })).toEqual({ result: 'sunk', ship: submarine });
  });

  it('refuses to fire at the same cell twice or off the board', () => {
    const board = setup();
    board.fire({ row: 4, col: 4 });
    expect(() => board.fire({ row: 4, col: 4 })).toThrow();
    expect(() => board.fire({ row: 10, col: 0 })).toThrow(RangeError);
  });
});

describe('win detection', () => {
  it('is not won until every ship is sunk', () => {
    const board = new Board();
    board.place(destroyer, { row: 0, col: 0 }, 'horizontal');
    board.place(cruiser, { row: 5, col: 5 }, 'vertical');
    expect(board.allSunk()).toBe(false);
    board.fire({ row: 0, col: 0 });
    board.fire({ row: 0, col: 1 });
    expect(board.allSunk()).toBe(false);
    board.fire({ row: 5, col: 5 });
    board.fire({ row: 6, col: 5 });
    expect(board.allSunk()).toBe(false);
    board.fire({ row: 7, col: 5 });
    expect(board.allSunk()).toBe(true);
  });

  it('an empty board is never considered won', () => {
    expect(new Board().allSunk()).toBe(false);
  });
});
