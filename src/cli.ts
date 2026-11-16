import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { simcockify } from './core.js';
import { KEYBOARD_MAPS } from './keyboard.js';
import { Engine, ENGINES, NUMERIC_OPTIONS, SimcockifyOptions, TYPO_TYPES, TypoWeights } from './options.js';

const FLAGS: Record<(typeof NUMERIC_OPTIONS)[number], string> = {
	FiveHourEnergies: 'five-hour-energies',
	Espressos: 'espressos',
	Coffees: 'coffees',
	HoursOfSleep: 'hours-of-sleep',
	MinutesTalkingToClients: 'minutes-talking-to-clients',
	DeadlinesLooming: 'deadlines-looming',
	EmployeesBlocked: 'employees-blocked',
};

const HELP = `Usage: simcockify [options] < input.txt > output.txt

Reads text on stdin, writes the text with typos injected to stdout.

Velocity factors (how far off the intended key a typo lands):
  --five-hour-energies <n>         default 0
  --espressos <n>                  default 0
  --coffees <n>                    default 0 (2 is neutral)

Frequency factors (how many typos):
  --hours-of-sleep <n>             default 8 (8 is neutral)
  --minutes-talking-to-clients <n> default 0
  --deadlines-looming <n>          default 0
  --employees-blocked <n>          default 0

Other:
  --seed <value>                   seed for repeatable output (random if omitted)
  --keyboard <name>                keyboard layout: ${Object.keys(KEYBOARD_MAPS).join(', ')} (default QWERTY)
  --engine <name>                  typo algorithm: ${ENGINES.join(', ')} (default ${ENGINES[0]});
                                   classic is the 1.x algorithm, so old seeds reproduce
  --fatigue <n>                    -1..1; >0 starts clean and ends messier, <0 the reverse (default 0)
  --weights <json>                 relative typo weights (word engine), e.g. '{"transpose":3,"homophone":0}'
                                   types: ${TYPO_TYPES.join(', ')}
  --debug                          log activity to stderr
  --config <path.json>             read options from a JSON file; flags override it
  -h, --help                       show this help
  -v, --version                    show the version

Config files use the option names: ${NUMERIC_OPTIONS.join(', ')},
seed, keyboard, debug, engine, fatigue, typoWeights (an object of typo weights).
`;

export class UsageError extends Error {}

export interface CliIO {
	stdin: () => string;
	stdout: (s: string) => void;
	stderr: (s: string) => void;
	/** True when stdin is an interactive terminal. */
	stdinIsTTY?: boolean;
}

function version(): string {
	const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
	return pkg.version as string;
}

function toNumber(name: string, value: unknown): number {
	if (typeof value === 'string' && value.trim() === '') {
		throw new UsageError(`${name} must be a number, got an empty value`);
	}
	const n = Number(value);
	if (typeof value === 'boolean' || value === null || !Number.isFinite(n)) {
		throw new UsageError(`${name} must be a number, got ${JSON.stringify(value)}`);
	}
	return n;
}

