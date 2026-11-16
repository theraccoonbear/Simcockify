import { accessibleKeys, KeyboardMap } from './keyboard.js';
import { DEFAULT_OPTIONS, SimcockifyOptions } from './options.js';
import { createRandom } from './random.js';

const WORD_SPLIT = /[\s,;.!?-]/g;

function num(value: unknown, fallback: number): number {
	if (value === undefined || value === null || value === '') return fallback;
	const n = Number(value);
	return Number.isNaN(n) ? fallback : n;
}

function replaceAt(str: string, index: number, replacement: string): string {
	return str.substring(0, index) + replacement + str.substring(index + replacement.length);
}

/**
 * Builds a function that applies typos to text. All calls share one PRNG
 * stream, so a sequence of texts is repeatable as a whole.
 */
export function createSimcockifier(options: SimcockifyOptions = {}): (text: string) => string {
	const o = {
		FiveHourEnergies: num(options.FiveHourEnergies, DEFAULT_OPTIONS.FiveHourEnergies),
		Espressos: num(options.Espressos, DEFAULT_OPTIONS.Espressos),
		Coffees: num(options.Coffees, DEFAULT_OPTIONS.Coffees),
		HoursOfSleep: num(options.HoursOfSleep, DEFAULT_OPTIONS.HoursOfSleep),
		MinutesTalkingToClients: num(options.MinutesTalkingToClients, DEFAULT_OPTIONS.MinutesTalkingToClients),
		DeadlinesLooming: num(options.DeadlinesLooming, DEFAULT_OPTIONS.DeadlinesLooming),
		EmployeesBlocked: num(options.EmployeesBlocked, DEFAULT_OPTIONS.EmployeesBlocked),
	};
	const keyboard: KeyboardMap = options.keyboardType ?? DEFAULT_OPTIONS.keyboardType;
	const random = options.random ?? createRandom(options.seed);
	const log = (msg: string): void => {
		if (options.debug) (options.logger ?? console.log)(msg);
	};

	const typosPerWord =
		(Math.abs(o.HoursOfSleep - 8) / 8 +
			o.DeadlinesLooming / 20 +
			o.EmployeesBlocked / 15 +
			o.MinutesTalkingToClients / 1440 +
			(Math.abs(2 - o.Coffees) + o.FiveHourEnergies + o.Espressos > 0 ? 0.5 : 0)) /
		5;

	const velocityFactor = 2 + o.FiveHourEnergies / 8 + Math.abs(o.Coffees - 2) / 10 + o.Espressos / 5;
	const velocity = 2 + Math.round(Math.max(0, velocityFactor));

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

/** Returns `text` with typos injected. Same seed and options give the same output. */
export function simcockify(text: string, options: SimcockifyOptions = {}): string {
	return createSimcockifier(options)(text);
}
