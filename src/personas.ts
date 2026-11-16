import { SimcockifyOptions } from './options.js';

export interface Persona {
	description: string;
	/** Condition values, fatigue and typo weights applied before any explicit option. */
	options: Pick<
		SimcockifyOptions,
		| 'FiveHourEnergies'
		| 'Espressos'
		| 'Coffees'
		| 'HoursOfSleep'
		| 'MinutesTalkingToClients'
		| 'DeadlinesLooming'
		| 'EmployeesBlocked'
		| 'fatigue'
		| 'typoWeights'
	>;
}

/** Preset bundles of conditions, typo weights and fatigue. Select one with the `persona` option. */
export const PERSONAS: Readonly<Record<string, Persona>> = {
	'well-rested': {
		description: 'Slept well, one coffee. Almost clean.',
		options: { Coffees: 2, HoursOfSleep: 7.5, fatigue: 0 },
	},
	'monday-morning': {
		description: 'Short on sleep and slow to start; sloppy at first, warming up by the end.',
		options: {
			Coffees: 1,
			HoursOfSleep: 5,
			DeadlinesLooming: 2,
			fatigue: -0.6,
			typoWeights: { stickyShift: 3, drop: 3, transpose: 4 },
		},
	},
	'friday-afternoon': {
		description: 'Nearly out the door; tidy at first, then dropped apostrophes and skipped full stops.',
		options: {
			Coffees: 4,
			HoursOfSleep: 7,
			MinutesTalkingToClients: 90,
			DeadlinesLooming: 4,
			fatigue: 0.8,
			typoWeights: { apostrophe: 4, homophone: 4, duplicate: 1.5, sentenceEnd: 1.5 },
		},
	},
	'post-launch': {
		description: 'Three hours of sleep, a queue of blocked colleagues and espressos; heavy and getting worse.',
		options: {
			Espressos: 3,
			HoursOfSleep: 3,
			EmployeesBlocked: 8,
			fatigue: 0.5,
			typoWeights: { double: 3, insert: 3, duplicate: 1 },
		},
	},
	'client-call': {
		description: 'Typing while talking: homophones, repeated words and dropped letters.',
		options: {
			Coffees: 3,
			HoursOfSleep: 7,
			MinutesTalkingToClients: 240,
			DeadlinesLooming: 2,
			fatigue: 0.3,
			typoWeights: { homophone: 5, duplicate: 2, drop: 3 },
		},
	},
	caffeinated: {
		description: 'Fast, jittery fingers: wide key slips, extra keys and a sticky Shift.',
		options: {
			Coffees: 6,
			Espressos: 6,
			FiveHourEnergies: 2,
			HoursOfSleep: 5,
			fatigue: 0,
			typoWeights: { slip: 6, insert: 4, double: 3, stickyShift: 3 },
		},
	},
};

export const PERSONA_NAMES = Object.keys(PERSONAS);
