// Individual mistakes applied to one word by the word engine. Words are
// handled as arrays of units (a code point plus any combining marks), so
// surrogate pairs and accented letters are never split.
import { KeyboardMap, nearbyKeys } from './keyboard.js';
import { TypoType } from './options.js';

export type Random = () => number;

export interface MutationContext {
	random: Random;
	keyboard: KeyboardMap;
	/** Furthest key, in key widths, a slip or inserted key can land from the intended one. */
	slipDistance: number;
}

/** Word-level mistake: receives the current units, returns new units or null when not applicable. */
type Mutation = (units: string[], ctx: MutationContext) => string[] | null;

/** Groups of commonly confused words. Lookups are case-insensitive. */
export const HOMOPHONES: readonly (readonly string[])[] = [
	['their', 'there', "they're"],
	['its', "it's"],
	['your', "you're"],
	['to', 'too'],
	['then', 'than'],
	['lose', 'loose'],
	['affect', 'effect'],
	['whose', "who's"],
];

const HOMOPHONE_INDEX = new Map<string, readonly string[]>();
for (const group of HOMOPHONES) for (const w of group) HOMOPHONE_INDEX.set(w, group);

const LETTER = /^\p{L}/u;
const APOSTROPHE = /^['’]$/;

export function toUnits(word: string): string[] {
	return word.match(/\P{M}\p{M}*/gu) ?? [];
}

const isLetter = (u: string | undefined): boolean => u !== undefined && LETTER.test(u);
const isUpper = (u: string): boolean => u !== u.toLowerCase() && u === u.toUpperCase();

export function letterCount(units: string[]): number {
	return units.filter(isLetter).length;
}

/** Applies the case pattern of `source` (ALL CAPS, Capitalised or lower) to `word`. */
export function matchCase(source: string, word: string): string {
	const letters = toUnits(source).filter(isLetter);
	if (letters.length > 1 && letters.every(isUpper)) return word.toUpperCase();
	if (letters.length > 0 && isUpper(letters[0])) return word.charAt(0).toUpperCase() + word.slice(1);
	return word;
}

function pick<T>(items: T[], random: Random): T {
	return items[Math.floor(random() * items.length)];
}

function pickWeighted<T>(items: T[], weight: (item: T) => number, random: Random): T {
	const total = items.reduce((s, it) => s + weight(it), 0);
	let roll = random() * total;
	for (const it of items) {
		roll -= weight(it);
		if (roll < 0) return it;
	}
	return items[items.length - 1];
}

function indexes(units: string[], test: (i: number) => boolean): number[] {
	const out: number[] = [];
	for (let i = 0; i < units.length; i++) if (test(i)) out.push(i);
	return out;
}

/** A neighbouring key for `unit`, nearer keys being likelier, or null if it has none. */
function neighbour(unit: string, ctx: MutationContext): string | null {
	if ([...unit].length !== 1) return null;
	const keys = nearbyKeys(unit, ctx.keyboard, ctx.slipDistance);
	if (keys.length === 0) return null;
	return pickWeighted(keys, (k) => 1 / (k.distance * k.distance), ctx.random).key;
}

function hasNeighbour(unit: string, ctx: MutationContext): boolean {
	return [...unit].length === 1 && nearbyKeys(unit, ctx.keyboard, ctx.slipDistance).length > 0;
}

const MUTATIONS: Record<Exclude<TypoType, 'sentenceEnd'>, Mutation> = {
	slip(units, ctx) {
		const at = indexes(units, (i) => hasNeighbour(units[i], ctx));
		if (at.length === 0) return null;
		const i = pick(at, ctx.random);
		const out = units.slice();
		out[i] = neighbour(units[i], ctx)!;
		return out;
	},

	transpose(units, ctx) {
		const at = indexes(
			units,
			(i) => isLetter(units[i]) && isLetter(units[i + 1]) && units[i].toLowerCase() !== units[i + 1].toLowerCase(),
		);
		if (at.length === 0) return null;
		const i = pick(at, ctx.random);
		const out = units.slice();
		// Swap the letters but keep the case of each position ("The" -> "Hte").
		const a = units[i];
		const b = units[i + 1];
		out[i] = isUpper(a) ? b.toUpperCase() : b.toLowerCase();
		out[i + 1] = isUpper(b) ? a.toUpperCase() : a.toLowerCase();
		return out;
	},

	double(units, ctx) {
		const at = indexes(units, (i) => isLetter(units[i]) && units[i + 1] !== units[i] && units[i - 1] !== units[i]);
		if (at.length === 0) return null;
		const i = pick(at, ctx.random);
		const out = units.slice();
		out.splice(i, 0, units[i]);
		return out;
	},

	drop(units, ctx) {
		if (letterCount(units) < 3) return null;
		// Keep the first letter: dropped letters are almost always inside or at the end of a word.
		const at = indexes(units, (i) => i > 0 && isLetter(units[i]));
		if (at.length === 0) return null;
		const out = units.slice();
		out.splice(pick(at, ctx.random), 1);
		return out;
	},

	insert(units, ctx) {
		const at = indexes(units, (i) => hasNeighbour(units[i], ctx));
		if (at.length === 0) return null;
		const i = pick(at, ctx.random);
		const extra = neighbour(units[i], ctx)!;
		const out = units.slice();
		out.splice(ctx.random() < 0.5 ? i : i + 1, 0, extra);
		return out;
	},

	apostrophe(units, ctx) {
		const at = indexes(units, (i) => APOSTROPHE.test(units[i]));
		if (at.length === 0) return null;
		const out = units.slice();
		out.splice(pick(at, ctx.random), 1);
		return out;
	},

	homophone(units, ctx) {
		const word = units.join('');
		const group = HOMOPHONE_INDEX.get(word.toLowerCase().replace(/’/g, "'"));
		if (!group) return null;
		const others = group.filter((w) => w !== word.toLowerCase().replace(/’/g, "'"));
		const curly = word.includes('’');
		let swap = pick(others, ctx.random);
		if (curly) swap = swap.replace(/'/g, '’');
		return toUnits(matchCase(word, swap));
	},

	duplicate(units) {
		if (letterCount(units) < 2) return null;
		return [...units, ' ', ...units];
	},

	stickyShift(units, ctx) {
		// Only for Capitalised words: Shift held a beat too long ("THe") or pressed late ("tHe").
		if (letterCount(units) < 3 || !isUpper(units[0]) || !isLetter(units[1]) || isUpper(units[1])) return null;
		const out = units.slice();
		if (ctx.random() < 0.6) {
			out[1] = units[1].toUpperCase();
		} else {
			out[0] = units[0].toLowerCase();
			out[1] = units[1].toUpperCase();
		}
		return out;
	},
};

/** Types that change individual letters; they need a word of at least three letters. */
export const CHARACTER_TYPES: ReadonlySet<TypoType> = new Set<TypoType>(['slip', 'transpose', 'double', 'drop', 'insert', 'stickyShift']);

/** Words shorter than this (in letters) only get word-level mistakes (homophone, duplicate, apostrophe). */
export const MIN_WORD_LETTERS = 3;

/**
 * Applies the mutation `type` to `units`, returning the new units, or null when
 * the type does not apply to this word (too short, no apostrophe, not a homophone...).
 */
export function mutate(type: TypoType, units: string[], ctx: MutationContext): string[] | null {
	if (type === 'sentenceEnd') return null;
	if (CHARACTER_TYPES.has(type) && letterCount(units) < MIN_WORD_LETTERS) return null;
	return MUTATIONS[type](units, ctx);
}

/** Variants of a hurried sentence end, replacing a final ".". */
export function hastySentenceEnd(random: Random): string {
	const roll = random();
	if (roll < 0.5) return '';
	if (roll < 0.75) return '..';
	return ',';
}
