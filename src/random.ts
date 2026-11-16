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
