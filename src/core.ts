import { createClassicSimcockifier } from './classic.js';
import { runWordEngine, SegmentResult, slipDistanceFor } from './engine.js';
import { detectFormat } from './formats/detect.js';
import { Format, FORMATS, segment } from './formats/segment.js';
import { KeyboardMap } from './keyboard.js';
import {
	DEFAULT_OPTIONS,
	DEFAULT_TYPO_WEIGHTS,
	Engine,
	ENGINES,
	num,
	readConditions,
	REVEAL_MODES,
	SimcockifyOptions,
	TypoType,
	TYPO_TYPES,
	TypoWeights,
	typoRate,
	typoVelocity,
} from './options.js';
import { PERSONAS } from './personas.js';
import { createRandom, createSeededRandom } from './random.js';
import { DetailedResult, diffSameLength, renderReveal } from './reveal.js';

export type { Change, SegmentResult } from './engine.js';
export type { DetailedResult } from './reveal.js';
export { renderReveal };

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
	if (o.format !== undefined && o.format !== 'auto' && !FORMATS.includes(o.format)) {
		throw new Error(`unknown format "${o.format}"; choose one of: auto, ${FORMATS.join(', ')}`);
	}
	if (o.reveal !== undefined && !REVEAL_MODES.includes(o.reveal)) {
		throw new Error(`unknown reveal mode "${o.reveal}"; choose one of: ${REVEAL_MODES.join(', ')}`);
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
 * classic engine processes each segment separately, as 1.x did; its change
 * list comes from comparing input and output (it never changes the length).
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
		return (segments) =>
			segments.map((input) => {
				const text = apply(input);
				return { text, changes: diffSameLength(input, text, 'classic') };
			});
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

/** The format to use for `text`: `'text'` when unset, detected when `'auto'`. */
function formatFor(text: string, options: SimcockifyOptions): Format {
	const f = options.format ?? 'text';
	return f === 'auto' ? detectFormat(text) : f;
}

/**
 * Runs the engine over the prose segments of `text` only and stitches the
 * protected segments back in, shifting each change's index to the output.
 * Segments without letters are skipped, so they never consume the PRNG.
 * The `'text'` format is one segment, exactly as without formats.
 */
function runFormatted(text: string, options: SimcockifyOptions, run: SegmentsRunner): SegmentResult {
	const format = formatFor(text, options);
	if (options.debug) (options.logger ?? console.log)(`Format: ${format}`);
	if (format === 'text') return run([text])[0];
	const segments = segment(text, format);
	const prose = segments.flatMap((s, i) => (s.prose && /\p{L}/u.test(s.text) ? [i] : []));
	const results = run(prose.map((i) => segments[i].text));
	const byIndex = new Map(prose.map((i, k) => [i, results[k]]));
	let out = '';
	const changes: SegmentResult['changes'] = [];
	segments.forEach((s, i) => {
		const r = byIndex.get(i);
		if (!r) {
			out += s.text;
			return;
		}
		for (const c of r.changes) changes.push({ ...c, index: c.index + out.length });
		out += r.text;
	});
	return { text: out, changes };
}

/**
 * Builds a function that applies typos to text. All calls share one PRNG
 * stream, so a sequence of texts is repeatable as a whole. If `reveal` is
 * set, the returned text is rendered in that mode.
 */
export function createSimcockifier(options: SimcockifyOptions = {}): (text: string) => string {
	const run = createRunner(options);
	const resolved = resolveOptions(options);
	const reveal = resolved.reveal;
	return (text) => {
		const result = runFormatted(text, resolved, run);
		return reveal ? renderReveal(result, reveal) : result.text;
	};
}

/**
 * Returns `text` with typos injected. Same seed and options give the same
 * output. With `reveal`, the result is marked up as HTML, ANSI or JSON.
 */
export function simcockify(text: string, options: SimcockifyOptions = {}): string {
	return createSimcockifier(options)(text);
}

/**
 * Returns the altered text and the list of changes, each
 * `{ index, original, replacement, type }` with `index` the offset of
 * `replacement` in `text`. `reveal` is ignored.
 */
export function simcockifyDetailed(text: string, options: SimcockifyOptions = {}): DetailedResult {
	return runFormatted(text, resolveOptions(options), createRunner(options));
}

/**
 * Applies typos to several pieces of text as one document (fatigue runs across
 * all of them in order) and returns each piece's text and changes. Each piece
 * is treated as prose; `format` is ignored. Used by the DOM helper for an
 * element's text nodes.
 */
export function simcockifySegments(segments: string[], options: SimcockifyOptions = {}): SegmentResult[] {
	return createRunner(options)(segments);
}
