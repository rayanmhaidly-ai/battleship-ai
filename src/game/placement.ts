import { Board } from './board';
import { randomInt, type Rng } from './random';
import type { Coord, Orientation, ShipSpec } from './types';

/** Places every ship of the fleet that is not already on the board at a random legal position. */
export function randomizeFleet(board: Board, fleet: readonly ShipSpec[], rng: Rng): void {
  for (const spec of fleet) {
    if (board.placedShips.some((s) => s.spec.id === spec.id)) continue;
    const options: { origin: Coord; orientation: Orientation }[] = [];
    for (const orientation of ['horizontal', 'vertical'] as const) {
      for (let row = 0; row < board.size; row++) {
        for (let col = 0; col < board.size; col++) {
          if (board.canPlace(spec, { row, col }, orientation)) {
            options.push({ origin: { row, col }, orientation });
          }
        }
      }
    }
    if (options.length === 0) throw new Error(`No room left to place ${spec.name}`);
    const pick = options[randomInt(rng, options.length)];
    board.place(spec, pick.origin, pick.orientation);
  }
}
