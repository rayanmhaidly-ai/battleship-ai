import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/game/fleet';
import { Game } from '../src/game/game';
import { mulberry32 } from '../src/game/random';

const allCells = () =>
  Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10 }));

describe('Game', () => {
  it('cannot start until the whole fleet is placed', () => {
    const game = new Game(mulberry32(1));
    expect(game.canStart()).toBe(false);
    expect(() => game.start()).toThrow();
    game.placePlayerShip(FLEET[0], { row: 0, col: 0 }, 'horizontal');
    expect(game.unplacedShips()).toHaveLength(4);
    game.randomizePlayerFleet();
    expect(game.canStart()).toBe(true);
    game.start();
    expect(game.phase).toBe('player-turn');
  });

  it('returns placement errors instead of placing invalid ships', () => {
    const game = new Game(mulberry32(1));
    expect(game.placePlayerShip(FLEET[0], { row: 0, col: 8 }, 'horizontal')).toBe('out-of-bounds');
    expect(game.placePlayerShip(FLEET[0], { row: 0, col: 0 }, 'vertical')).toBeNull();
    expect(game.placePlayerShip(FLEET[1], { row: 2, col: 0 }, 'horizontal')).toBe('overlap');
  });

  it('alternates turns between player and AI', () => {
    const game = new Game(mulberry32(2));
    game.randomizePlayerFleet();
    game.start();
    expect(game.playerFire({ row: 0, col: 0 })).not.toBeNull();
    expect(game.phase).toBe('ai-turn');
    expect(game.playerFire({ row: 0, col: 1 })).toBeNull();
    game.aiFire();
    expect(game.phase).toBe('player-turn');
    expect(() => game.aiFire()).toThrow();
  });

  it('ignores player shots at cells already fired at', () => {
    const game = new Game(mulberry32(3));
    game.randomizePlayerFleet();
    game.start();
    game.playerFire({ row: 3, col: 3 });
    game.aiFire();
    expect(game.playerFire({ row: 3, col: 3 })).toBeNull();
    expect(game.phase).toBe('player-turn');
  });

  it('ends in a win when the player sinks the enemy fleet', () => {
    const game = new Game(mulberry32(4));
    game.randomizePlayerFleet();
    game.start();
    const targets = game.enemyBoard.placedShips.flatMap((s) => s.cells);
    for (const c of targets) {
      game.playerFire(c);
      if (game.phase === 'won') break;
      game.aiFire();
      expect(game.phase).toBe('player-turn');
    }
    expect(game.phase).toBe('won');
    expect(game.lastPlayerShot?.outcome.result).toBe('sunk');
  });

  it('ends in a loss when the AI sinks the player fleet', () => {
    const game = new Game(mulberry32(5));
    game.randomizePlayerFleet();
    game.start();
    const enemyShips = new Set(game.enemyBoard.placedShips.flatMap((s) => s.cells).map((c) => `${c.row},${c.col}`));
    const water = allCells().filter((c) => !enemyShips.has(`${c.row},${c.col}`));
    for (const c of water) {
      game.playerFire(c);
      game.aiFire();
      if (game.phase === 'lost') break;
    }
    expect(game.phase).toBe('lost');
    expect(game.playerBoard.allSunk()).toBe(true);
  });
});
