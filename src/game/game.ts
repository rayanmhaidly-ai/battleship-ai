import { BattleshipAI, type ShotReport } from './ai';
import { Board, type PlacementError } from './board';
import { FLEET } from './fleet';
import { randomizeFleet } from './placement';
import type { Rng } from './random';
import type { Coord, Orientation, ShipSpec, ShotOutcome } from './types';

export type Phase = 'placing' | 'player-turn' | 'ai-turn' | 'won' | 'lost';

export interface ShotEvent {
  readonly by: 'player' | 'ai';
  readonly coord: Coord;
  readonly outcome: ShotOutcome;
}

/** Converts a board outcome into the only information the AI is allowed to see. */
export function toReport(outcome: ShotOutcome): ShotReport {
  return outcome.result === 'sunk'
    ? { result: 'sunk', sunkLength: outcome.ship.length }
    : { result: outcome.result };
}

export class Game {
  readonly fleet: readonly ShipSpec[];
  readonly playerBoard = new Board();
  readonly enemyBoard = new Board();
  readonly ai: BattleshipAI;
  phase: Phase = 'placing';
  lastPlayerShot: ShotEvent | null = null;
  lastAiShot: ShotEvent | null = null;

  constructor(
    private readonly rng: Rng = Math.random,
    fleet: readonly ShipSpec[] = FLEET,
  ) {
    this.fleet = fleet;
    this.ai = new BattleshipAI(fleet.map((s) => s.length), rng);
    randomizeFleet(this.enemyBoard, fleet, rng);
  }

  unplacedShips(): ShipSpec[] {
    return this.fleet.filter((spec) => !this.playerBoard.placedShips.some((s) => s.spec.id === spec.id));
  }

  placePlayerShip(spec: ShipSpec, origin: Coord, orientation: Orientation): PlacementError | null {
    this.assertPhase('placing');
    const error = this.playerBoard.validatePlacement(spec, origin, orientation);
    if (!error) this.playerBoard.place(spec, origin, orientation);
    return error;
  }

  removePlayerShip(shipId: string): boolean {
    this.assertPhase('placing');
    return this.playerBoard.remove(shipId);
  }

  randomizePlayerFleet(): void {
    this.assertPhase('placing');
    this.playerBoard.clear();
    randomizeFleet(this.playerBoard, this.fleet, this.rng);
  }

  resetPlayerFleet(): void {
    this.assertPhase('placing');
    this.playerBoard.clear();
  }

  canStart(): boolean {
    return this.phase === 'placing' && this.playerBoard.hasFleet(this.fleet);
  }

  start(): void {
    if (!this.canStart()) throw new Error('Place every ship before starting');
    this.phase = 'player-turn';
  }

  /** Returns null when the shot is not allowed (wrong turn or cell already fired at). */
  playerFire(c: Coord): ShotEvent | null {
    if (this.phase !== 'player-turn' || this.enemyBoard.hasBeenShot(c)) return null;
    const event: ShotEvent = { by: 'player', coord: c, outcome: this.enemyBoard.fire(c) };
    this.lastPlayerShot = event;
    this.phase = this.enemyBoard.allSunk() ? 'won' : 'ai-turn';
    return event;
  }

  aiFire(): ShotEvent {
    this.assertPhase('ai-turn');
    const coord = this.ai.nextShot();
    const outcome = this.playerBoard.fire(coord);
    this.ai.recordResult(coord, toReport(outcome));
    const event: ShotEvent = { by: 'ai', coord, outcome };
    this.lastAiShot = event;
    this.phase = this.playerBoard.allSunk() ? 'lost' : 'player-turn';
    return event;
  }

  private assertPhase(expected: Phase): void {
    if (this.phase !== expected) throw new Error(`Expected phase ${expected}, got ${this.phase}`);
  }
}
