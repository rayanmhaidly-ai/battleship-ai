import { Board } from './board';
import { randomInt, type Rng } from './random';
import { BOARD_SIZE, type Coord, type Orientation, type ShipSpec } from './types';

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

/**
 * Origin (bow) of a ship of `length` that is held by its `grabIndex`-th cell with that cell at `cursor`.
 * The ship is slid along its own axis so it always stays fully on the board.
 */
export function heldShipOrigin(
  cursor: Coord,
  length: number,
  orientation: Orientation,
  grabIndex: number,
  size = BOARD_SIZE,
): Coord {
  const offset = Math.min(Math.max(grabIndex, 0), length - 1);
  const clamp = (v: number) => Math.min(Math.max(v, 0), size - length);
  return orientation === 'horizontal'
    ? { row: cursor.row, col: clamp(cursor.col - offset) }
    : { row: clamp(cursor.row - offset), col: cursor.col };
}
