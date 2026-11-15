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

// jsdom has no PointerEvent, so pointer events are MouseEvents carrying a pointerType.
function pointer(target: EventTarget, type: string, pointerType: 'mouse' | 'touch'): void {
  const bubbles = type !== 'pointerenter' && type !== 'pointerleave';
  const e = new MouseEvent(type, { bubbles, cancelable: true });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  target.dispatchEvent(e);
}
const clickEvent = (target: EventTarget, detail: number) =>
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));

/** A real mouse: the cursor moves between cells, and each click is preceded by its own press. */
const mouse = {
  at: null as string | null,
  moveTo(label: string) {
    if (this.at === label) return;
    pointer(cellAt(label), 'pointerenter', 'mouse');
    this.at = label;
  },
  leaveBoard() {
    pointer(document.getElementById('player-board')!, 'pointerleave', 'mouse');
    this.at = null;
  },
  click(label: string, detail = 1) {
    this.moveTo(label);
    const cell = cellAt(label);
    pointer(cell, 'pointerdown', 'mouse');
    cell.focus(); // fires focus only if the cell isn't focused already, like a browser
    pointer(cell, 'pointerup', 'mouse');
    clickEvent(cell, detail);
  },
  doubleClick(label: string) {
    this.click(label, 1);
    this.click(label, 2);
  },
};

/** A finger tap: no hover, a press, then the compat focus and click the browser fires. */
function tap(label: string, detail = 1): void {
  const cell = cellAt(label);
  pointer(cell, 'pointerenter', 'touch');
  pointer(cell, 'pointerdown', 'touch');
  cell.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
  pointer(cell, 'pointerup', 'touch');
  cell.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
  cell.focus();
  clickEvent(cell, detail);
}
/** A tap the browser delivers twice: either a repeated click with no new press, or a full second tap. */
function tapFiredTwice(label: string, how: 'repeated-click' | 'double-tap'): void {
  tap(label);
  if (how === 'repeated-click') clickEvent(cellAt(label), 1);
  else tap(label, 2);
}
const status = () => document.getElementById('status')!.textContent;

