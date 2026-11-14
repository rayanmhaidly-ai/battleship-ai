import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/game/fleet';
import { Game } from '../src/game/game';
import { Board } from '../src/game/board';
import { randomizeFleet } from '../src/game/placement';
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

describe('randomness cannot be rigged from the console', () => {
  it('ignores Math.random being replaced after the game code has loaded', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const rigged = new Board();
      randomizeFleet(rigged, FLEET, Math.random);
      const riggedCells = JSON.stringify(rigged.placedShips.map((s) => s.cells));
      const fleets = Array.from({ length: 5 }, () =>
        JSON.stringify(new Game().enemyBoard.placedShips.map((s) => s.cells)),
      );
      expect(fleets).not.toContain(riggedCells);
      expect(new Set(fleets).size).toBeGreaterThan(1);
    } finally {
      Math.random = original;
    }
  });
});

describe('Game.stats', () => {
  it('counts shots, hits and accuracy for each side after every shot', () => {
    const game = new Game(mulberry32(8));
    game.randomizePlayerFleet();
    game.start();
    expect(game.stats('player')).toEqual({ shots: 0, hits: 0, accuracy: 0 });
    expect(game.stats('ai')).toEqual({ shots: 0, hits: 0, accuracy: 0 });

    const enemyShips = game.enemyBoard.placedShips.flatMap((s) => s.cells);
    const tally = { player: { shots: 0, hits: 0 }, ai: { shots: 0, hits: 0 } };
    const expectStats = (by: 'player' | 'ai') => {
      const { shots, hits } = tally[by];
      expect(game.stats(by)).toEqual({ shots, hits, accuracy: Math.round((hits / shots) * 100) });
    };
    // Alternate a sure hit with a sure miss so accuracy moves both ways.
    const water = allCells().filter((c) => !game.enemyBoard.shipAt(c));
    const phase = () => game.phase;
    for (let i = 0; phase() === 'player-turn'; i++) {
      const target = (i % 2 === 0 ? enemyShips : water).find((c) => !game.enemyBoard.hasBeenShot(c))!;
      const event = game.playerFire(target)!;
      tally.player.shots++;
      if (event.outcome.result !== 'miss') tally.player.hits++;
      expectStats('player');
      if (phase() !== 'ai-turn') break;
      const ai = game.aiFire();
      tally.ai.shots++;
      if (ai.outcome.result !== 'miss') tally.ai.hits++;
      expectStats('ai');
      expectStats('player');
    }
    expect(tally.player.hits).toBeGreaterThan(0);
    expect(tally.player.hits).toBeLessThan(tally.player.shots);
  });

  it('rounds accuracy to a whole percentage', () => {
    const game = new Game(mulberry32(9));
    game.randomizePlayerFleet();
    game.start();
    const ship = game.enemyBoard.placedShips[0].cells[0];
    const water = allCells().filter((c) => !game.enemyBoard.shipAt(c));
    for (const c of [ship, water[0], water[1]]) {
      game.playerFire(c);
      game.aiFire();
    }
    expect(game.stats('player')).toEqual({ shots: 3, hits: 1, accuracy: 33 });
  });
});