function loadConfig(path: string): Record<string, unknown> {
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (e) {
		throw new UsageError(`cannot read config file ${path}: ${(e as Error).message}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		throw new UsageError(`config file ${path} is not valid JSON: ${(e as Error).message}`);
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new UsageError(`config file ${path} must contain a JSON object`);
	}
	return parsed as Record<string, unknown>;
}

function weightsFrom(name: string, value: unknown): TypoWeights {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new UsageError(`${name} must be an object of typo weights`);
	}
	const out: TypoWeights = {};
	for (const [k, v] of Object.entries(value)) {
		if (!(TYPO_TYPES as readonly string[]).includes(k)) {
			throw new UsageError(`${name} key "${k}" must be one of: ${TYPO_TYPES.join(', ')}`);
		}
		const n = toNumber(`${name}.${k}`, v);
		if (n < 0) throw new UsageError(`${name}.${k} must be >= 0`);
		out[k as keyof TypoWeights] = n;
	}
	return out;
}

function parseWeightsFlag(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch (e) {
		throw new UsageError(`--weights is not valid JSON: ${(e as Error).message}`);
	}
}

function applyValues(opts: SimcockifyOptions, values: Record<string, unknown>, source: string): void {
	for (const [key, value] of Object.entries(values)) {
		if ((NUMERIC_OPTIONS as readonly string[]).includes(key)) {
			(opts as Record<string, unknown>)[key] = toNumber(`${source}${key}`, value);
		} else if (key === 'seed') {
			if (typeof value !== 'string' && typeof value !== 'number') {
				throw new UsageError(`${source}seed must be a string or number`);
			}
			opts.seed = value;
		} else if (key === 'debug') {
			opts.debug = Boolean(value);
		} else if (key === 'keyboard') {
			const name = String(value).toUpperCase();
			if (!(name in KEYBOARD_MAPS)) {
				throw new UsageError(`${source}keyboard must be one of: ${Object.keys(KEYBOARD_MAPS).join(', ')}`);
			}
			opts.keyboardType = KEYBOARD_MAPS[name as keyof typeof KEYBOARD_MAPS];
		} else if (key === 'engine') {
			if (typeof value !== 'string' || !(ENGINES as readonly string[]).includes(value)) {
				throw new UsageError(`${source}engine must be one of: ${ENGINES.join(', ')}`);
			}
			opts.engine = value as Engine;
		} else if (key === 'fatigue') {
			const n = toNumber(`${source}fatigue`, value);
			if (n < -1 || n > 1) throw new UsageError(`${source}fatigue must be between -1 and 1`);
			opts.fatigue = n;
		} else if (key === 'typoWeights') {
			// Merged key by key, so --weights adjusts the config file's weights.
			opts.typoWeights = { ...opts.typoWeights, ...weightsFrom(`${source}typoWeights`, value) };
		} else {
			throw new UsageError(`unknown option ${source}${key}`);
		}
	}
}

/** Runs the CLI and returns the process exit code. */
export function run(argv: string[], io: CliIO): number {
	try {
		const options: Record<string, { type: 'string' | 'boolean'; short?: string }> = {
			help: { type: 'boolean', short: 'h' },
			version: { type: 'boolean', short: 'v' },
			config: { type: 'string' },
			seed: { type: 'string' },
			keyboard: { type: 'string' },
			debug: { type: 'boolean' },
			engine: { type: 'string' },
			weights: { type: 'string' },
			fatigue: { type: 'string' },
		};
		for (const flag of Object.values(FLAGS)) options[flag] = { type: 'string' };

		const { values } = parseArgs({ args: argv, options, allowPositionals: false, strict: true });

		if (values.help) {
			io.stdout(HELP);
			return 0;
		}
		if (values.version) {
			io.stdout(version() + '\n');
			return 0;
		}

		const opts: SimcockifyOptions = {};
		if (typeof values.config === 'string') {
			applyValues(opts, loadConfig(values.config), `${values.config}: `);
		}

		const fromFlags: Record<string, unknown> = {};
		for (const [name, flag] of Object.entries(FLAGS)) {
			if (values[flag] !== undefined) fromFlags[name] = values[flag];
		}
		if (values.seed !== undefined) fromFlags.seed = values.seed;
		if (values.keyboard !== undefined) fromFlags.keyboard = values.keyboard;
		if (values.debug) fromFlags.debug = true;
		if (values.engine !== undefined) fromFlags.engine = values.engine;
		if (values.fatigue !== undefined) fromFlags.fatigue = values.fatigue;
		if (typeof values.weights === 'string') fromFlags.typoWeights = parseWeightsFlag(values.weights);
		applyValues(opts, fromFlags, '--');

		if (opts.debug) opts.logger = (m) => io.stderr(m + '\n');

		if (io.stdinIsTTY) {
			throw new UsageError('no input: pipe text on stdin (see --help)');
		}
		io.stdout(simcockify(io.stdin(), opts));
		return 0;
	} catch (e) {
		if (e instanceof UsageError || (e as NodeJS.ErrnoException).code?.startsWith('ERR_PARSE_ARGS')) {
			io.stderr(`simcockify: ${(e as Error).message}\nTry 'simcockify --help'.\n`);
			return 2;
		}
		io.stderr(`simcockify: ${(e as Error).message}\n`);
		return 1;
	}
}
