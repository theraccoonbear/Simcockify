import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { layerOptions, personaOptions, simcockify } from './core.js';
import { detectFormat, FORMAT_ALIASES } from './formats/detect.js';
import { FORMATS } from './formats/segment.js';
import { KEYBOARD_MAPS } from './keyboard.js';
import {
	DEFAULT_OPTIONS,
	DEFAULT_TYPO_WEIGHTS,
	Engine,
	ENGINES,
	NUMERIC_OPTIONS,
	readConditions,
	REVEAL_MODES,
	RevealMode,
	SimcockifyOptions,
	TYPO_TYPES,
	TypoWeights,
	typoRate,
	typoVelocity,
} from './options.js';
import { PERSONAS } from './personas.js';
import { isShorthandSpec, parseShorthand } from './shorthand.js';

const FLAGS: Record<(typeof NUMERIC_OPTIONS)[number], string> = {
	FiveHourEnergies: 'five-hour-energies',
	Espressos: 'espressos',
	Coffees: 'coffees',
	HoursOfSleep: 'hours-of-sleep',
	MinutesTalkingToClients: 'minutes-talking-to-clients',
	DeadlinesLooming: 'deadlines-looming',
	EmployeesBlocked: 'employees-blocked',
};

const HELP = `Usage: simcockify [options] [spec] [file]
       command | simcockify [options] [spec]

Reads the file (or stdin when no file is named) and writes the text with
typos injected to stdout.

  cat my-document.md | simcockify fhe:3,eb:8 > human-document.md
  simcockify s:demo,p:post-launch notes.txt

Shorthand spec: one positional key:value[,key:value...] argument, keys:
  c   Coffees                    e    Espressos
  fhe FiveHourEnergies           hos  HoursOfSleep
  mtc MinutesTalkingToClients    dl   DeadlinesLooming
  eb  EmployeesBlocked           s    seed
  f   fatigue                    p    persona
  Full option names (any case), flag names such as five-hour-energies, and
  engine, reveal, keyboard and format work as keys too.
  e.g. fhe:3,eb:8  s:demo,p:post-launch  dl:10,format:md
  A positional argument is read as a spec if it looks like key:value, else as
  an input file if one exists by that name; anything else is an error.

Formats: only prose gets typos. Code, markup, URLs, math and the like are
copied exactly.
  --format <name>                  auto (default), text, markdown (md), html (htm, xml)
                                   or latex (tex). auto scores the first 8 KB; a file's
                                   extension is a strong hint. --format overrides both.

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
  --reveal [html|ansi|json]        mark what changed (default ansi): HTML spans, coloured
                                   terminal output, or JSON with the list of changes
  --persona <name>                 preset conditions, weights and fatigue (see --list-personas)
  --fatigue <n>                    -1..1; >0 starts clean and ends messier, <0 the reverse (default 0)
  --weights <json>                 relative typo weights (word engine), e.g. '{"transpose":3,"homophone":0}'
                                   types: ${TYPO_TYPES.join(', ')}
  --debug                          log activity to stderr
  --config <path.json>             read options from a JSON file; flags override it
  --list-personas                  list the personas and exit
  -h, --help                       show this help
  -v, --version                    show the version

Config files use the option names: ${NUMERIC_OPTIONS.join(', ')},
seed, keyboard, debug, engine, persona, fatigue, reveal, format, typoWeights (an object of typo weights).

Options are layered lowest first: defaults, then the persona, then the
config file, then the shorthand spec, then flags. Typo weights layer per key.
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
			opts.typoWeights = weightsFrom(`${source}typoWeights`, value);
		} else if (key === 'reveal') {
			if (typeof value !== 'string' || !(REVEAL_MODES as readonly string[]).includes(value)) {
				throw new UsageError(`${source}reveal must be one of: ${REVEAL_MODES.join(', ')}`);
			}
			opts.reveal = value as RevealMode;
		} else if (key === 'format') {
			const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
			if (name !== 'auto' && !(name in FORMAT_ALIASES)) {
				throw new UsageError(
					`${source}format must be one of: auto, ${FORMATS.join(', ')} (or md, htm, xml, tex, txt)`,
				);
			}
			opts.format = name === 'auto' ? 'auto' : FORMAT_ALIASES[name];
		} else if (key === 'persona') {
			if (typeof value !== 'string' || !(value in PERSONAS)) {
				throw new UsageError(`${source}persona must be one of: ${Object.keys(PERSONAS).join(', ')}`);
			}
			opts.persona = value;
		} else {
			throw new UsageError(`unknown option ${source}${key}`);
		}
	}
}

/**
 * parseArgs has no optional values, so a bare `--reveal` (followed by
 * nothing, another flag, or anything that is not a mode) gets the default
 * mode, ansi.
 */
function normaliseArgs(argv: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		out.push(argv[i]);
		if (argv[i] === '--reveal' && !(REVEAL_MODES as readonly string[]).includes(argv[i + 1])) out.push('ansi');
	}
	return out;
}

/** Lists the personas with their typo rate, velocity, fatigue and non-default weights. */
function listPersonas(): string {
	const lines: string[] = [];
	for (const [name, p] of Object.entries(PERSONAS)) {
		const c = readConditions(p.options);
		const weights = Object.entries(p.options.typoWeights ?? {})
			.filter(([k, v]) => DEFAULT_TYPO_WEIGHTS[k as keyof typeof DEFAULT_TYPO_WEIGHTS] !== v)
			.map(([k, v]) => `${k} ${v}`)
			.join(', ');
		lines.push(`${name}\n  ${p.description}`);
		lines.push(
			`  rate ${typoRate(c).toFixed(2)}/word, velocity ${typoVelocity(c)}, fatigue ${p.options.fatigue ?? 0}` +
				(weights ? `; weights: ${weights}` : ''),
		);
	}
	return lines.join('\n') + '\n';
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * Sorts positional arguments into shorthand specs and at most one input file.
 * A spec is recognised first, so `fhe:3` is always a spec; otherwise the
 * argument must name an existing file. `-` means stdin.
 */
function classifyPositionals(positionals: string[]): { specs: string[]; inputPath?: string } {
	const specs: string[] = [];
	let inputPath: string | undefined;
	let sawStdin = false;
	for (const arg of positionals) {
		if (isShorthandSpec(arg)) {
			specs.push(arg);
			continue;
		}
		if (arg !== '-' && !isFile(arg)) {
			const what = arg.includes(':')
				? 'a key:value spec (check for spaces or a missing value) or an existing file'
				: 'an existing file or a key:value spec';
			throw new UsageError(`"${arg}" is not ${what}`);
		}
		if (inputPath !== undefined || sawStdin) throw new UsageError('only one input file can be given');
		if (arg === '-') sawStdin = true;
		else inputPath = arg;
	}
	return { specs, inputPath };
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
			persona: { type: 'string' },
			reveal: { type: 'string' },
			format: { type: 'string' },
			'list-personas': { type: 'boolean' },
		};
		for (const flag of Object.values(FLAGS)) options[flag] = { type: 'string' };

		const { values, positionals } = parseArgs({
			args: normaliseArgs(argv),
			options,
			allowPositionals: true,
			strict: true,
		});

		if (values.help) {
			io.stdout(HELP);
			return 0;
		}
		if (values.version) {
			io.stdout(version() + '\n');
			return 0;
		}
		if (values['list-personas']) {
			io.stdout(listPersonas());
			return 0;
		}

		const configFile: SimcockifyOptions = {};
		if (typeof values.config === 'string') {
			applyValues(configFile, loadConfig(values.config), `${values.config}: `);
		}

		const shorthand: SimcockifyOptions = {};
		const { specs, inputPath } = classifyPositionals(positionals);
		for (const spec of specs) {
			let entries;
			try {
				entries = parseShorthand(spec);
			} catch (e) {
				throw new UsageError((e as Error).message);
			}
			for (const { key, option, value } of entries) {
				applyValues(shorthand, { [option]: value }, `shorthand ${key}:${value}: `);
			}
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
		if (values.persona !== undefined) fromFlags.persona = values.persona;
		if (values.reveal !== undefined) fromFlags.reveal = values.reveal;
		if (values.format !== undefined) fromFlags.format = values.format;
		if (typeof values.weights === 'string') fromFlags.typoWeights = parseWeightsFlag(values.weights);
		const flags: SimcockifyOptions = {};
		applyValues(flags, fromFlags, '--');

		// Lowest priority first: { ...DEFAULT_OPTIONS, ...persona, ...configFile, ...shorthand, ...flags }.
		const persona = personaOptions(flags.persona ?? shorthand.persona ?? configFile.persona);
		const opts = layerOptions(DEFAULT_OPTIONS, persona, configFile, shorthand, flags);

		if (opts.debug) opts.logger = (m) => io.stderr(m + '\n');

		let input: string;
		if (inputPath !== undefined) {
			try {
				input = readFileSync(inputPath, 'utf8');
			} catch (e) {
				throw new UsageError(`cannot read ${inputPath}: ${(e as Error).message}`);
			}
		} else if (io.stdinIsTTY) {
			throw new UsageError('no input: pipe text on stdin or name a file (see --help)');
		} else {
			input = io.stdin();
		}
		// The CLI detects the format unless told otherwise; a file name is a strong hint.
		if (opts.format === undefined || opts.format === 'auto') opts.format = detectFormat(input, inputPath);
		io.stdout(simcockify(input, opts));
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
