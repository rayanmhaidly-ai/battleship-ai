# battleship-ai

Classic Battleship in the browser against an AI opponent that hunts and targets your ships. It is a static site (Vite + TypeScript) with no backend.

**Play it:** https://rayanmhaidly-ai.github.io/battleship-ai/

## How to play

1. **Place your fleet.** You have five ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2).
   - Choose a ship in the picker, or let it move to the next one automatically. Hover over your board to preview the spot: green means the ship fits, red means it doesn't.
   - Click (or tap) to place it. Press **R** or the **Rotate** button to switch between horizontal and vertical.
   - Click a ship you've already placed to pick it up and move it.
   - **Randomize** places the rest of your fleet for you. **Clear** removes every ship.
   - Ships can't overlap or hang off the board.
2. **Start battle.** You fire first. Click a cell in *Enemy waters* to fire at it.
   - A dot means a miss, a flame means a hit, and a red X means a sunk ship. Once you sink an enemy ship, its outline is shown.
3. **The AI fires back** after a short pause (about 600 ms). Its latest shot on your board gets a pulsing yellow outline, and the status line tells you what happened.
4. Turns alternate until one fleet is sunk. A win or loss screen then shows how many shots it took, and **Play again** starts a new game. If you lose, the enemy's remaining ships are revealed.

The layout adapts to the screen. On desktop the two boards sit side by side. On phones they stack, with the board you're firing at on top. Every control works with touch, so the R key isn't needed.

## Run it locally

Requires Node.js 20+ (CI uses 22).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Run the tests

```bash
npm test           # run the unit tests once
npm run test:watch # re-run on change
```

The [Vitest](https://vitest.dev) suites in `tests/` cover:

- **Placement:** ships going off the board, overlaps, placing the same ship twice, moving a ship, and random fleets that are always legal.
- **Hits and sinking:** hit, miss and sunk results, and firing at the same cell twice is rejected.
- **Winning:** a game is won only when every ship is sunk; turns alternate; the game ends in a win or a loss.
- **AI behaviour:**
  - It never fires at the same cell twice (checked over 500 full games). It averages fewer than 65 shots per game.
  - Hunt shots follow the checkerboard pattern, and the spacing widens as small ships are sunk.
  - After a hit, the next shot is next to it. After two hits in a line, it follows that line. It turns around at a miss or the board edge, and goes back to hunting once the ship sinks.
  - It finishes off neighbouring ships and copes with ships packed side by side.
- **AI isolation:** proof that the AI never sees your ship positions (see below).

## AI strategy

The AI is in `src/game/ai.ts`. It plays like a strong human player: it **hunts** until it scores a hit, then **targets** that ship until it sinks.

### It only knows what a human opponent would

The AI never sees the board. After each shot it is told only `miss`, `hit`, or `sunk` plus the length of the sunk ship, just like hearing "you sank my Cruiser." `Game.aiFire()` converts each board result into this report with `toReport()`. The tests check this in four ways:

- `ai.ts` imports only `./types` and `./random`, never the board module.
- After a full game, nothing reachable from the AI object is a `Board`.
- Every report the AI receives has only the keys `result` (and `sunkLength` when a ship sinks).
- Replaying a game with a fresh AI, feeding it only the recorded reports and no board at all, produces exactly the same shots.

### Hunt mode: spacing that adapts to the fleet

While it has no unresolved hits, the AI fires only at cells where `(row + col - offset) % k == 0`. `k` is the length of the **smallest enemy ship still afloat**, and `offset` is chosen at random each game so the pattern can't be predicted.

- With the Destroyer (2) still afloat, `k = 2`, which is a checkerboard. Every ship covers at least one of these cells, so the AI only needs half the board to find them all.
- Once the Destroyer is sunk, `k = 3`, so hunt shots are spaced 3 apart (a third of the board). If both 3-length ships are then sunk, `k = 4`, and so on.
- The AI also skips pattern cells where the smallest remaining ship can't fit, such as gaps boxed in by misses or sunk ships.
- It picks randomly among the remaining candidates. If no pattern cells are left (rare), it falls back to any cell that could still hold a ship, then to any untried cell.

### Target mode: follow the ship until it sinks

The AI works out its next target from the hits it has recorded, so it doesn't need to remember a plan between turns:

1. **Following a line.** If a hit has an adjacent hit, the ship's direction is known. The AI fires at the next untried cell at either end of that line, starting at the end nearest its most recent hit. When that end is blocked by a miss, the board edge or a sunk ship, it goes to the other end.
2. **Single hit.** It fires at an untried neighbouring cell. It prefers directions with more open water, and skips directions where the smallest remaining ship couldn't fit.
3. **Working out what sank.** The AI learns only the length of a sunk ship, so it infers which of its hits belonged to that ship: a straight run of hits of that length through the final shot, preferring runs that end on it. Those cells are marked as sunk. Any other hits stay open, so a neighbouring ship it hit along the way still gets finished off.
4. When no open hits remain, it goes back to hunt mode.

### Never the same cell twice

The AI records every cell it has fired at. It only ever picks from untried cells, checks every shot again before returning it, and rejects a second result for the same cell. The tests play hundreds of full games to confirm this.

## Project layout

```
src/
  game/          # pure game logic, no DOM
    types.ts     # Coord, ShipSpec, ShotOutcome, board size
    fleet.ts     # the 5-ship fleet
    board.ts     # placement validation, firing, hit/sunk/win detection
    placement.ts # random fleet placement
    random.ts    # seedable RNG helpers
    ai.ts        # the AI opponent
    game.ts      # turn/phase state machine
  ui/boardView.ts
  main.ts        # wires the UI to the game
  style.css
tests/           # Vitest unit tests
BUGS.md          # bugs found during development: symptom, root cause, fix
```

## Deployment

`.github/workflows/deploy.yml` runs the tests and builds the site on every pull request. On every push to `main` it does the same, then deploys `dist/` to GitHub Pages.

Pages must be enabled once, under **Settings → Pages → Source: GitHub Actions**. The production build sets `GITHUB_PAGES=true`, which makes Vite use the `/battleship-ai/` base path.
