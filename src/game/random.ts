export type Rng = () => number;

// Captured when the module loads, so a player who later replaces Math.random or
// crypto.getRandomValues from the console cannot rig or predict new games.
const cryptoSource: Crypto | undefined = globalThis.crypto;
const fillRandom = cryptoSource?.getRandomValues?.bind(cryptoSource);
const nativeRandom = Math.random;
const buffer = new Uint32Array(1);

export const defaultRng: Rng = () => {
  if (!fillRandom) return nativeRandom();
  fillRandom(buffer);
  return buffer[0] / 4294967296;
};

/** Small seedable PRNG so games and tests can be reproduced. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
