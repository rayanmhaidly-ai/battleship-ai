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
const stat = (who: 'player' | 'ai', name: 'shots' | 'hits' | 'accuracy') =>
  $(`score-${who}`).querySelector(`[data-stat="${name}"]`)!.textContent;
const score = (who: 'player' | 'ai') => [stat(who, 'shots'), stat(who, 'hits'), stat(who, 'accuracy')];

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

describe('score counter', () => {
  it('is hidden during setup and starts at zero for both sides', () => {
    expect($('battle-bar').hidden).toBe(true);
    startBattle();
    expect($('battle-bar').hidden).toBe(false);
    expect(score('player')).toEqual(['0', '0', '0%']);
    expect(score('ai')).toEqual(['0', '0', '0%']);
  });

  it("updates shots, hits and accuracy for you and the AI after every shot", () => {
    startBattle();
    const shipCells = game().enemyBoard.placedShips.flatMap((s) => s.cells);
    const water = boardCells('enemy-board')
      .map((_, i) => ({ row: Math.floor(i / 10), col: i % 10 }))
      .filter((c) => !game().enemyBoard.shipAt(c));
    for (let round = 1; round <= 6; round++) {
      fireAt(round % 3 === 0 ? water[round] : shipCells[round]);
      const hits = marked('enemy-board', 'hit');
      expect(score('player')).toEqual([String(round), String(hits), `${Math.round((hits / round) * 100)}%`]);
      // The AI hasn't fired yet this round.
      expect(stat('ai', 'shots')).toBe(String(round - 1));

      vi.advanceTimersByTime(AI_DELAY_MS);
      const aiHits = marked('player-board', 'hit');
      expect(score('ai')).toEqual([String(round), String(aiHits), `${Math.round((aiHits / round) * 100)}%`]);
      expect(score('ai')).toEqual(Object.values(game().stats('ai')).map((v, i) => (i === 2 ? `${v}%` : String(v))));
    }
    expect(score('player')).toEqual(['6', '4', '67%']);
  });
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

    startBattle();
    expect(score('player')).toEqual(['0', '0', '0%']);
    expect(score('ai')).toEqual(['0', '0', '0%']);
  });

  it('Cancel returns to the game exactly as it was, and a paused AI turn then goes ahead', () => {
    startBattle();
    fireAt({ row: 4, col: 4 });
    expect(phase()).toBe('ai-turn');
    const before = {
      status: $('status').textContent,
      player: boardSnapshot('player-board'),
      enemy: boardSnapshot('enemy-board'),
      score: [score('player'), score('ai')],
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
      score: [score('player'), score('ai')],
    }).toEqual(before);
    expect(document.activeElement).toBe($('restart'));

    vi.advanceTimersByTime(AI_DELAY_MS);
    expect(phase()).toBe('player-turn');
    expect(stat('ai', 'shots')).toBe('1');
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
