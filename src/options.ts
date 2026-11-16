import { KEYBOARD_MAPS, KeyboardMap } from './keyboard.js';

export interface SimcockifyOptions {
	/** Seed for the PRNG; the same seed and options give the same output. Random if omitted. */
	seed?: number | string;
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

export const DEFAULT_OPTIONS = {
	exclude: '.no-simcockify',
	keyboardType: KEYBOARD_MAPS.QWERTY,
	debug: false,
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
