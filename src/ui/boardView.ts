import { BOARD_SIZE, formatCoord, type Coord } from '../game/types';

export interface CellView {
  classes: string[];
  label: string;
  disabled: boolean;
}

export interface BoardHandlers {
  onClick?: (c: Coord) => void;
  onHover?: (c: Coord | null) => void;
}

/** Renders a 10x10 grid of buttons with row/column labels and updates them in place. */
export class BoardView {
  private readonly cells: HTMLButtonElement[] = [];
  private mouse: Coord | null = null;
  // Pointer presses are numbered; a click is attributed to the press that started it.
  private presses = 0;
  private clickPress = 0;
  private ignoreUpTo = 0;

  constructor(
    private readonly root: HTMLElement,
    handlers: BoardHandlers,
  ) {
    root.replaceChildren();
    root.setAttribute('role', 'grid');
    root.appendChild(label(''));
    for (let col = 0; col < BOARD_SIZE; col++) root.appendChild(label(String.fromCharCode(65 + col)));
    for (let row = 0; row < BOARD_SIZE; row++) {
      root.appendChild(label(String(row + 1)));
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.setAttribute('role', 'gridcell');
        const coord = { row, col };
        cell.addEventListener('pointerdown', (e) => {
          this.presses++;
          if (e.pointerType !== 'mouse') this.mouse = null;
        });
        cell.addEventListener('click', (e) => this.click(coord, e.detail, handlers));
        cell.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse') return;
          this.mouse = coord;
          handlers.onHover?.(coord);
        });
        cell.addEventListener('focus', () => handlers.onHover?.(coord));
        this.cells.push(cell);
        root.appendChild(cell);
      }
    }
    root.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse = null;
      handlers.onHover?.(null);
    });
  }

  /** The cell under the mouse cursor, or null when the mouse is off the board or the last input was touch/pen. */
  get mouseCell(): Coord | null {
    return this.mouse;
  }

  /**
   * Drops every click that belongs to a press made before now: a tap the browser fires twice, or the
   * rest of a double-click. The next click needs a new press.
   */
  ignoreEarlierPresses(): void {
    this.ignoreUpTo = this.presses;
  }

  private click(coord: Coord, detail: number, handlers: BoardHandlers): void {
    // Keyboard activation (detail 0) has no pointer press, so it counts as a press of its own.
    if (detail === 0) this.presses++;
    // A click that repeats an earlier one (2nd click of a double-click/double-tap) belongs to that click's press.
    if (detail <= 1) this.clickPress = this.presses;
    if (this.clickPress <= this.ignoreUpTo) return;
    handlers.onClick?.(coord);
  }

  update(view: (c: Coord) => CellView): void {
    this.cells.forEach((cell, i) => {
      const coord = { row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE };
      const v = view(coord);
      const className = ['cell', ...v.classes].join(' ');
      if (cell.className !== className) cell.className = className;
      cell.setAttribute('aria-label', `${formatCoord(coord)}: ${v.label}`);
      cell.setAttribute('aria-disabled', String(v.disabled));
    });
  }

  setActive(active: boolean): void {
    this.root.classList.toggle('active', active);
  }
}

function label(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'axis-label';
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