describe('earlier clicks never carry over to the next ship', () => {
  const carrier = ['A1', 'B1', 'C1', 'D1', 'E1'];
  const battleship = ['A3', 'B3', 'C3', 'D3'];

  beforeEach(async () => {
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
    vi.resetModules();
    await import('../src/main');
    mouse.at = null;
  });

  it('with a mouse: place the 5, click the 4 on a red spot, place it elsewhere; the 3 waits for a click', () => {
    // 1. Place the 5 ship.
    mouse.click('A1');
    expect(shipsOnBoard()).toEqual({ Carrier: carrier });
    // The next ship's preview starts under the cursor, where the mouse actually is.
    expect(selectedShipName()).toBe('Battleship');
    expect(preview()).toEqual({ valid: [], invalid: ['A1', 'B1', 'C1', 'D1'] });

    // 2. Move the 4 ship over it so the preview is red, and click: nothing is placed.
    mouse.moveTo('C1');
    expect(preview()).toEqual({ valid: [], invalid: ['C1', 'D1', 'E1', 'F1'] });
    mouse.click('C1');
    expect(shipsOnBoard()).toEqual({ Carrier: carrier });
    expect(selectedShipName()).toBe('Battleship');
    expect(startButton().disabled).toBe(true);

    // 3. Click a valid empty spot: the 4 ship is placed there.
    mouse.moveTo('A3');
    expect(preview()).toEqual({ valid: battleship, invalid: [] });
    mouse.click('A3');
    expect(shipsOnBoard()).toEqual({ Carrier: carrier, Battleship: battleship });

    // The 3 ship is held under the cursor and waits; a stale click from step 2 is ignored.
    expect(selectedShipName()).toBe('Cruiser');
    expect(preview()).toEqual({ valid: [], invalid: ['A3', 'B3', 'C3'] });
    clickEvent(cellAt('C1'), 1);
    clickEvent(cellAt('A3'), 1);
    expect(shipsOnBoard()).toEqual({ Carrier: carrier, Battleship: battleship });
    expect(status()).toBe('Battleship placed. Next: Cruiser.');

    // Off the board the preview goes away; it follows the cursor back and drops only on a new click.
    mouse.leaveBoard();
    expect(preview()).toEqual({ valid: [], invalid: [] });
    mouse.moveTo('A5');
    expect(preview()).toEqual({ valid: ['A5', 'B5', 'C5'], invalid: [] });
    mouse.click('A5');
    expect(shipsOnBoard().Cruiser).toEqual(['A5', 'B5', 'C5']);
    expect(selectedShipName()).toBe('Submarine');
  });

  it('with a mouse: the second click of a double-click does not reach the next ship', () => {
    mouse.doubleClick('A1');
    expect(shipsOnBoard()).toEqual({ Carrier: carrier });
    expect(selectedShipName()).toBe('Battleship');
    expect(status()).toBe('Carrier placed. Next: Battleship.');

    mouse.doubleClick('C1');
    expect(shipsOnBoard()).toEqual({ Carrier: carrier });
    expect(selectedShipName()).toBe('Battleship');

    mouse.doubleClick('A3');
    expect(shipsOnBoard()).toEqual({ Carrier: carrier, Battleship: battleship });
    expect(selectedShipName()).toBe('Cruiser');
    expect(status()).toBe('Battleship placed. Next: Cruiser.');

    // A new click on its own press is a real drop attempt again.
    mouse.click('A3');
    expect(status()).toBe('The Cruiser would overlap another ship. Pick a green spot.');
    expect(selectedShipName()).toBe('Cruiser');
  });

  for (const how of ['repeated-click', 'double-tap'] as const) {
    it(`on touch, with every tap fired twice (${how}): each next ship waits on the first free spot`, () => {
      // 1. Place the 5 ship.
      tapFiredTwice('A1', how);
      expect(shipsOnBoard()).toEqual({ Carrier: carrier });
      expect(selectedShipName()).toBe('Battleship');
      expect(preview()).toEqual({ valid: ['F1', 'G1', 'H1', 'I1'], invalid: [] });
      expect(status()).toBe('Carrier placed. Next: Battleship.');

      // 2. Tap the 4 ship onto the 5 ship: nothing is placed.
      tapFiredTwice('C1', how);
      expect(shipsOnBoard()).toEqual({ Carrier: carrier });
      expect(selectedShipName()).toBe('Battleship');
      expect(preview()).toEqual({ valid: [], invalid: ['C1', 'D1', 'E1', 'F1'] });
      expect(startButton().disabled).toBe(true);

      // 3. Tap a valid empty spot: the 4 ship is placed there.
      tapFiredTwice('A3', how);
      expect(shipsOnBoard()).toEqual({ Carrier: carrier, Battleship: battleship });

      // The 3 ship waits, green on the first free spot; neither the repeat nor the step-2 tap carried over.
      expect(selectedShipName()).toBe('Cruiser');
      expect(preview()).toEqual({ valid: ['F1', 'G1', 'H1'], invalid: [] });
      expect(status()).toBe('Battleship placed. Next: Cruiser.');

      // The rest of the fleet goes down one (double) tap at a time; Start unlocks only at the end.
      for (const [name, spot] of [['Cruiser', 'F1'], ['Submarine', 'A2'], ['Destroyer', 'D2']] as const) {
        expect(selectedShipName()).toBe(name);
        expect(startButton().disabled).toBe(true);
        tapFiredTwice(spot, how);
        expect(shipsOnBoard()[name]).toHaveLength(FLEET.find((s) => s.name === name)!.length);
      }
      expect(fleetLengths()).toEqual([5, 4, 3, 3, 2]);
      expect(selectedShipName()).toBeNull();
      expect(startButton().disabled).toBe(false);
    });
  }
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
