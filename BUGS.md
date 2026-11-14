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
