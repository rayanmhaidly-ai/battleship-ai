// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLEET } from '../src/game/fleet';
import { heldShipOrigin } from '../src/game/placement';

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
