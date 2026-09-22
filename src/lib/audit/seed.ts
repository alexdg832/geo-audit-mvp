/**
 * Deterministic pseudo-random generation from a string seed, so the same
 * business name always produces the same mock mentions/scores.
 */

function hashStringToSeed(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom {
  private rng: () => number;

  constructor(seedInput: string) {
    this.rng = mulberry32(hashStringToSeed(seedInput));
  }

  next(): number {
    return this.rng();
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  bool(probabilityTrue = 0.5): boolean {
    return this.next() < probabilityTrue;
  }

  pick<T>(items: T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  /** Picks `count` distinct items (or fewer if the pool is smaller). */
  pickMany<T>(items: T[], count: number): T[] {
    const pool = [...items];
    const result: T[] = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
      const idx = this.int(0, pool.length - 1);
      result.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return result;
  }
}
