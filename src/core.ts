import { createClassicSimcockifier } from './classic.js';
import { runWordEngine, SegmentResult, slipDistanceFor } from './engine.js';
import { KeyboardMap } from './keyboard.js';
import {
	DEFAULT_OPTIONS,
	DEFAULT_TYPO_WEIGHTS,
	Engine,
	ENGINES,
	num,
	readConditions,
	SimcockifyOptions,
	TypoType,
	TYPO_TYPES,
	TypoWeights,
	typoRate,
	typoVelocity,
} from './options.js';
import { PERSONAS } from './personas.js';
import { createRandom, createSeededRandom } from './random.js';

export type { Change, SegmentResult } from './engine.js';

type SegmentsRunner = (segments: string[]) => SegmentResult[];

/** The options a persona contributes; `{}` when `name` is undefined. Throws on an unknown name. */
export function personaOptions(name: string | undefined): SimcockifyOptions {
	if (name === undefined) return {};
	const persona = PERSONAS[name];
	if (!persona) throw new Error(`unknown persona "${name}"; choose one of: ${Object.keys(PERSONAS).join(', ')}`);
	return persona.options;
}

function withoutUndefined(o: SimcockifyOptions): SimcockifyOptions {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/**
 * Layers option objects, lowest priority first, with plain object spreads:
 *
 *     layerOptions(DEFAULT_OPTIONS, persona, configFile, flags)
 *       = { ...DEFAULT_OPTIONS, ...persona, ...configFile, ...flags }
 *
 * Two details: keys set to `undefined` do not override lower layers, and
 * `typoWeights` is spread per key in the same order, so a layer can change
 * one weight without restating the rest.
 */
export function layerOptions(...layers: (SimcockifyOptions | undefined)[]): SimcockifyOptions {
	let out: SimcockifyOptions = {};
	let weights: TypoWeights = {};
	for (const layer of layers) {
		if (!layer) continue;
		const defined = withoutUndefined(layer);
		out = { ...out, ...defined };
		weights = { ...weights, ...defined.typoWeights };
	}
	return { ...out, typoWeights: weights };
}

/**
 * Resolves options as `{ ...DEFAULT_OPTIONS, ...PERSONAS[options.persona], ...options }`
 * (see `layerOptions`) and validates the result. Throws on an unknown
 * persona, engine or weight name, or a negative weight.
 */
export function resolveOptions(options: SimcockifyOptions = {}): SimcockifyOptions & {
	typoWeights: Record<TypoType, number>;
} {
	const o = layerOptions(DEFAULT_OPTIONS, personaOptions(options.persona), options);
	if (o.engine !== undefined && !ENGINES.includes(o.engine)) {
		throw new Error(`unknown engine "${o.engine}"; choose one of: ${ENGINES.join(', ')}`);
	}
	const weights = { ...DEFAULT_TYPO_WEIGHTS };
	for (const [k, v] of Object.entries(o.typoWeights ?? {})) {
		if (!(TYPO_TYPES as readonly string[]).includes(k)) {
			throw new Error(`unknown typo weight "${k}"; choose from: ${TYPO_TYPES.join(', ')}`);
		}
		const n = Number(v);
		if (!Number.isFinite(n) || n < 0) throw new Error(`typo weight "${k}" must be a number >= 0`);
		weights[k as TypoType] = n;
	}
	return { ...o, typoWeights: weights };
}

/**
 * Builds a runner over arrays of text segments sharing one PRNG stream. The
 * classic engine processes each segment separately, as 1.x did, and reports
 * no change list.
 */
function createRunner(input: SimcockifyOptions): SegmentsRunner {
	const options = resolveOptions(input);
	const engine: Engine = options.engine ?? DEFAULT_OPTIONS.engine;
	const conditions = readConditions(options);
	const keyboard: KeyboardMap = options.keyboardType ?? DEFAULT_OPTIONS.keyboardType;
	const log = (msg: string): void => {
		if (options.debug) (options.logger ?? console.log)(msg);
	};

	if (engine === 'classic') {
		const apply = createClassicSimcockifier(conditions, keyboard, options.random ?? createRandom(options.seed), log);
		return (segments) => segments.map((input) => ({ text: apply(input), changes: [] }));
	}

	const rate = typoRate(conditions);
	const velocity = typoVelocity(conditions);
	const settings = {
		rate,
		fatigue: num(options.fatigue, DEFAULT_OPTIONS.fatigue),
		weights: options.typoWeights,
		keyboard,
		slipDistance: slipDistanceFor(velocity),
		random: options.random ?? createSeededRandom(options.seed),
		log,
	};
	return (segments) => {
		log(`TEXT: ${JSON.stringify(segments.join(''))}`);
		log(`Rate ${rate.toFixed(3)} typos per word, velocity ${velocity}, fatigue ${settings.fatigue}`);
		const results = runWordEngine(segments, settings);
		log(`Changed ${results.reduce((n, r) => n + r.changes.length, 0)} word(s)`);
		return results;
	};
}

/**
 * Builds a function that applies typos to text. All calls share one PRNG
 * stream, so a sequence of texts is repeatable as a whole.
 */
export function createSimcockifier(options: SimcockifyOptions = {}): (text: string) => string {
	const run = createRunner(options);
	return (text) => run([text])[0].text;
}

/** Returns `text` with typos injected. Same seed and options give the same output. */
export function simcockify(text: string, options: SimcockifyOptions = {}): string {
	return createSimcockifier(options)(text);
}

/**
 * Applies typos to several pieces of text as one document (fatigue runs across
 * all of them in order) and returns each piece's text and changes. Used by
 * the DOM helper for an element's text nodes.
 */
export function simcockifySegments(segments: string[], options: SimcockifyOptions = {}): SegmentResult[] {
	return createRunner(options)(segments);
}
