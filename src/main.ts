import './style.css';
import { shipCells, type PlacedShip } from './game/board';
import { Game, type Phase, type ShotEvent } from './game/game';
import { firstFreeSpot, heldShipOrigin } from './game/placement';
import { formatCoord, type Coord, type Orientation, type ShipSpec } from './game/types';
import { BoardView, type CellView } from './ui/boardView';

const AI_DELAY_MS = 600;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $('app');
const statusEl = $('status');
const placementEl = $('placement');
const shipPicker = $('ship-picker');
const startBtn = $<HTMLButtonElement>('start');
const overlay = $('overlay');
const resultTitle = $('result-title');
const resultDetail = $('result-detail');
const playAgainBtn = $<HTMLButtonElement>('play-again');
const gameOverBar = $('game-over-bar');
const gameOverText = $('game-over-text');

let game: Game;
let orientation: Orientation = 'horizontal';
let selectedId: string | null = null;
// Which cell of the selected ship sits under the cursor (0 = bow).
let grabIndex = 0;
let hover: Coord | null = null;
// Touch/pen flow: true while the selected ship sits where a finger put it. It stays movable until it is
// locked by tapping a ship in the tray (or Start battle, for the last one).
let touchHeld = false;
let lastPointerType = '';
document.addEventListener('pointerdown', (e) => (lastPointerType = e.pointerType), true);
const usingTouch = () => lastPointerType === 'touch' || lastPointerType === 'pen';
let aiTimer: ReturnType<typeof setTimeout> | undefined;
let playerMessage = '';
let enemyMessage = '';

const playerView = new BoardView($('player-board'), {
  onClick: onPlayerBoardClick,
  onHover: (c) => {
    hover = c;
    if (game.phase === 'placing') render();
  },
  onTouchDown: onPlayerBoardTouch,
  onTouchMove: (c) => {
    if (!touchHeld) return;
    hover = c;
    touchMessage();
    render();
  },
  onTouchUp: () => {
    touchMessage();
    render();
  },
});
const enemyView = new BoardView($('enemy-board'), { onClick: onEnemyBoardClick });

function newGame(): void {
  clearTimeout(aiTimer);
  aiTimer = undefined;
  game = new Game();
  orientation = 'horizontal';
  selectNextShip();
  playerMessage = 'Place your ships: pick one, then click your board. Press R or tap Rotate to turn it.';
  enemyMessage = '';
  overlay.hidden = true;
  render();
}

// Read through a function so TypeScript doesn't keep a stale narrowed type after a move changes the phase.
function currentPhase(): Phase {
  return game.phase;
}

function selectedShip(): ShipSpec | undefined {
  return game.unplacedShips().find((s) => s.id === selectedId);
}

function selectNextShip(): void {
  selectShip(game.unplacedShips()[0]?.id ?? null);
}

// Starts the preview under the mouse cursor if it is on the board. Otherwise (touch screens have no cursor)
// it starts on the first free spot, so it never sits on another ship.
// With touch the ship stays off the board until a finger puts it there.
function selectShip(id: string | null): void {
  selectedId = id;
  grabIndex = 0;
  touchHeld = false;
  if (usingTouch()) {
    hover = null;
    return;
  }
  const ship = selectedShip();
  if (ship && playerView.mouseCell) {
    hover = playerView.mouseCell;
    return;
  }
  const spot = ship ? firstFreeSpot(game.playerBoard, ship, orientation) : null;
  hover = spot?.origin ?? null;
  if (spot) orientation = spot.orientation;
}

function heldOrigin(ship: ShipSpec, cursor: Coord): Coord {
  return heldShipOrigin(cursor, ship.length, orientation, grabIndex, game.playerBoard.size);
}

function onPlayerBoardClick(c: Coord): void {
  if (game.phase !== 'placing') return;
  const existing = game.playerBoard.shipAt(c);
  const ship = selectedShip();
  if (existing && !ship) {
    pickUp(existing, c);
  } else if (ship) {
    const error = game.placePlayerShip(ship, heldOrigin(ship, c), orientation);
    if (error) {
      hover = c;
      playerMessage =
        error === 'out-of-bounds'
          ? `The ${ship.name} doesn't fit there. Try another cell or rotate.`
          : `The ${ship.name} would overlap another ship. Pick a green spot.`;
    } else {
      playerView.ignoreEarlierPresses();
      selectNextShip();
      playerMessage = selectedId
        ? `${ship.name} placed. Next: ${selectedShip()!.name}.`
        : 'Fleet ready. Press Start battle, or click a ship to move it.';
    }
  }
  render();
}

