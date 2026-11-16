// Individual mistakes applied to one word by the word engine. Words are
// handled as arrays of units (a code point plus any combining marks), so
// surrogate pairs and accented letters are never split.
import { KeyboardMap, nearbyKeys } from './keyboard.js';

export type Random = () => number;

/** Mistake types the word engine can make. */
export const TYPO_TYPES = ['slip', 'transpose', 'insert'] as const;
export type TypoType = (typeof TYPO_TYPES)[number];

export interface MutationContext {
	random: Random;
	keyboard: KeyboardMap;
	/** Furthest key, in key widths, a slip or inserted key can land from the intended one. */
	slipDistance: number;
}

/** Word-level mistake: receives the current units, returns new units or null when not applicable. */
type Mutation = (units: string[], ctx: MutationContext) => string[] | null;

const LETTER = /^\p{L}/u;

export function toUnits(word: string): string[] {
	return word.match(/\P{M}\p{M}*/gu) ?? [];
}

const isLetter = (u: string | undefined): boolean => u !== undefined && LETTER.test(u);
const isUpper = (u: string): boolean => u !== u.toLowerCase() && u === u.toUpperCase();

export function letterCount(units: string[]): number {
	return units.filter(isLetter).length;
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

const MUTATIONS: Record<TypoType, Mutation> = {
	/** Key slip: one letter replaced by a neighbouring key, in the same case. */
	slip(units, ctx) {
		const at = indexes(units, (i) => hasNeighbour(units[i], ctx));
		if (at.length === 0) return null;
		const i = pick(at, ctx.random);
		const out = units.slice();
		out[i] = neighbour(units[i], ctx)!;
		return out;
	},

	/** Two adjacent letters swapped; each position keeps its case ("The" -> "Hte"). */
	transpose(units, ctx) {
		const at = indexes(
			units,
			(i) => isLetter(units[i]) && isLetter(units[i + 1]) && units[i].toLowerCase() !== units[i + 1].toLowerCase(),
		);
		if (at.length === 0) return null;
		const i = pick(at, ctx.random);
		const out = units.slice();
		const a = units[i];
		const b = units[i + 1];
		out[i] = isUpper(a) ? b.toUpperCase() : b.toLowerCase();
		out[i + 1] = isUpper(b) ? a.toUpperCase() : a.toLowerCase();
		return out;
	},

	/** Extra character: a neighbouring key inserted before or after a letter; nothing is overwritten. */
	insert(units, ctx) {
		const at = indexes(units, (i) => hasNeighbour(units[i], ctx));
		if (at.length === 0) return null;
		const i = pick(at, ctx.random);
		const extra = neighbour(units[i], ctx)!;
		const out = units.slice();
		out.splice(ctx.random() < 0.5 ? i : i + 1, 0, extra);
		return out;
	},
};

/** Words shorter than this (in letters) are left alone. */
export const MIN_WORD_LETTERS = 3;

/** Applies the mutation `type` to `units`, or returns null when it does not apply to this word. */
export function mutate(type: TypoType, units: string[], ctx: MutationContext): string[] | null {
	if (letterCount(units) < MIN_WORD_LETTERS) return null;
	return MUTATIONS[type](units, ctx);
}
