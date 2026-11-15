// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLEET } from '../src/game/fleet';
import { Board } from '../src/game/board';
import { firstFreeSpot, heldShipOrigin } from '../src/game/placement';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

const cells = () => [...document.querySelectorAll<HTMLButtonElement>('#player-board .cell')];
const cellAt = (label: string) => cells().find((c) => c.getAttribute('aria-label')!.startsWith(`${label}:`))!;
const coordOf = (c: HTMLButtonElement) => c.getAttribute('aria-label')!.split(':')[0];

/** Ship name -> its cells, read from the rendered player board. */
function shipsOnBoard(): Record<string, string[]> {
  const ships: Record<string, string[]> = {};
  for (const c of cells()) {
    const name = c.getAttribute('aria-label')!.split(': ')[1];
    if (name !== 'water') (ships[name] ??= []).push(coordOf(c));
  }
  return ships;
}

const previewCells = () => cells().filter((c) => /\bpreview(-invalid)?\b/.test(c.className)).map(coordOf);
const fleetLengths = () => FLEET.map((s) => shipsOnBoard()[s.name]?.length ?? 0);
const hover = (label: string) => cellAt(label).dispatchEvent(new FocusEvent('focus'));
const startButton = () => document.getElementById('start') as HTMLButtonElement;
const selectedShipName = () =>
  document.querySelector('.ship-option[aria-selected="true"] .name')?.textContent ?? null;
const preview = () => ({
  valid: cells().filter((c) => c.classList.contains('preview')).map(coordOf),
  invalid: cells().filter((c) => c.classList.contains('preview-invalid')).map(coordOf),
});

describe('moving a placed ship on the setup screen', () => {
  beforeEach(async () => {
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
    vi.resetModules();
    await import('../src/main');
    document.getElementById('randomize')!.click();
  });

  it('picks the ship up where it lies, whichever cell is clicked, and drops it back at full length', () => {
    for (const spec of FLEET) {
      const original = shipsOnBoard()[spec.name];
      for (const grabbed of original) {
        cellAt(grabbed).click();
        expect(shipsOnBoard()[spec.name]).toBeUndefined();
        expect(previewCells().sort()).toEqual([...original].sort());
        cellAt(grabbed).click();
        expect(shipsOnBoard()[spec.name]).toEqual(original);
      }
    }
    expect(fleetLengths()).toEqual([5, 4, 3, 3, 2]);
  });

  it('keeps the held ship at full length near the edges and when rotated', () => {
    for (const spec of FLEET) {
      const stern = shipsOnBoard()[spec.name].at(-1)!;
      cellAt(stern).click();
      for (const corner of ['A1', 'J1', 'A10', 'J10']) {
        for (let turn = 0; turn < 2; turn++) {
          cellAt(corner).dispatchEvent(new FocusEvent('focus'));
          expect(previewCells()).toHaveLength(spec.length);
          document.getElementById('rotate')!.click();
        }
      }
      document.getElementById('randomize')!.click();
    }
    expect(fleetLengths()).toEqual([5, 4, 3, 3, 2]);
  });
});

describe('heldShipOrigin', () => {
  it('keeps the grabbed cell under the cursor', () => {
    expect(heldShipOrigin({ row: 4, col: 5 }, 5, 'horizontal', 2)).toEqual({ row: 4, col: 3 });
    expect(heldShipOrigin({ row: 4, col: 5 }, 5, 'vertical', 2)).toEqual({ row: 2, col: 5 });
  });

  it('slides the ship back onto the board instead of letting it hang off the edge', () => {
    expect(heldShipOrigin({ row: 0, col: 9 }, 5, 'horizontal', 0)).toEqual({ row: 0, col: 5 });
    expect(heldShipOrigin({ row: 0, col: 0 }, 5, 'vertical', 4)).toEqual({ row: 0, col: 0 });
  });
});

