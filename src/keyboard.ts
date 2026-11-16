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
 * velocity. Unknown characters map to themselves.
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
