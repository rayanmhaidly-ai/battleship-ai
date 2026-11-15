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

// jsdom has no PointerEvent, so pointer events are MouseEvents carrying a pointerType and pointerId.
function pointer(
  target: EventTarget,
  type: string,
  pointerType: 'mouse' | 'touch' | 'pen',
  at: { x: number; y: number } = { x: 0, y: 0 },
): MouseEvent {
  const bubbles = type !== 'pointerenter' && type !== 'pointerleave';
  const e = new MouseEvent(type, { bubbles, cancelable: true, clientX: at.x, clientY: at.y });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  Object.defineProperty(e, 'pointerId', { value: pointerType === 'mouse' ? 1 : 7 });
  target.dispatchEvent(e);
  return e;
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

// jsdom has no layout: cell (row, col) sits at x = col * 10 + 5, y = row * 10 + 5, and elementFromPoint maps back.
const pointOf = (el: HTMLElement) => ({ x: Number(el.dataset.col) * 10 + 5, y: Number(el.dataset.row) * 10 + 5 });
function stubElementFromPoint(): void {
  document.elementFromPoint = (x: number, y: number) =>
    x < 0 || y < 0 || x >= 100 || y >= 100
      ? document.body
      : document.querySelector(`#player-board .cell[data-row="${Math.floor(y / 10)}"][data-col="${Math.floor(x / 10)}"]`);
}

/**
 * A finger on the player board, as a phone browser delivers it: the press, moves and release all go to the
 * pressed cell (implicit pointer capture), with the finger's position in clientX/clientY. A tap ends in a click.
 */
const finger = {
  pressed: null as HTMLButtonElement | null,
  type: 'touch' as 'touch' | 'pen',
  down(label: string) {
    const cell = cellAt(label);
    this.pressed = cell;
    pointer(cell, 'pointerenter', this.type);
    const e = pointer(cell, 'pointerdown', this.type, pointOf(cell));
    cell.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
    return e;
  },
  moveTo(label: string) {
    const to = label === 'off-board' ? { x: 150, y: 50 } : pointOf(cellAt(label));
    const move = pointer(this.pressed!, 'pointermove', this.type, to);
    const touch = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    this.pressed!.dispatchEvent(touch);
    return { move, touch };
  },
  up(click = false, detail = 1) {
    const cell = this.pressed!;
    pointer(cell, 'pointerup', this.type, pointOf(cell));
    cell.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true }));
    if (click) {
      cell.focus();
      clickEvent(cell, detail);
    }
    this.pressed = null;
  },
  drag(from: string, ...path: string[]) {
    this.down(from);
    for (const label of path) this.moveTo(label);
    this.up();
  },
};

/** A finger tap: no hover, a press, then the compat focus and click the browser fires. */
function tap(label: string, detail = 1): void {
  finger.down(label);
  finger.up(true, detail);
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
    it(`on touch, with every tap fired twice (${how}): nothing carries over to the next ship`, () => {
      stubElementFromPoint();
      // 1. Put the 5 ship down and lock it by tapping the next ship (each tap fired twice).
      trayTapFiredTwice('Carrier', how);
      tapFiredTwice('A1', how);
      expect(preview()).toEqual({ valid: carrier, invalid: [] });
      trayTapFiredTwice('Battleship', how);
      expect(shipsOnBoard()).toEqual({ Carrier: carrier });
      expect(selectedShipName()).toBe('Battleship');
      expect(preview()).toEqual({ valid: [], invalid: [] });

      // 2. Tap the 4 ship onto the board and drag it onto the 5 ship: it shows red, and tapping the next ship doesn't lock it.
      tapFiredTwice('A2', how);
      finger.drag('A2', 'C1');
      expect(preview()).toEqual({ valid: [], invalid: ['C1', 'D1', 'E1', 'F1'] });
      trayTapFiredTwice('Cruiser', how);
      expect(shipsOnBoard()).toEqual({ Carrier: carrier });
      expect(selectedShipName()).toBe('Battleship');
      expect(startButton().disabled).toBe(true);

      // 3. Tap a valid empty spot, then the next ship: the 4 ship is locked there.
      tapFiredTwice('A3', how);
      trayTapFiredTwice('Cruiser', how);
      expect(shipsOnBoard()).toEqual({ Carrier: carrier, Battleship: battleship });

      // The 3 ship waits off the board; neither the repeats nor the step-2 tap carried over.
      expect(selectedShipName()).toBe('Cruiser');
      expect(preview()).toEqual({ valid: [], invalid: [] });
      clickEvent(cellAt('C1'), 1);
      clickEvent(cellAt('A3'), 1);
      expect(shipsOnBoard()).toEqual({ Carrier: carrier, Battleship: battleship });
      expect(status()).toBe('Battleship locked. Touch your board where the Cruiser should go.');

      // The rest of the fleet goes down one (double) tap at a time; Start unlocks only with all five on green.
      for (const [name, spot, next] of [
        ['Cruiser', 'A5', 'Submarine'],
        ['Submarine', 'A7', 'Destroyer'],
      ] as const) {
        expect(startButton().disabled).toBe(true);
        tapFiredTwice(spot, how);
        trayTapFiredTwice(next, how);
        expect(shipsOnBoard()[name]).toHaveLength(FLEET.find((s) => s.name === name)!.length);
      }
      expect(startButton().disabled).toBe(true);
      tapFiredTwice('A9', how);
      expect(startButton().disabled).toBe(false);
      startButton().click();
      expect(fleetLengths()).toEqual([5, 4, 3, 3, 2]);
      expect(document.getElementById('app')!.dataset.phase).toBe('player-turn');
    });
  }
});