describe('clicking an invalid spot while placing a ship', () => {

  beforeEach(async () => {
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
    vi.resetModules();
    await import('../src/main');
  });

  it('does nothing until the current ship is dropped on a valid spot', () => {
    const carrier = ['A1', 'B1', 'C1', 'D1', 'E1'];

    // 1. Place the 5 ship.
    expect(selectedShipName()).toBe('Carrier');
    hover('A1');
    cellAt('A1').click();
    expect(shipsOnBoard()).toEqual({ Carrier: carrier });
    expect(selectedShipName()).toBe('Battleship');

    // 2. Hover the 4 ship over it: the preview is red.
    hover('A1');
    expect(preview()).toEqual({ valid: [], invalid: ['A1', 'B1', 'C1', 'D1'] });

    // 3. Click there anyway, then click elsewhere on other invalid spots.
    for (const spot of ['A1', 'C1', 'E1']) {
      hover(spot);
      cellAt(spot).click();
      expect(shipsOnBoard()).toEqual({ Carrier: carrier });
      expect(selectedShipName()).toBe('Battleship');
      expect(preview().valid).toEqual([]);
      expect(preview().invalid.length).toBeGreaterThan(0);
      expect(startButton().disabled).toBe(true);
    }

    // The Battleship is still held and follows the cursor to a valid (green) spot.
    hover('A3');
    expect(preview()).toEqual({ valid: ['A3', 'B3', 'C3', 'D3'], invalid: [] });
    cellAt('A3').click();
    expect(shipsOnBoard()).toEqual({ Carrier: carrier, Battleship: ['A3', 'B3', 'C3', 'D3'] });
    expect(selectedShipName()).toBe('Cruiser');

    // Start battle stays disabled until all 5 ships are validly placed.
    for (const row of ['5', '7', '9']) {
      expect(startButton().disabled).toBe(true);
      hover(`A${row}`);
      cellAt(`A${row}`).click();
    }
    expect(fleetLengths()).toEqual([5, 4, 3, 3, 2]);
    expect(selectedShipName()).toBeNull();
    expect(startButton().disabled).toBe(false);
  });
});

describe('starting preview of the next ship', () => {
  const pickerButton = (name: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('.ship-option')].find((b) => b.textContent!.includes(name))!;

  beforeEach(async () => {
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
    vi.resetModules();
    await import('../src/main');
  });

  it('starts each new ship on the first free spot, so the whole fleet can be placed by tapping the preview', () => {
    const expected: [string, string[]][] = [
      ['Carrier', ['A1', 'B1', 'C1', 'D1', 'E1']],
      ['Battleship', ['F1', 'G1', 'H1', 'I1']],
      ['Cruiser', ['A2', 'B2', 'C2']],
      ['Submarine', ['D2', 'E2', 'F2']],
      ['Destroyer', ['G2', 'H2']],
    ];
    for (const [name, spot] of expected) {
      expect(selectedShipName()).toBe(name);
      expect(preview()).toEqual({ valid: spot, invalid: [] });
      expect(startButton().disabled).toBe(true);
      // A tap on a touch screen: no hover, just a click on the previewed bow.
      cellAt(spot[0]).click();
      expect(shipsOnBoard()[name]).toEqual(spot);
    }
    expect(selectedShipName()).toBeNull();
    expect(preview()).toEqual({ valid: [], invalid: [] });
    expect(startButton().disabled).toBe(false);
  });

  it('starts a ship chosen from the picker on a free spot', () => {
    cellAt('A1').click();
    pickerButton('Destroyer').click();
    expect(selectedShipName()).toBe('Destroyer');
    expect(preview()).toEqual({ valid: ['F1', 'G1'], invalid: [] });
  });

  it('starts on a free spot again after Clear', () => {
    cellAt('A1').click();
    document.getElementById('reset')!.click();
    expect(selectedShipName()).toBe('Carrier');
    expect(preview()).toEqual({ valid: ['A1', 'B1', 'C1', 'D1', 'E1'], invalid: [] });
  });
});

describe('firstFreeSpot', () => {
  const ship = (length: number) => ({ id: `s${length}`, name: `Ship ${length}`, length });

  it('scans rows then columns from the top left in the current orientation', () => {
    const board = new Board();
    board.place(ship(5), { row: 0, col: 0 }, 'horizontal');
    expect(firstFreeSpot(board, ship(4), 'horizontal')).toEqual({ origin: { row: 0, col: 5 }, orientation: 'horizontal' });
    expect(firstFreeSpot(board, ship(4), 'vertical')).toEqual({ origin: { row: 0, col: 5 }, orientation: 'vertical' });
  });

  it('falls back to the other orientation when the current one has no room', () => {
    const board = new Board(3);
    board.place(ship(3), { row: 0, col: 1 }, 'vertical');
    expect(firstFreeSpot(board, ship(2), 'horizontal')).toEqual({ origin: { row: 0, col: 0 }, orientation: 'vertical' });
  });

  it('returns null when the ship fits nowhere', () => {
    expect(firstFreeSpot(new Board(2), ship(3), 'horizontal')).toBeNull();
  });
});
