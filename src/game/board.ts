import { BOARD_SIZE, type Coord, type Orientation, type ShipSpec, type ShotOutcome } from './types';

export type PlacementError = 'out-of-bounds' | 'overlap' | 'already-placed';
export type ShotMark = 'hit' | 'miss';

export const coordKey = (c: Coord): string => `${c.row},${c.col}`;

export function inBounds(c: Coord, size = BOARD_SIZE): boolean {
  return (
    Number.isInteger(c.row) &&
    Number.isInteger(c.col) &&
    c.row >= 0 &&
    c.row < size &&
    c.col >= 0 &&
    c.col < size
  );
}

export function shipCells(origin: Coord, length: number, orientation: Orientation): Coord[] {
  return Array.from({ length }, (_, i) =>
    orientation === 'horizontal'
      ? { row: origin.row, col: origin.col + i }
      : { row: origin.row + i, col: origin.col },
  );
}

export interface PlacedShip {
  readonly spec: ShipSpec;
  readonly orientation: Orientation;
  readonly cells: readonly Coord[];
  readonly hits: number;
  readonly sunk: boolean;
}

class Ship implements PlacedShip {
  private readonly hitKeys = new Set<string>();

  constructor(
    readonly spec: ShipSpec,
    readonly orientation: Orientation,
    readonly cells: readonly Coord[],
  ) {}

  get hits(): number {
    return this.hitKeys.size;
  }

  get sunk(): boolean {
    return this.hitKeys.size >= this.spec.length;
  }

  registerHit(c: Coord): void {
    this.hitKeys.add(coordKey(c));
  }
}

export class Board {
  private readonly ships: Ship[] = [];
  private readonly occupied = new Map<string, Ship>();
  private readonly shots = new Map<string, ShotMark>();

  constructor(readonly size = BOARD_SIZE) {}

  get placedShips(): readonly PlacedShip[] {
    return this.ships;
  }

  get shotCount(): number {
    return this.shots.size;
  }

  validatePlacement(spec: ShipSpec, origin: Coord, orientation: Orientation): PlacementError | null {
    if (this.ships.some((s) => s.spec.id === spec.id)) return 'already-placed';
    const cells = shipCells(origin, spec.length, orientation);
    if (!cells.every((c) => inBounds(c, this.size))) return 'out-of-bounds';
    if (cells.some((c) => this.occupied.has(coordKey(c)))) return 'overlap';
    return null;
  }

  canPlace(spec: ShipSpec, origin: Coord, orientation: Orientation): boolean {
    return this.validatePlacement(spec, origin, orientation) === null;
  }

  place(spec: ShipSpec, origin: Coord, orientation: Orientation): PlacedShip {
    const error = this.validatePlacement(spec, origin, orientation);
    if (error) throw new Error(`Cannot place ${spec.name}: ${error}`);
    const ship = new Ship(spec, orientation, shipCells(origin, spec.length, orientation));
    this.ships.push(ship);
    for (const c of ship.cells) this.occupied.set(coordKey(c), ship);
    return ship;
  }

  remove(shipId: string): boolean {
    if (this.shots.size > 0) throw new Error('Cannot move ships after firing has started');
    const index = this.ships.findIndex((s) => s.spec.id === shipId);
    if (index === -1) return false;
    const [ship] = this.ships.splice(index, 1);
    for (const c of ship.cells) this.occupied.delete(coordKey(c));
    return true;
  }

  clear(): void {
    this.ships.length = 0;
    this.occupied.clear();
    this.shots.clear();
  }

  shipAt(c: Coord): PlacedShip | undefined {
    return this.occupied.get(coordKey(c));
  }

  shotAt(c: Coord): ShotMark | undefined {
    return this.shots.get(coordKey(c));
  }

  hasBeenShot(c: Coord): boolean {
    return this.shots.has(coordKey(c));
  }

  hasFleet(fleet: readonly ShipSpec[]): boolean {
    return fleet.every((spec) => this.ships.some((s) => s.spec.id === spec.id));
  }

  fire(c: Coord): ShotOutcome {
    if (!inBounds(c, this.size)) throw new RangeError(`Shot out of bounds: ${c.row},${c.col}`);
    const key = coordKey(c);
    if (this.shots.has(key)) throw new Error(`Cell already fired at: ${c.row},${c.col}`);
    const ship = this.occupied.get(key);
    if (!ship) {
      this.shots.set(key, 'miss');
      return { result: 'miss' };
    }
    this.shots.set(key, 'hit');
    ship.registerHit(c);
    return ship.sunk ? { result: 'sunk', ship: ship.spec } : { result: 'hit' };
  }

  allSunk(): boolean {
    return this.ships.length > 0 && this.ships.every((s) => s.sunk);
  }
}
