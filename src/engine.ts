// The word engine: tokenises text, then gives each word a number of mistakes
// drawn from the condition-derived rate. Only word tokens are changed.
import { KeyboardMap } from './keyboard.js';
import { CHARACTER_TYPES, hastySentenceEnd, mutate, MutationContext, toUnits } from './mutations.js';
import { TypoType, TYPO_TYPES } from './options.js';
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
	weights: Record<TypoType, number>;
	keyboard: KeyboardMap;
	slipDistance: number;
	random: () => number;
	log: (msg: string) => void;
}

/** Most mistakes a single word can receive. */
const MAX_PER_WORD = 3;
const WORD_TYPES = TYPO_TYPES.filter((t) => t !== 'sentenceEnd');

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
	const wordWeights = WORD_TYPES.map((t) => Math.max(0, s.weights[t] ?? 0));
	const sentenceShare = Math.min(1, Math.max(0, s.weights.sentenceEnd ?? 0));
	const p = stepProbability(s.rate);

	const mutateWord = (word: string, p: number): { text: string; types: TypoType[] } => {
		let units = toUnits(word);
		const types: TypoType[] = [];
		let count = 0;
		while (count < MAX_PER_WORD && s.random() < p) count++;
		const once = new Set<TypoType>();
		for (let k = 0; k < count; k++) {
			// Weighted draw; see below for what happens when the type does not apply.
			const weights = wordWeights.map((w, i) => (once.has(WORD_TYPES[i]) ? 0 : w));
			let total = weights.reduce((a, b) => a + b, 0);
			while (total > 0) {
				let roll = s.random() * total;
				let i = 0;
				while (i < weights.length - 1 && (roll -= weights[i]) >= 0) i++;
				while (weights[i] === 0 && i > 0) i--; // rounding guard: never pick a zero weight
				const type = WORD_TYPES[i];
				const next = mutate(type, units, ctx);
				if (next) {
					units = next;
					types.push(type);
					// Word-level mistakes happen at most once per word, and a respelt
					// homophone or dropped apostrophe rules out the other.
					if (type === 'homophone' || type === 'apostrophe') once.add('homophone').add('apostrophe');
					if (type === 'duplicate' || type === 'stickyShift') once.add(type);
					break;
				}
				// Not applicable: retry among the letter-level types only, so that
				// word-specific types (homophone, apostrophe, duplicate) keep their
				// share instead of absorbing every draw on short words.
				weights.forEach((_, j) => {
					if (j === i || !CHARACTER_TYPES.has(WORD_TYPES[j])) weights[j] = 0;
				});
				total = weights.reduce((a, b) => a + b, 0);
			}
		}
		return { text: units.join(''), types };
	};

	return tokenized.map((tokens) => {
		let out = '';
		const changes: Change[] = [];
		for (let i = 0; i < tokens.length; i++) {
			const tok = tokens[i];
			if (tok.kind !== 'word') {
				out += tok.text;
				continue;
			}
			const { text, types } = p > 0 ? mutateWord(tok.text, p) : { text: tok.text, types: [] };
			let original = tok.text;
			let replacement = text;

			// A sentence end: "." straight after this word, then whitespace or the end of the segment.
			const nextTok = tokens[i + 1];
			const after = tokens[i + 2];
			if (
				sentenceShare > 0 &&
				p > 0 &&
				nextTok?.kind === 'punct' &&
				nextTok.text === '.' &&
				(after === undefined || after.kind === 'space')
			) {
				if (s.random() < p * sentenceShare) {
					original += '.';
					replacement += hastySentenceEnd(s.random);
					types.push('sentenceEnd');
					i++;
				}
			}

			if (replacement !== original) {
				changes.push({ index: out.length, original, replacement, type: types.join('+') });
				s.log(`  > ${types.join('+')}: '${original}' -> '${replacement}'`);
			}
			out += replacement;
		}
		return { text: out, changes };
	});
}
