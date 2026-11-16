// The 1.x typo algorithm, kept unchanged so that old seeds reproduce exactly.
// Its known quirks (biased index pick, swaps across spaces and punctuation,
// overwriting "extra" characters, at least one typo per chunk whenever the
// rate is above zero) are deliberate here; the word engine fixes them.
import { accessibleKeys, KeyboardMap } from './keyboard.js';
import { Conditions, typoRate, typoVelocity } from './options.js';

const WORD_SPLIT = /[\s,;.!?-]/g;

function replaceAt(str: string, index: number, replacement: string): string {
	return str.substring(0, index) + replacement + str.substring(index + replacement.length);
}

export function createClassicSimcockifier(
	o: Conditions,
	keyboard: KeyboardMap,
	random: () => number,
	log: (msg: string) => void,
): (text: string) => string {
	const typosPerWord = typoRate(o);
	const velocity = typoVelocity(o);

	const pickIndex = (text: string): number =>
		Math.min(text.length - 1, Math.max(0, Math.floor(random() * text.length - 1)));

	// Picks a non-whitespace position (up to 10 attempts) and its neighbouring-key choices.
	const pickChar = (text: string): { i: number; chr: string; alt: string } => {
		let i: number;
		let attempts = 0;
		do {
			i = pickIndex(text);
		} while (/\s/.test(text[i]) && ++attempts < 10);
		const chr = text[i];
		const alts = accessibleKeys(chr, keyboard, velocity);
		return { i, chr, alt: alts[Math.floor(random() * alts.length)] };
	};

	const typos: { probability: number | '*'; action: (text: string) => string }[] = [
		{
			probability: 0.05,
			action: (text) => {
				if (!/[^\s]/.test(text)) {
					log('miss');
					return text;
				}
				const { i, chr, alt } = pickChar(text);
				log(`  > Miskey: replacing '${chr}' with '${alt}' at position ${i}`);
				return replaceAt(text, i, alt);
			},
		},
		{
			probability: 0.9,
			action: (text) => {
				if (text.length <= 1) {
					log('miss');
					return text;
				}
				const i1 = pickIndex(text);
				const i2 = Math.min(text.length - 1, Math.max(0, i1 + Math.floor(random() * velocity * 2) - velocity));
				const idx1 = Math.min(i1, i2);
				const idx2 = Math.max(i1, i2);
				if (idx1 !== idx2) {
					const c1 = text[idx1];
					const c2 = text[idx2];
					text = replaceAt(text, idx1, c2);
					text = replaceAt(text, idx2, c1);
					log(`  > Transposition: swapping character '${c1}' at ${idx1} and '${c2}' at ${idx2}`);
				}
				return text;
			},
		},
		{
			probability: '*',
			action: (text) => {
				if (!/[^\s]/.test(text)) {
					log('miss');
					return text;
				}
				const { i, chr, alt } = pickChar(text);
				const replacement = random() < 0.5 ? chr + alt : alt + chr;
				log(`  > extraCharacter: replacing '${chr}' with '${replacement}' at position ${i}`);
				return replaceAt(text, i, replacement);
			},
		},
	];

	// Picks a typo by cumulative probability. The 1.x version was a do/while
	// that indexed the table before checking bounds; this loop stops at the
	// catch-all entry ('*') and falls back to the last entry, choosing the same
	// typo for every roll.
	const randomTypo = () => {
		const roll = random();
		let cumulative = 0;
		for (const t of typos) {
			if (t.probability === '*') return t;
			cumulative += t.probability;
			if (roll <= cumulative) return t;
		}
		return typos[typos.length - 1];
	};

	return (input: string): string => {
		const lead = /^\s*/.exec(input)![0];
		const trail = input.length > lead.length ? /\s*$/.exec(input)![0] : '';
		let text = input.trim();
		if (text.length <= 1) return input;

		const words = text.split(WORD_SPLIT);
		// 1.x declared its typo counter twice; one loop counter is enough.
		const needed = Math.ceil(words.length * typosPerWord);
		log(`TEXT: "${text}"`);
		log(`Inspecting ${words.length} word(s) and generating ${needed} typo(s) at velocity ${velocity}`);
		for (let n = 0; n < needed; n++) {
			text = randomTypo().action(text);
		}
		log(`Inserted ${needed} typo(s)`);
		return lead + text + trail;
	};
}
