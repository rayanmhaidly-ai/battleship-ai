export const BOARD_SIZE = 10;

export interface Coord {
  readonly row: number;
  readonly col: number;
}

export type Orientation = 'horizontal' | 'vertical';

export interface ShipSpec {
  readonly id: string;
  readonly name: string;
  readonly length: number;
}

export type ShotOutcome =
  | { readonly result: 'miss' }
  | { readonly result: 'hit' }
  | { readonly result: 'sunk'; readonly ship: ShipSpec };

const COLUMN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function formatCoord(c: Coord): string {
  return `${COLUMN_LETTERS[c.col]}${c.row + 1}`;
}