const pickerButton = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.ship-option')].find((b) => b.textContent!.includes(name))!;
/** A finger tap on a ship in the tray. */
function trayTap(name: string, detail = 1, type: 'touch' | 'pen' = 'touch'): void {
  pointer(pickerButton(name), 'pointerdown', type);
  pointer(pickerButton(name), 'pointerup', type);
  clickEvent(pickerButton(name), detail);
}
function trayTapFiredTwice(name: string, how: 'repeated-click' | 'double-tap'): void {
  trayTap(name);
  if (how === 'repeated-click') clickEvent(pickerButton(name), 1);
  else trayTap(name, 2);
}

describe('placing ships by touch', () => {
  const phase = () => document.getElementById('app')!.dataset.phase;
  const rotateButton = () => document.getElementById('rotate')!;

  beforeEach(async () => {
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
    vi.resetModules();
    await import('../src/main');
    stubElementFromPoint();
    finger.type = 'touch';
  });

  it('1. tapping a ship in the tray shows nothing on the board yet', () => {
    trayTap('Carrier');
    expect(selectedShipName()).toBe('Carrier');
    expect(preview()).toEqual({ valid: [], invalid: [] });
    trayTap('Cruiser');
    expect(selectedShipName()).toBe('Cruiser');
    expect(preview()).toEqual({ valid: [], invalid: [] });
    expect(shipsOnBoard()).toEqual({});
    expect(status()).toBe('Touch your board where the Cruiser should go.');
  });

  it('2. the ship appears only when a square is touched, at that square, and lifting the finger does not lock it', () => {
    trayTap('Battleship');
    finger.down('D4');
    expect(preview()).toEqual({ valid: ['D4', 'E4', 'F4', 'G4'], invalid: [] });
    finger.up(true);
    expect(preview()).toEqual({ valid: ['D4', 'E4', 'F4', 'G4'], invalid: [] });
    expect(shipsOnBoard()).toEqual({});
    expect(selectedShipName()).toBe('Battleship');
    // Near the edge it slides back onto the board.
    tap('J8');
    expect(preview()).toEqual({ valid: ['G8', 'H8', 'I8', 'J8'], invalid: [] });
    expect(shipsOnBoard()).toEqual({});
  });

  it('3. while the finger stays down the ship follows it, and Rotate turns it', () => {
    trayTap('Cruiser');
    finger.down('B2');
    finger.moveTo('C2');
    expect(preview()).toEqual({ valid: ['C2', 'D2', 'E2'], invalid: [] });
    finger.moveTo('F6');
    expect(preview()).toEqual({ valid: ['F6', 'G6', 'H6'], invalid: [] });
    // Leaving the board keeps it at the last square.
    finger.moveTo('off-board');
    expect(preview()).toEqual({ valid: ['F6', 'G6', 'H6'], invalid: [] });
    finger.up();
    expect(shipsOnBoard()).toEqual({});

    rotateButton().click();
    expect(preview()).toEqual({ valid: ['F6', 'F7', 'F8'], invalid: [] });
    // Grabbing it by its middle drags it from there, without jumping.
    finger.down('F7');
    expect(preview()).toEqual({ valid: ['F6', 'F7', 'F8'], invalid: [] });
    finger.moveTo('B4');
    expect(preview()).toEqual({ valid: ['B3', 'B4', 'B5'], invalid: [] });
    rotateButton().click();
    expect(preview()).toEqual({ valid: ['A4', 'B4', 'C4'], invalid: [] });
    // A second finger on Rotate while the first is still down: it turns on the press, and only once.
    const secondFinger = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperties(secondFinger, { pointerType: { value: 'touch' }, pointerId: { value: 8 } });
    rotateButton().dispatchEvent(secondFinger);
    expect(preview()).toEqual({ valid: ['B3', 'B4', 'B5'], invalid: [] });
    clickEvent(rotateButton(), 1);
    expect(preview()).toEqual({ valid: ['B3', 'B4', 'B5'], invalid: [] });
    finger.moveTo('C5');
    expect(preview()).toEqual({ valid: ['C4', 'C5', 'C6'], invalid: [] });
    finger.up();
    expect(shipsOnBoard()).toEqual({});
  });

  it('4. tapping the next ship locks the current one; the new one waits for a touch; a red one never locks', () => {
    trayTap('Carrier');
    finger.drag('A1', 'B1', 'A1');
    trayTap('Battleship');
    expect(shipsOnBoard()).toEqual({ Carrier: ['A1', 'B1', 'C1', 'D1', 'E1'] });
    expect(selectedShipName()).toBe('Battleship');
    expect(preview()).toEqual({ valid: [], invalid: [] });

    // Red: tapping the next ship does nothing but explain.
    finger.drag('B2', 'B1');
    expect(preview()).toEqual({ valid: [], invalid: ['B1', 'C1', 'D1', 'E1'] });
    expect(status()).toBe("The Battleship can't go there. Drag it to a green spot.");
    trayTap('Cruiser');
    expect(shipsOnBoard()).toEqual({ Carrier: ['A1', 'B1', 'C1', 'D1', 'E1'] });
    expect(selectedShipName()).toBe('Battleship');
    expect(preview()).toEqual({ valid: [], invalid: ['B1', 'C1', 'D1', 'E1'] });
    expect(status()).toBe('The Battleship is on a red spot. Drag it to a green spot first.');

    finger.drag('B1', 'B3');
    trayTap('Cruiser');
    expect(shipsOnBoard().Battleship).toEqual(['B3', 'C3', 'D3', 'E3']);
    expect(selectedShipName()).toBe('Cruiser');
    expect(preview()).toEqual({ valid: [], invalid: [] });
    expect(status()).toBe('Battleship locked. Touch your board where the Cruiser should go.');
    expect(startButton().disabled).toBe(true);
  });

  it('5. touching a placed ship picks it up: drag it, or tap another square; it locks from the tray again', () => {
    trayTap('Carrier');
    tap('A1');
    trayTap('Battleship');
    expect(shipsOnBoard()).toEqual({ Carrier: ['A1', 'B1', 'C1', 'D1', 'E1'] });

    // Drag it by the cell you touched.
    finger.down('C1');
    expect(shipsOnBoard()).toEqual({});
    expect(preview()).toEqual({ valid: ['A1', 'B1', 'C1', 'D1', 'E1'], invalid: [] });
    expect(selectedShipName()).toBe('Carrier');
    finger.moveTo('C5');
    finger.up();
    expect(preview()).toEqual({ valid: ['A5', 'B5', 'C5', 'D5', 'E5'], invalid: [] });
    expect(shipsOnBoard()).toEqual({});

    // Or tap another square.
    tap('F9');
    expect(preview()).toEqual({ valid: ['D9', 'E9', 'F9', 'G9', 'H9'], invalid: [] });
    trayTap('Battleship');
    expect(shipsOnBoard()).toEqual({ Carrier: ['D9', 'E9', 'F9', 'G9', 'H9'] });
    expect(selectedShipName()).toBe('Battleship');

    // A placed ship tapped in the tray is held where it lies, ready to move.
    trayTap('Carrier');
    expect(shipsOnBoard()).toEqual({});
    expect(preview()).toEqual({ valid: ['D9', 'E9', 'F9', 'G9', 'H9'], invalid: [] });
    tap('A2');
    trayTap('Destroyer');
    expect(shipsOnBoard()).toEqual({ Carrier: ['A2', 'B2', 'C2', 'D2', 'E2'] });
  });

  it('locks the last ship with Start battle (only on green) or by tapping it in the tray again', () => {
    const spots = ['A1', 'A3', 'A5', 'A7', 'A9'];
    FLEET.forEach((spec, i) => {
      if (i > 0) trayTap(spec.name);
      tap(spots[i]);
    });
    expect(Object.keys(shipsOnBoard())).toHaveLength(4);
    // The Destroyer is on green: Start locks it and starts.
    expect(startButton().disabled).toBe(false);
    finger.drag('A9', 'B7');
    expect(startButton().disabled).toBe(true);
    startButton().click();
    expect(phase()).toBe('placing');
    finger.drag('B7', 'F9');
    trayTap('Destroyer');
    expect(fleetLengths()).toEqual([5, 4, 3, 3, 2]);
    expect(selectedShipName()).toBeNull();
    expect(status()).toBe('Fleet ready. Press Start battle, or touch a ship to move it.');
    expect(startButton().disabled).toBe(false);

    trayTap('Destroyer');
    tap('A10');
    startButton().click();
    expect(shipsOnBoard().Destroyer).toEqual(['A10', 'B10']);
    expect(phase()).toBe('player-turn');
  });

  it('works the same with a pen', () => {
    finger.type = 'pen';
    trayTap('Submarine', 1, 'pen');
    expect(preview()).toEqual({ valid: [], invalid: [] });
    finger.drag('C3', 'C4');
    expect(preview()).toEqual({ valid: ['C4', 'D4', 'E4'], invalid: [] });
    trayTap('Destroyer', 1, 'pen');
    expect(shipsOnBoard()).toEqual({ Submarine: ['C4', 'D4', 'E4'] });
  });

  it('keeps the page from scrolling or zooming while dragging on the board, and only then', () => {
    // jsdom drops touch-action from inline styles and has no cascade, so check the class and the rule it gets.
    const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
    expect(css).toMatch(/\.board\.no-touch-scroll,\s*\.board\.no-touch-scroll \.cell \{\s*touch-action: none;/);
    const board = document.getElementById('player-board')!;
    expect(board.classList.contains('no-touch-scroll')).toBe(true);
    expect(document.querySelectorAll('.no-touch-scroll')).toHaveLength(1);

    trayTap('Carrier');
    const down = finger.down('A1');
    expect(down.defaultPrevented).toBe(true);
    const { move, touch } = finger.moveTo('A2');
    expect(move.defaultPrevented).toBe(true);
    expect(touch.defaultPrevented).toBe(true);
    finger.up();
    // No drag in progress: a touchmove is left to the browser.
    const idle = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    cellAt('A5').dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);

    trayTap('Battleship');
    document.getElementById('randomize')!.click();
    startButton().click();
    expect(phase()).toBe('player-turn');
    expect(board.classList.contains('no-touch-scroll')).toBe(false);
    const battle = finger.down('A1');
    expect(battle.defaultPrevented).toBe(false);
  });

  it('a mouse still uses the desktop flow, whatever the window size, after touch input', () => {
    trayTap('Cruiser');
    expect(preview()).toEqual({ valid: [], invalid: [] });
    pointer(pickerButton('Carrier'), 'pointerdown', 'mouse');
    clickEvent(pickerButton('Carrier'), 1);
    expect(preview()).toEqual({ valid: ['A1', 'B1', 'C1', 'D1', 'E1'], invalid: [] });
    mouse.at = null;
    mouse.click('C3');
    expect(shipsOnBoard()).toEqual({ Carrier: ['C3', 'D3', 'E3', 'F3', 'G3'] });
    expect(selectedShipName()).toBe('Battleship');
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
