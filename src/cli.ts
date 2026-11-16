import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { simcockify } from './core.js';
import { KEYBOARD_MAPS } from './keyboard.js';
import { NUMERIC_OPTIONS, SimcockifyOptions } from './options.js';

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
  --debug                          log activity to stderr
  --config <path.json>             read options from a JSON file; flags override it
  -h, --help                       show this help
  -v, --version                    show the version

Config files use the option names: ${NUMERIC_OPTIONS.join(', ')},
seed, keyboard, debug.
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