function onPlayerBoardTouch(c: Coord): boolean {
  if (game.phase !== 'placing') return false;
  const ship = selectedShip();
  if (ship && touchHeld && hover) {
    // Touching the held ship regrabs it at that cell so it doesn't jump; anywhere else moves it there.
    const i = shipCells(heldOrigin(ship, hover), ship.length, orientation).findIndex((s) => same(s, c));
    if (i >= 0) grabIndex = i;
    hover = c;
  } else {
    const existing = game.playerBoard.shipAt(c);
    if (existing) pickUp(existing, c);
    else if (ship) {
      grabIndex = 0;
      hover = c;
    } else return false;
  }
  touchHeld = true;
  touchMessage();
  render();
  return true;
}

function touchMessage(): void {
  const ship = selectedShip();
  if (!ship || !touchHeld) return;
  const lockHow =
    game.unplacedShips().length === 1
      ? 'press Start battle (or tap it in the tray) to lock it'
      : 'tap the next ship in the tray to lock it';
  playerMessage = previewCells()?.valid
    ? `Drag the ${ship.name} or tap another square. Then ${lockHow}.`
    : `The ${ship.name} can't go there. Drag it to a green spot.`;
}

// Locks the ship a finger placed. Returns false, and leaves it held, if it sits on a red spot.
function lockTouchHeld(): boolean {
  const ship = selectedShip();
  if (!touchHeld || !ship || !hover) return true;
  if (game.placePlayerShip(ship, heldOrigin(ship, hover), orientation)) {
    playerMessage = `The ${ship.name} is on a red spot. Drag it to a green spot first.`;
    return false;
  }
  playerView.ignoreEarlierPresses();
  touchHeld = false;
  selectedId = null;
  hover = null;
  return true;
}

function canLockLastAndStart(): boolean {
  return touchHeld && game.unplacedShips().length === 1 && !!previewCells()?.valid;
}

function onTrayTouch(spec: ShipSpec): void {
  const current = selectedShip();
  if (current && touchHeld) {
    if (!lockTouchHeld()) return;
    if (current.id === spec.id) {
      selectNextShip();
      playerMessage = selectedId
        ? `${current.name} locked. Next: touch your board where the ${selectedShip()!.name} should go.`
        : 'Fleet ready. Press Start battle, or touch a ship to move it.';
      return;
    }
    playerMessage = `${current.name} locked. `;
  } else if (current?.id === spec.id) {
    // Already selected (or a repeated tap): just take it off the board until a finger puts it down.
    hover = null;
    return;
  } else {
    playerMessage = '';
  }
  const placed = game.playerBoard.placedShips.find((s) => s.spec.id === spec.id);
  if (placed) {
    // It stays where it is, held, so it can be dragged or moved with a tap.
    pickUp(placed, placed.cells[0]);
    touchHeld = true;
    touchMessage();
  } else {
    selectShip(spec.id);
    playerMessage += `Touch your board where the ${spec.name} should go.`;
  }
}

function pickUp(ship: PlacedShip, c: Coord): void {
  game.removePlayerShip(ship.spec.id);
  selectedId = ship.spec.id;
  orientation = ship.orientation;
  grabIndex = Math.max(0, ship.cells.findIndex((s) => same(s, c)));
  hover = c;
  playerMessage = `Moving the ${ship.spec.name}. Click to drop it somewhere else.`;
}

function rotate(): void {
  if (game.phase !== 'placing') return;
  orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
  render();
}

function onEnemyBoardClick(c: Coord): void {
  if (game.phase !== 'player-turn') return;
  const event = game.playerFire(c);
  if (!event) {
    playerMessage = `You already fired at ${formatCoord(c)}. Pick another cell.`;
    render();
    return;
  }
  const phase = currentPhase();
  playerMessage = describe(event);
  enemyMessage = phase === 'ai-turn' ? 'Enemy is aiming…' : '';
  render();
  if (phase === 'won') return showResult();
  aiTimer = setTimeout(aiTurn, AI_DELAY_MS);
}

function aiTurn(): void {
  aiTimer = undefined;
  if (game.phase !== 'ai-turn') return;
  const event = game.aiFire();
  const phase = currentPhase();
  enemyMessage = describe(event) + (phase === 'player-turn' ? ' Your turn.' : '');
  render();
  if (phase === 'lost') showResult();
}

