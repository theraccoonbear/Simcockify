// The CLI's positional `key:value,key:value` shorthand, e.g. `fhe:3,eb:8,s:demo`.
import { NUMERIC_OPTIONS } from './options.js';

/** Short aliases and the option each one sets. */
export const SHORTHAND_ALIASES: Readonly<Record<string, string>> = {
	c: 'Coffees',
	e: 'Espressos',
	fhe: 'FiveHourEnergies',
	hos: 'HoursOfSleep',
	mtc: 'MinutesTalkingToClients',
	dl: 'DeadlinesLooming',
	eb: 'EmployeesBlocked',
	s: 'seed',
	f: 'fatigue',
	p: 'persona',
};

/** Options that can be set by their full name (matched case-insensitively). */
const NAMED_OPTIONS = [...NUMERIC_OPTIONS, 'seed', 'fatigue', 'persona', 'engine', 'reveal', 'keyboard'];

/** The flag spelling of the numeric options (`five-hour-energies`), also accepted as keys. */
const kebab = (name: string): string => name.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase());

/** Every accepted key, lower-cased, mapped to its option name. */
const KEYS: ReadonlyMap<string, string> = new Map([
	...Object.entries(SHORTHAND_ALIASES),
	...NAMED_OPTIONS.map((n) => [n.toLowerCase(), n] as [string, string]),
	...NUMERIC_OPTIONS.map((n) => [kebab(n), n] as [string, string]),
]);

/** A whole positional argument that is a shorthand spec. */
export const SHORTHAND_SPEC = /^[a-z][\w-]*:[^,]*(,[a-z][\w-]*:[^,]*)*$/i;

export function isShorthandSpec(arg: string): boolean {
	return SHORTHAND_SPEC.test(arg);
}

export interface ShorthandEntry {
	/** The key as written. */
	key: string;
	/** The option it sets, e.g. `FiveHourEnergies`. */
	option: string;
	value: string;
}

/** Levenshtein distance, for suggesting the nearest key. */
function distance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
		prev = cur;
	}
	return prev[b.length];
}

/** The accepted key closest to `key`, or undefined when nothing is close. */
export function closestKey(key: string): string | undefined {
	const k = key.toLowerCase();
	let best: string | undefined;
	let bestD = Infinity;
	for (const candidate of KEYS.keys()) {
		const d = distance(k, candidate);
		if (d < bestD || (d === bestD && best !== undefined && candidate.length < best.length)) {
			best = candidate;
			bestD = d;
		}
	}
	return best !== undefined && bestD <= Math.max(1, Math.floor(k.length / 3)) ? best : undefined;
}

/**
 * Parses a spec such as `fhe:3,eb:8` into entries in order. Keys are
 * aliases, full option names or flag names, in any case. Values are left as
 * strings for the caller to validate. Throws on a malformed spec or an
 * unknown key, suggesting the closest one.
 */
export function parseShorthand(spec: string): ShorthandEntry[] {
	if (!isShorthandSpec(spec)) throw new Error(`"${spec}" is not a key:value[,key:value] spec`);
	return spec.split(',').map((pair) => {
		const colon = pair.indexOf(':');
		const key = pair.slice(0, colon);
		const value = pair.slice(colon + 1);
		const option = KEYS.get(key.toLowerCase());
		if (!option) {
			const near = closestKey(key);
			const hint = near
				? `did you mean "${near}" (${KEYS.get(near)})?`
				: `known keys: ${Object.keys(SHORTHAND_ALIASES).join(', ')} or a full option name`;
			throw new Error(`unknown shorthand key "${key}"; ${hint}`);
		}
		return { key, option, value };
	});
}
