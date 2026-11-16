// The word engine: tokenises text, then gives each word a number of mistakes
// drawn from the condition-derived rate. Only word tokens are changed.
import { KeyboardMap } from './keyboard.js';
import { mutate, MutationContext, toUnits, TypoType, TYPO_TYPES } from './mutations.js';
import { Token, tokenize } from './tokenize.js';

export interface Change {
	/** Offset of `replacement` in the output text (UTF-16 code units). */
	index: number;
	/** The text as it was in the input. */
	original: string;
	/** The text that replaced it in the output. */
	replacement: string;
	/** Mistake type; several types on one word are joined with "+". */
	type: string;
}

export interface SegmentResult {
	text: string;
	changes: Change[];
}

export interface WordEngineSettings {
	/** Expected mistakes per word. */
	rate: number;
	keyboard: KeyboardMap;
	slipDistance: number;
	random: () => number;
	log: (msg: string) => void;
}

/** Relative weights of the mistake types. */
export const TYPO_WEIGHTS: Readonly<Record<TypoType, number>> = { slip: 4, transpose: 3, insert: 2 };

/** Most mistakes a single word can receive. */
const MAX_PER_WORD = 3;

/** Slip distance in key widths for a velocity value (4, the minimum, means immediate neighbours). */
export function slipDistanceFor(velocity: number): number {
	return Math.min(3.5, 1.25 + 0.5 * Math.max(0, velocity - 4));
}

/**
 * Converts an expected count per word into the continue-probability of a
 * geometric draw, so the mean number of mistakes per word is about `rate`.
 * A rate of 0 gives 0: there is no minimum per text.
 */
function stepProbability(rate: number): number {
	return rate > 0 ? rate / (1 + rate) : 0;
}

/**
 * Runs the word engine over several text segments as one document and
 * returns each segment's output and changes.
 */
export function runWordEngine(segments: string[], s: WordEngineSettings): SegmentResult[] {
	const tokenized: Token[][] = segments.map(tokenize);
	const ctx: MutationContext = { random: s.random, keyboard: s.keyboard, slipDistance: s.slipDistance };
	const weights = TYPO_TYPES.map((t) => TYPO_WEIGHTS[t]);
	const p = stepProbability(s.rate);

	const mutateWord = (word: string): { text: string; types: TypoType[] } => {
		let units = toUnits(word);
		const types: TypoType[] = [];
		let count = 0;
		while (count < MAX_PER_WORD && s.random() < p) count++;
		for (let k = 0; k < count; k++) {
			// Weighted draw without replacement until a type applies to this word.
			const w = weights.slice();
			let total = w.reduce((a, b) => a + b, 0);
			while (total > 0) {
				let roll = s.random() * total;
				let i = 0;
				while (i < w.length - 1 && (roll -= w[i]) >= 0) i++;
				while (w[i] === 0 && i > 0) i--; // rounding guard: never pick a zero weight
				const next = mutate(TYPO_TYPES[i], units, ctx);
				if (next) {
					units = next;
					types.push(TYPO_TYPES[i]);
					break;
				}
				total -= w[i];
				w[i] = 0;
			}
		}
		return { text: units.join(''), types };
	};

	return tokenized.map((tokens) => {
		let out = '';
		const changes: Change[] = [];
		for (const tok of tokens) {
			if (tok.kind !== 'word' || p === 0) {
				out += tok.text;
				continue;
			}
			const { text, types } = mutateWord(tok.text);
			if (text !== tok.text) {
				changes.push({ index: out.length, original: tok.text, replacement: text, type: types.join('+') });
				s.log(`  > ${types.join('+')}: '${tok.text}' -> '${text}'`);
			}
			out += text;
		}
		return { text: out, changes };
	});
}
