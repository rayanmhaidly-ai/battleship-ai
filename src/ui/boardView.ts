import { BOARD_SIZE, formatCoord, type Coord } from '../game/types';

export interface CellView {
  classes: string[];
  label: string;
  disabled: boolean;
}

export interface BoardHandlers {
  onClick?: (c: Coord) => void;
  onHover?: (c: Coord | null) => void;
  /** A touch/pen press on a cell. Return true to drag from it; clicks from touch/pen presses are then not sent to `onClick`. */
  onTouchDown?: (c: Coord) => boolean;
  /** The finger dragged onto another cell of this board. */
  onTouchMove?: (c: Coord) => void;
  onTouchUp?: () => void;
}

/** Renders a 10x10 grid of buttons with row/column labels and updates them in place. */
export class BoardView {
  private readonly cells: HTMLButtonElement[] = [];
  private mouse: Coord | null = null;
  // Pointer presses are numbered; a click is attributed to the press that started it.
  private presses = 0;
  private clickPress = 0;
  private ignoreUpTo = 0;
  private pressType = '';
  private clickPressType = '';
  private drag: { pointerId: number; at: Coord } | null = null;

  constructor(
    readonly root: HTMLElement,
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
          this.pressType = e.pointerType;
          if (e.pointerType === 'mouse') return;
          this.mouse = null;
          if (!handlers.onTouchDown?.(coord)) return;
          // Suppresses the compat mouse events (and the focus they bring); the drag owns this pointer now.
          e.preventDefault();
          this.drag = { pointerId: e.pointerId, at: coord };
          cell.setPointerCapture?.(e.pointerId);
        });
        cell.addEventListener('click', (e) => this.click(coord, e.detail, handlers));
        cell.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse') return;
          this.mouse = coord;
          handlers.onHover?.(coord);
        });
        cell.addEventListener('focus', () => {
          if (!this.touchPress()) handlers.onHover?.(coord);
        });
        this.cells.push(cell);
        root.appendChild(cell);
      }
    }
    root.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.drag?.pointerId) return;
      e.preventDefault();
      const c = this.cellAtPoint(e.clientX, e.clientY);
      if (!c || (c.row === this.drag.at.row && c.col === this.drag.at.col)) return;
      this.drag.at = c;
      handlers.onTouchMove?.(c);
    });
    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== this.drag?.pointerId) return;
      this.drag = null;
      handlers.onTouchUp?.();
    };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
    // Belt and braces next to `touch-action: none`: a drag must never scroll or zoom the page.
    root.addEventListener('touchmove', (e) => this.drag && e.preventDefault(), { passive: false });
    // Keyboard focus after a touch press should move the preview again.
    document.addEventListener('keydown', () => (this.pressType = 'keyboard'));
    root.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.mouse = null;
      handlers.onHover?.(null);
    });
  }

  /** True while a finger (or pen) that pressed this board is still down and dragging. */
  get dragging(): boolean {
    return this.drag !== null;
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
    if (detail === 0) {
      this.presses++;
      this.pressType = 'keyboard';
    }
    // A click that repeats an earlier one (2nd click of a double-click/double-tap) belongs to that click's press.
    if (detail <= 1) {
      this.clickPress = this.presses;
      this.clickPressType = this.pressType;
    }
    if (this.clickPress <= this.ignoreUpTo) return;
    // Touch/pen presses are handled by onTouchDown; their (possibly repeated) clicks must not act again.
    if (handlers.onTouchDown && isTouch(this.clickPressType)) return;
    handlers.onClick?.(coord);
  }

  private touchPress(): boolean {
    return isTouch(this.pressType);
  }

  private cellAtPoint(x: number, y: number): Coord | null {
    const el = document.elementFromPoint(x, y)?.closest('.cell');
    const i = this.cells.indexOf(el as HTMLButtonElement);
    return i < 0 ? null : { row: Math.floor(i / BOARD_SIZE), col: i % BOARD_SIZE };
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

const isTouch = (pointerType: string) => pointerType === 'touch' || pointerType === 'pen';

function label(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'axis-label';
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
