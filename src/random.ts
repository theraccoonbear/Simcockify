/** 32-bit string hash (Java-style), used to turn a seed into PRNG state. */
export function hashCode(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0; // convert to 32-bit integer
	}
	return hash;
}

const MASK = 0xffffffff;

/**
 * Creates a repeatable multiply-with-carry PRNG. Returns a function yielding
 * numbers in [0, 1). With no seed, a random one is chosen.
 */
export function createRandom(seed?: number | string): () => number {
	let w = hashCode(String(seed === undefined ? Math.random() : seed));
	let z = 987654321;
	return () => {
		z = (36969 * (z & 65535) + (z >> 16)) & MASK;
		w = (18000 * (w & 65535) + (w >> 16)) & MASK;
		const result = ((z << 16) + w) & MASK;
		return result / 4294967296 + 0.5;
	};
}

/** 32-bit avalanche mix (the MurmurHash3 finaliser). */
function fmix32(h: number): number {
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return h | 0;
}

/**
 * The same multiply-with-carry generator as `createRandom`, but with both
 * state words derived from a mixed hash of the seed. `createRandom` keeps
 * `z` fixed and uses the plain string hash for `w`, so similar seeds ("1",
 * "2", "a", "b") give strongly correlated streams; this variant does not.
 * Used by the word engine; the classic engine keeps `createRandom` so old
 * seeds reproduce.
 */
export function createSeededRandom(seed?: number | string): () => number {
	const h = hashCode(String(seed === undefined ? Math.random() : seed));
	let w = fmix32(h) || 1;
	let z = fmix32(h ^ 0x9e3779b9) || 987654321;
	return () => {
		z = (36969 * (z & 65535) + (z >> 16)) & MASK;
		w = (18000 * (w & 65535) + (w >> 16)) & MASK;
		const result = ((z << 16) + w) & MASK;
		return result / 4294967296 + 0.5;
	};
}
