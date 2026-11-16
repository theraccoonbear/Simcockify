import { KEYBOARD_MAPS, KeyboardMap } from './keyboard.js';

/** Mistake types the word engine can make. */
export const TYPO_TYPES = [
	'slip',
	'transpose',
	'double',
	'drop',
	'insert',
	'apostrophe',
	'homophone',
	'duplicate',
	'stickyShift',
	'sentenceEnd',
] as const;

export type TypoType = (typeof TYPO_TYPES)[number];
export type TypoWeights = Partial<Record<TypoType, number>>;

export const ENGINES = ['word', 'classic'] as const;
export type Engine = (typeof ENGINES)[number];

export const REVEAL_MODES = ['html', 'ansi', 'json'] as const;
export type RevealMode = (typeof REVEAL_MODES)[number];

export interface SimcockifyOptions {
	/** Seed for the PRNG; the same seed and options give the same output. Random if omitted. */
	seed?: number | string;
	/** `'word'` (default) or `'classic'` (the 1.x algorithm, reproducing old seeds exactly). */
	engine?: Engine;
	/**
	 * Fatigue drift, -1 to 1. Positive values make the start cleaner and the end
	 * messier (the average rate is unchanged); negative values do the reverse.
	 * 0 (default) is off. Word engine only.
	 */
	fatigue?: number;
	/** Name of a preset in `PERSONAS`; it sits between the defaults and the explicit options. */
	persona?: string;
	/** Relative weights of the mistake types (word engine only); merged per key over lower layers. */
	typoWeights?: TypoWeights;
	/**
	 * Mark what changed: `'html'` wraps changes in `<span class="simcock">`,
	 * `'ansi'` colours them for a terminal, `'json'` returns `{ text, changes }`
	 * as JSON. The DOM helper wraps changes in span elements for any mode.
	 */
	reveal?: RevealMode;
	/** Physical keyboard layout used to pick neighbouring keys. */
	keyboardType?: KeyboardMap;
	/** Log activity messages. */
	debug?: boolean;
	/** Receives debug messages (defaults to console.log). */
	logger?: (message: string) => void;
	/** Exclusion selector; only used by the DOM helper and the jQuery adapter. */
	exclude?: string;
	/** Supply a random source directly (returns [0, 1)); overrides `seed`. */
	random?: () => number;

	// Velocity factors
	FiveHourEnergies?: number;
	Espressos?: number;
	Coffees?: number;

	// Frequency factors
	HoursOfSleep?: number;
	MinutesTalkingToClients?: number;
	DeadlinesLooming?: number;
	EmployeesBlocked?: number;
}

/**
 * Default relative weights. `sentenceEnd` is not chosen per word: it is the
 * chance of a sentence end being botched relative to a word getting a typo
 * (1 means the same chance, capped at 1).
 */
export const DEFAULT_TYPO_WEIGHTS: Readonly<Record<TypoType, number>> = {
	slip: 4,
	transpose: 3,
	double: 1.5,
	drop: 2,
	insert: 2,
	apostrophe: 2,
	homophone: 3,
	duplicate: 0.5,
	stickyShift: 1,
	sentenceEnd: 0.5,
};

export const DEFAULT_OPTIONS = {
	exclude: '.no-simcockify',
	keyboardType: KEYBOARD_MAPS.QWERTY,
	debug: false,
	engine: 'word' as Engine,
	fatigue: 0,
	typoWeights: DEFAULT_TYPO_WEIGHTS,
	FiveHourEnergies: 0,
	Espressos: 0,
	Coffees: 0,
	HoursOfSleep: 8,
	MinutesTalkingToClients: 0,
	DeadlinesLooming: 0,
	EmployeesBlocked: 0,
} as const;

/** The numeric tuning options, in documentation order. */
export const NUMERIC_OPTIONS = [
	'FiveHourEnergies',
	'Espressos',
	'Coffees',
	'HoursOfSleep',
	'MinutesTalkingToClients',
	'DeadlinesLooming',
	'EmployeesBlocked',
] as const;

export type Conditions = Record<(typeof NUMERIC_OPTIONS)[number], number>;

export function num(value: unknown, fallback: number): number {
	if (value === undefined || value === null || value === '') return fallback;
	const n = Number(value);
	return Number.isNaN(n) ? fallback : n;
}

/** Reads the condition options, falling back to the defaults and coercing numeric strings. */
export function readConditions(options: SimcockifyOptions): Conditions {
	const o = {} as Conditions;
	for (const k of NUMERIC_OPTIONS) o[k] = num(options[k], DEFAULT_OPTIONS[k]);
	return o;
}

/**
 * Typos per word implied by the conditions (the 1.x formula). 0 when every
 * factor is neutral (Coffees 2, HoursOfSleep 8, the rest 0); 0.1 with the
 * defaults, because Coffees 0 is off-neutral.
 */
export function typoRate(o: Conditions): number {
	return (
		(Math.abs(o.HoursOfSleep - 8) / 8 +
			o.DeadlinesLooming / 20 +
			o.EmployeesBlocked / 15 +
			o.MinutesTalkingToClients / 1440 +
			(Math.abs(2 - o.Coffees) + o.FiveHourEnergies + o.Espressos > 0 ? 0.5 : 0)) /
		5
	);
}

/** Velocity implied by the conditions (the 1.x formula); 4 at the defaults. */
export function typoVelocity(o: Conditions): number {
	const velocityFactor = 2 + o.FiveHourEnergies / 8 + Math.abs(o.Coffees - 2) / 10 + o.Espressos / 5;
	return 2 + Math.round(Math.max(0, velocityFactor));
}