function describe(event: ShotEvent): string {
  const at = formatCoord(event.coord);
  const who = event.by === 'player' ? 'You' : 'Enemy';
  switch (event.outcome.result) {
    case 'miss':
      return `${who} fired at ${at}: miss.`;
    case 'hit':
      return `${who} fired at ${at}: hit!`;
    case 'sunk':
      return event.by === 'player'
        ? `You fired at ${at} and sank the enemy ${event.outcome.ship.name}!`
        : `Enemy fired at ${at} and sank your ${event.outcome.ship.name}!`;
  }
}

function showResult(): void {
  const won = game.phase === 'won';
  resultTitle.textContent = won ? 'Victory!' : 'Defeat';
  resultDetail.textContent = won
    ? `You sank the enemy fleet in ${game.enemyBoard.shotCount} shots.`
    : `The AI sank your fleet in ${game.playerBoard.shotCount} shots. Its remaining ships are now revealed.`;
  overlay.dataset.result = won ? 'won' : 'lost';
  gameOverText.textContent = won ? 'Victory! You sank the enemy fleet.' : 'Defeat. The enemy\'s surviving ships are outlined.';
  gameOverBar.dataset.result = overlay.dataset.result;
  render();
  overlay.hidden = false;
  playAgainBtn.focus();
}

function hideResult(): void {
  if (overlay.hidden) return;
  overlay.hidden = true;
  $('play-again-bar').focus();
}

function shipShapeClasses(ship: PlacedShip, c: Coord): string[] {
  const index = ship.cells.findIndex((s) => s.row === c.row && s.col === c.col);
  const dir = ship.orientation === 'horizontal' ? 'h' : 'v';
  const classes = [`ship-${dir}`];
  if (index === 0) classes.push('ship-start');
  if (index === ship.cells.length - 1) classes.push('ship-end');
  return classes;
}

function previewCells(): { keys: Set<string>; valid: boolean } | null {
  const ship = selectedShip();
  if (game.phase !== 'placing' || !ship || !hover) return null;
  const origin = heldOrigin(ship, hover);
  const valid = game.playerBoard.canPlace(ship, origin, orientation);
  const keys = new Set(shipCells(origin, ship.length, orientation).map((c) => `${c.row},${c.col}`));
  return { keys, valid };
}

const same = (a: Coord | undefined, b: Coord) => !!a && a.row === b.row && a.col === b.col;

function playerCell(c: Coord, preview: ReturnType<typeof previewCells>): CellView {
  const classes: string[] = [];
  const ship = game.playerBoard.shipAt(c);
  const shot = game.playerBoard.shotAt(c);
  let label = 'water';
  if (ship) {
    classes.push('ship', ...shipShapeClasses(ship, c));
    label = ship.spec.name;
  }
  if (shot === 'hit') classes.push('hit');
  if (shot === 'miss') classes.push('miss');
  if (ship?.sunk) classes.push('sunk');
  if (shot) label += shot === 'hit' ? (ship?.sunk ? ', sunk' : ', hit') : ', miss';
  if (same(game.lastAiShot?.coord, c)) classes.push('last-shot');
  if (preview?.keys.has(`${c.row},${c.col}`)) classes.push(preview.valid ? 'preview' : 'preview-invalid');
  return { classes, label, disabled: game.phase !== 'placing' };
}

function enemyCell(c: Coord): CellView {
  const classes: string[] = [];
  const shot = game.enemyBoard.shotAt(c);
  const ship = game.enemyBoard.shipAt(c);
  const over = game.phase === 'won' || game.phase === 'lost';
  let label = 'unknown';
  if (shot === 'miss') {
    classes.push('miss');
    label = 'miss';
  } else if (shot === 'hit') {
    classes.push('hit');
    label = 'hit';
    if (ship?.sunk) {
      classes.push('sunk', 'ship', ...shipShapeClasses(ship, c));
      label = `sunk ${ship.spec.name}`;
    }
  } else if (over && ship) {
    classes.push('ship', 'revealed', ...shipShapeClasses(ship, c));
    label = ship.spec.name;
  }
  if (same(game.lastPlayerShot?.coord, c)) classes.push('last-shot', 'last-shot-player');
  const disabled = game.phase !== 'player-turn' || !!shot;
  if (!disabled) classes.push('target');
  return { classes, label, disabled };
}

