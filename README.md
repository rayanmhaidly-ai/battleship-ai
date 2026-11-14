# Battleship vs AI

**▶ Play it: https://rayanmhaidly-ai.github.io/battleship-ai/**

Classic Battleship in the browser against an AI opponent. No install, no sign-up; works on desktop and mobile.

![A game in progress: your fleet on the left, enemy waters on the right](docs/screenshot.png)

## How it was built

I planned the project with [Devin](https://devin.ai), then had it delivered through reviewed pull requests ([#1](https://github.com/rayanmhaidly-ai/battleship-ai/pull/1)), each one tested in CI and browser-checked before merging. Every bug found along the way is written up in [BUGS.md](BUGS.md) with its symptom, root cause and fix.

Stack: Vite, TypeScript (no framework), Vitest, GitHub Actions, GitHub Pages.

## How the AI plays

The AI plays like a careful human, and it **can't cheat**: it never sees your board. After each shot it is told only "miss", "hit", or "sunk, length N", exactly what a human opponent would hear.

- **Hunting.** Until it finds a ship, it fires in a spread-out grid pattern instead of at random. While your smallest ship is a 2, a checkerboard is enough to guarantee hitting every ship, so it only needs half the board. As your small ships sink, it spreads its shots further apart. It also skips gaps too small for any remaining ship.
- **Targeting.** After a hit, it tries the neighbouring cells. Once two hits line up, it follows that line, and turns around when it reaches a miss or the edge.
- **Finishing the job.** When a ship sinks, it works out which of its hits belonged to that ship. Any leftover hits mean another ship is next to it, so it keeps going until that one sinks too.
- **Never wastes a shot** on a cell it has already tried.

It sinks the whole fleet in about 49 shots on average, against about 95 for random firing (measured over 5,000 simulated games). The code is in [`src/game/ai.ts`](src/game/ai.ts).

## Tests and CI

40 unit tests ([Vitest](https://vitest.dev)) in [`tests/`](tests/) cover:

- **Rules:** ship placement (no overlaps, nothing off the board), hits, misses, sinking, turn order and winning.
- **AI behaviour:** never repeats a shot (checked over 500 full games), averages under 65 shots, follows hits correctly and finishes off ships touching each other.
- **No cheating:** the AI code can't import the board, holds no reference to it, and replaying a game from shot results alone (no board at all) produces the same moves.

[GitHub Actions](.github/workflows/deploy.yml) runs the tests and a type-checked build on every pull request. Every merge to `main` deploys the site to GitHub Pages automatically.

## Run it locally

Requires Node.js 20+.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # run the unit tests
npm run build    # type-check and build into dist/
```

## Known limits

- **Single player only:** you against the AI. No multiplayer, accounts or saved stats.
- **One difficulty level.** The AI uses hunt/target logic, not a full probability model, so a stronger AI is possible.
- **No backend,** by design. The enemy fleet lives in your browser's memory, so someone stepping through the code in DevTools could find it. Casual console tricks are blocked (see [BUGS.md #5](BUGS.md#5-enemy-fleet-placement-could-be-rigged-from-the-browser-console)).
- **Fixed rules:** 10×10 board, standard five-ship fleet, one shot per turn.
