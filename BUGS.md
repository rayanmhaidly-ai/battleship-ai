# Bug log

Every bug found while building and testing the game, with its symptom, root cause and fix.

## 1. Test wrongly expected the AI to never fire into a boxed-in corner

- **Symptom:** The unit test `skips cells where the smallest remaining ship cannot fit` failed: the AI fired at the boxed-in corner cell on its 43rd shot. The test expected that never to happen before shot 90.
- **Root cause:** The bug was in the test, not the AI. With spacing 3, every 3-cell segment on the board contains at least one hunt-pattern cell. Once all ~33 hunt-pattern cells have been fired at and missed, no length-3 ship fits anywhere. At that point the AI correctly falls back to any unknown cell, and the corner is one of them.
- **Fix:** The test now checks only the first 25 shots, while hunt-pattern cells that could still hold a ship remain. The fallback behaviour is intentional and is documented in `pickHunt`.

## 2. "Neighbouring ship" test never actually exercised adjacent ships

- **Symptom:** The test `finishes off a neighbouring ship that it hit while sinking another` failed. The AI went back to hunt mode before the second ship was sunk.
- **Root cause:** A test scenario bug. The AI's first probe after hitting the destroyer went along the destroyer, sank it, and returned to hunt mode (correctly, since it had no hits left to follow up). It never hit the cruiser underneath, so the scenario it was meant to test never happened.
- **Fix:** The test now feeds the AI a hit on the destroyer, then a hit on the cruiser directly below it, which looks like a single vertical ship. It then asserts that the AI stays in target mode until both ships are sunk, over 50 random seeds.

## 3. Type-check failed after a move changed the game phase

- **Symptom:** `npm run build` failed with `TS2367: This comparison appears to be unintentional because the types '"player-turn"' and '"ai-turn"' have no overlap` in `src/main.ts`.
- **Root cause:** `onEnemyBoardClick` first checks `game.phase !== 'player-turn'`, so TypeScript narrows `game.phase` to `'player-turn'`. It doesn't know that `game.playerFire()` then changes the phase, so it flagged the later `game.phase === 'ai-turn'` / `'won'` checks as impossible. `aiTurn` had the same problem. A local variable annotated as `Phase` didn't help, because TypeScript narrows on assignment too.
- **Fix:** Added a small `currentPhase(): Phase` helper. Reading the phase through a function call gives back the full `Phase` type after each move.

## 4. After a defeat, the revealed enemy fleet couldn't be inspected

- **Symptom:** Found during browser testing. After losing, the enemy's surviving ships were drawn on the board, but the win/loss dialog darkened and blurred the whole board and covered the middle cells. Escape and clicking the backdrop did nothing, and the dialog's only button, **Play again**, wiped the board. This was worst on mobile.
- **Root cause:** `showResult()` always opened a full-screen overlay with `backdrop-filter: blur(3px)`, and nothing could close it except starting a new game.
- **Fix:** The dialog now has a **View board** button, and Escape or clicking the backdrop also closes it. A game-over bar with the result and its own **Play again** button stays above the boards, so you can look over the final board and then start a new game.

## 5. Enemy fleet placement could be rigged from the browser console

- **Symptom:** Found in a security audit of the production build. Typing `Math.random = () => 0` in the browser console and then pressing **Play again** gave an enemy fleet whose layout was fully predictable. A player could work out every ship position without firing a shot. (The AI's choices could be rigged the same way.)
- **Root cause:** `Game` and `BattleshipAI` used `Math.random` as their default random source and looked it up on every call. Pages can't make built-in globals read-only, so a player could replace it with any function they liked.
- **Fix:** `src/game/random.ts` now exports `defaultRng`. It keeps references to `crypto.getRandomValues` (or `Math.random` if that isn't available) that it grabs when the module first loads, so replacing either one from the console later does nothing. `Game` and `BattleshipAI` use it by default. A new test replaces `Math.random` and checks that new games ignore it. `vite.config.ts` now sets `build.sourcemap: false` explicitly, so readable source is never shipped.
- **Audit of the rebuilt production build, which passed:** loaded it from `vite preview` in Chrome, randomized the fleet and started a battle. Results: no new properties on `window`; enemy cells only expose `cell`/`target` classes, `aria-label="unknown"` and `data-row`/`data-col`; localStorage, sessionStorage and cookies are all empty; no source map is published; `import('/battleship-ai/src/game/game.ts')` fails because only the bundled module is served. The game code runs inside that one module and exports nothing, so the console has no handle on the game state. During earlier testing the enemy positions were read by importing `/src/game/game.ts` from the Vite **dev** server, and that only works on the dev server.
- **Limit:** the game is static, so the enemy fleet has to live in the browser's memory. Someone stepping through the script with the DevTools debugger can still find it. Only a server could prevent that, and the brief rules out a backend.