function renderFleet(listId: string, ships: readonly PlacedShip[], fleet: readonly ShipSpec[], hideIntact: boolean): void {
  const list = $(listId);
  list.replaceChildren(
    ...fleet.map((spec) => {
      const placed = ships.find((s) => s.spec.id === spec.id);
      const sunk = !!placed?.sunk;
      const li = document.createElement('li');
      li.className = sunk ? 'sunk' : '';
      const hits = hideIntact ? (sunk ? spec.length : 0) : placed?.hits ?? 0;
      li.innerHTML = `<span class="name">${spec.name}</span><span class="pips">${Array.from(
        { length: spec.length },
        (_, i) => `<i class="${i < hits ? 'pip hit' : 'pip'}"></i>`,
      ).join('')}</span>`;
      li.setAttribute('aria-label', `${spec.name}${sunk ? ' (sunk)' : ''}`);
      return li;
    }),
  );
}

function renderShipPicker(): void {
  const unplaced = new Set(game.unplacedShips().map((s) => s.id));
  shipPicker.replaceChildren(
    ...game.fleet.map((spec) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ship-option';
      btn.setAttribute('role', 'option');
      const placed = !unplaced.has(spec.id);
      btn.classList.toggle('placed', placed);
      btn.classList.toggle('selected', spec.id === selectedId);
      btn.setAttribute('aria-selected', String(spec.id === selectedId));
      btn.innerHTML = `<span class="name">${spec.name}</span><span class="pips">${'<i class="pip"></i>'.repeat(spec.length)}</span>`;
      btn.addEventListener('click', () => {
        if (usingTouch()) {
          onTrayTouch(spec);
        } else if (placed) {
          const ship = game.playerBoard.placedShips.find((s) => s.spec.id === spec.id)!;
          pickUp(ship, ship.cells[0]);
          hover = null;
        } else {
          selectShip(spec.id);
          playerMessage = `Placing the ${spec.name} (${spec.length} cells).`;
        }
        render();
      });
      return btn;
    }),
  );
}

function render(): void {
  const phase = game.phase;
  app.dataset.phase = phase;
  app.classList.toggle('placing', phase === 'placing');
  app.classList.toggle('battle', phase !== 'placing');
  placementEl.hidden = phase !== 'placing';
  gameOverBar.hidden = phase !== 'won' && phase !== 'lost';
  startBtn.disabled = !game.canStart() && !canLockLastAndStart();
  // During placement a finger on the board drags ships, so it must not scroll or zoom the page.
  playerView.root.classList.toggle('no-touch-scroll', phase === 'placing');
  $('rotate').innerHTML = `Rotate <kbd>R</kbd> <span class="orientation">${orientation === 'horizontal' ? '↔' : '↕'}</span>`;

  statusEl.replaceChildren(
    ...[playerMessage, enemyMessage]
      .filter(Boolean)
      .map((text) => Object.assign(document.createElement('span'), { textContent: text })),
  );

  if (phase === 'placing') renderShipPicker();
  const preview = previewCells();
  playerView.update((c) => playerCell(c, preview));
  enemyView.update(enemyCell);
  playerView.setActive(phase === 'placing' || phase === 'ai-turn');
  enemyView.setActive(phase === 'player-turn');
  renderFleet('player-fleet', game.playerBoard.placedShips, game.fleet, false);
  renderFleet('enemy-fleet', game.enemyBoard.placedShips, game.fleet, true);
}

// A second finger on Rotate while the first drags a ship: browsers send no click for it, so rotate on the press.
let rotatedOnPress = false;
$('rotate').addEventListener('pointerdown', (e) => {
  rotatedOnPress = e.pointerType !== 'mouse' && playerView.dragging;
  if (rotatedOnPress) rotate();
});
$('rotate').addEventListener('click', () => {
  if (!rotatedOnPress) rotate();
  rotatedOnPress = false;
});
$('randomize').addEventListener('click', () => {
  game.randomizePlayerFleet();
  selectedId = null;
  touchHeld = false;
  playerMessage = 'Fleet placed at random. Click a ship to move it, or press Start battle.';
  render();
});
$('reset').addEventListener('click', () => {
  game.resetPlayerFleet();
  selectNextShip();
  playerMessage = 'Board cleared. Place your ships.';
  render();
});
startBtn.addEventListener('click', () => {
  if (canLockLastAndStart()) lockTouchHeld();
  if (!game.canStart()) return;
  game.start();
  hover = null;
  touchHeld = false;
  playerMessage = 'Battle stations! Fire at the enemy waters.';
  enemyMessage = '';
  render();
});
playAgainBtn.addEventListener('click', newGame);
$('play-again-bar').addEventListener('click', newGame);
$('view-board').addEventListener('click', hideResult);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) hideResult();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideResult();
  if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) rotate();
});

newGame();
