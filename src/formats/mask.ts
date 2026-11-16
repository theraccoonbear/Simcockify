/** One byte per UTF-16 code unit of the text: 1 where the text is protected. */
export type Mask = Uint8Array;

/** Marks `[start, end)` as protected. */
export function protect(mask: Mask, start: number, end: number): void {
	if (end > start) mask.fill(1, Math.max(0, start), Math.min(mask.length, end));
}

/** Protects every match of a global regex that starts outside already protected text. */
export function protectMatches(text: string, mask: Mask, re: RegExp): void {
	for (const m of text.matchAll(re)) {
		if (!mask[m.index!]) protect(mask, m.index!, m.index! + m[0].length);
	}
}
