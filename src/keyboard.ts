export interface KeyboardMap {
	[layer: string]: string[][];
}

export const KEYBOARD_MAPS: { QWERTY: KeyboardMap } = {
	QWERTY: {
		standard: [
			'`1234567890-='.split(''),
			'\tqwertyuiop[]\\'.split(''),
			"asdfghjkl;'".split(''),
			'zxcvbnm,./'.split(''),
		],
		shift: [
			'~!@#$%^&*()_+'.split(''),
			'\tQWERTYUIOP{}|'.split(''),
			'ASDFGHJKL:"'.split(''),
			'ZXCVBNM<>?'.split(''),
		],
	},
};

/**
 * Characters reachable from `intended` on the given keyboard, widening with
 * velocity. Unknown characters map to themselves. Used by the classic engine
 * and kept bit-for-bit so old seeds reproduce: the column slice uses an end
 * index of `2 * velocity` and the last row in range is excluded, so a
 * single-row range returns `[intended]`. The word engine uses `nearbyKeys`.
 */
export function accessibleKeys(intended: string, keyboardMap: KeyboardMap, velocity: number): string[] {
	let inMap: string | undefined;
	let inRow = 0;
	let atCol = 0;

	mapLoop: for (const m of Object.keys(keyboardMap)) {
		const map = keyboardMap[m];
		for (let r = 0; r < map.length; r++) {
			const idx = map[r].indexOf(intended);
			if (idx >= 0) {
				inMap = m;
				inRow = r;
				atCol = idx;
				break mapLoop;
			}
		}
	}

	if (inMap === undefined) {
		return [intended];
	}

	const map = keyboardMap[inMap];
	const rowFrom = Math.round(Math.max(0, inRow - velocity / 2));
	const rowTo = Math.round(Math.min(map.length - 1, inRow + velocity / 2));
	const sets: string[] = [];
	for (let r = rowFrom; r < rowTo; r++) {
		// The second slice argument is an end index, not a length (kept from the original).
		sets.push(map[r].slice(Math.max(0, atCol - velocity), 2 * velocity).join(''));
	}
	const all = sets.join('').split('');
	return all.length > 0 ? all : [intended];
}

/**
 * Horizontal offset, in key widths, of the first key in each row of a
 * standard staggered keyboard (row 1 starts with Tab, counted as one key).
 */
const ROW_STAGGER = [0, 0.5, 1.75, 2.25];

export interface NearbyKey {
	key: string;
	/** Distance between key centres, in key widths. */
	distance: number;
}

/**
 * Letter keys within `maxDistance` key widths of `intended`, nearest first,
 * using the physical stagger of the rows. Looks the character up
 * case-insensitively and returns keys in the same case as `intended`.
 * Characters that are not on the map, or not letters, give an empty list.
 *
 * Unlike `accessibleKeys` (kept unchanged for the classic engine), every row
 * in range is included and the column window is centred on the key.
 */
export function nearbyKeys(intended: string, keyboardMap: KeyboardMap, maxDistance: number): NearbyKey[] {
	const lower = intended.toLowerCase();
	const upper = lower !== intended;
	let pos: { r: number; x: number; layer: string[][] } | undefined;
	for (const layer of Object.values(keyboardMap)) {
		for (let r = 0; r < layer.length && !pos; r++) {
			const c = layer[r].indexOf(lower);
			if (c >= 0) pos = { r, x: (ROW_STAGGER[r] ?? 0) + c, layer };
		}
		if (pos) break;
	}
	if (!pos) return [];
	const out: NearbyKey[] = [];
	pos.layer.forEach((row, r) => {
		row.forEach((key, c) => {
			if (key === lower || !/^\p{L}$/u.test(key)) return;
			const dx = (ROW_STAGGER[r] ?? 0) + c - pos!.x;
			const dy = r - pos!.r;
			const distance = Math.hypot(dx, dy);
			if (distance <= maxDistance) out.push({ key: upper ? key.toUpperCase() : key, distance });
		});
	});
	return out.sort((a, b) => a.distance - b.distance || (a.key < b.key ? -1 : 1));
}
