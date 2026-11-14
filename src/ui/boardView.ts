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
        cell.addEventListener('click', () => handlers.onClick?.(coord));
        cell.addEventListener('pointerenter', (e) => {
          if (e.pointerType === 'mouse') handlers.onHover?.(coord);
        });
        cell.addEventListener('focus', () => handlers.onHover?.(coord));
        this.cells.push(cell);
        root.appendChild(cell);
      }
    }
    root.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') handlers.onHover?.(null);
    });
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
