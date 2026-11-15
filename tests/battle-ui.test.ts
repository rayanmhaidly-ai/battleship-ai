// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '../src/game/game';
import { formatCoord, type Coord } from '../src/game/types';

const games = vi.hoisted(() => [] as Game[]);
vi.mock('../src/game/game', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/game/game')>();
  class TrackedGame extends mod.Game {
    constructor(...args: ConstructorParameters<typeof mod.Game>) {
      super(...args);
      games.push(this);
    }
  }
  return { ...mod, Game: TrackedGame };
});

const AI_DELAY_MS = 600;
const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

const $ = (id: string) => document.getElementById(id)!;
const game = () => games[games.length - 1];
const phase = () => $('app').dataset.phase;
const dialogOpen = () => !$('confirm-overlay').hidden;
const boardCells = (id: string) => [...document.querySelectorAll<HTMLButtonElement>(`#${id} .cell`)];
const marked = (id: string, cls: string) => boardCells(id).filter((c) => c.classList.contains(cls)).length;
const boardSnapshot = (id: string) => boardCells(id).map((c) => `${c.getAttribute('aria-label')} ${c.className}`);

function fireAt(c: Coord): void {
  const label = formatCoord(c);
  boardCells('enemy-board').find((b) => b.getAttribute('aria-label')!.startsWith(`${label}:`))!.click();
}

function startBattle(): void {
  $('randomize').click();
  $('start').click();
}

beforeEach(async () => {
  vi.useFakeTimers();
  games.length = 0;
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
  vi.resetModules();
  await import('../src/main');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('restart button', () => {
  it('is only offered once battle has started', () => {
    expect($('restart').closest<HTMLElement>('[hidden]')).not.toBeNull();
    startBattle();
    expect($('restart').closest<HTMLElement>('[hidden]')).toBeNull();
  });

  it('opens an in-page dialog instead of a browser confirm()', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    startBattle();
    $('restart').click();
    expect(dialogOpen()).toBe(true);
    expect($('confirm-title').textContent).toBe('Restart the game?');
    expect($('confirm-detail').textContent).toBe('Your current progress will be lost.');
    expect($('confirm-cancel').textContent).toBe('Cancel');
    expect($('confirm-restart').textContent).toBe('Restart');
    expect(document.activeElement).toBe($('confirm-cancel'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('Restart, clicked while the AI is mid-turn, returns to setup with a fresh enemy fleet and no AI shot lands', () => {
    startBattle();
    const first = game();
    fireAt({ row: 0, col: 0 });
    expect(phase()).toBe('ai-turn');

    $('restart').click();
    vi.advanceTimersByTime(5 * AI_DELAY_MS);
    expect(first.playerBoard.shotCount).toBe(0);

    $('confirm-restart').click();
    vi.advanceTimersByTime(5 * AI_DELAY_MS);
    expect(first.playerBoard.shotCount).toBe(0);
    expect(dialogOpen()).toBe(false);
    expect(phase()).toBe('placing');
    expect($('placement').hidden).toBe(false);
    expect($('battle-bar').hidden).toBe(true);
    expect(($('start') as HTMLButtonElement).disabled).toBe(true);
    expect(marked('player-board', 'ship')).toBe(0);

    expect(games).toHaveLength(2);
    expect(game().enemyBoard).not.toBe(first.enemyBoard);
    expect(game().enemyBoard.placedShips).toHaveLength(5);
    expect(game().enemyBoard.shotCount).toBe(0);
    expect(game().playerBoard.shotCount).toBe(0);
  });

  it('Cancel returns to the game exactly as it was, and a paused AI turn then goes ahead', () => {
    startBattle();
    fireAt({ row: 4, col: 4 });
    expect(phase()).toBe('ai-turn');
    const before = {
      status: $('status').textContent,
      player: boardSnapshot('player-board'),
      enemy: boardSnapshot('enemy-board'),
    };

    $('restart').click();
    vi.advanceTimersByTime(5 * AI_DELAY_MS);
    $('confirm-cancel').click();

    expect(dialogOpen()).toBe(false);
    expect(phase()).toBe('ai-turn');
    expect(games).toHaveLength(1);
    expect({
      status: $('status').textContent,
      player: boardSnapshot('player-board'),
      enemy: boardSnapshot('enemy-board'),
    }).toEqual(before);
    expect(document.activeElement).toBe($('restart'));

    vi.advanceTimersByTime(AI_DELAY_MS);
    expect(phase()).toBe('player-turn');
    expect(game().playerBoard.shotCount).toBe(1);
  });

  it('treats Esc and a click outside the dialog as Cancel, but not a click inside it', () => {
    startBattle();
    const snapshot = () => [phase(), boardSnapshot('player-board'), boardSnapshot('enemy-board')];
    const before = snapshot();

    $('restart').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dialogOpen()).toBe(false);

    $('restart').click();
    $('confirm-title').click();
    expect(dialogOpen()).toBe(true);
    $('confirm-overlay').click();
    expect(dialogOpen()).toBe(false);

    expect(games).toHaveLength(1);
    expect(snapshot()).toEqual(before);
  });

  it('blocks shots at the enemy board while the dialog is open', () => {
    startBattle();
    $('restart').click();
    fireAt({ row: 2, col: 2 });
    expect(game().enemyBoard.shotCount).toBe(0);
    expect(phase()).toBe('player-turn');
  });
});
