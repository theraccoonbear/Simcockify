import { createClassicSimcockifier } from './classic.js';
import { runWordEngine, SegmentResult, slipDistanceFor } from './engine.js';
import { KeyboardMap } from './keyboard.js';
import { DEFAULT_OPTIONS, Engine, ENGINES, readConditions, SimcockifyOptions, typoRate, typoVelocity } from './options.js';
import { createRandom, createSeededRandom } from './random.js';

export type { Change, SegmentResult } from './engine.js';

type SegmentsRunner = (segments: string[]) => SegmentResult[];

/**
 * Builds a runner over arrays of text segments sharing one PRNG stream. The
 * classic engine processes each segment separately, as 1.x did, and reports
 * no change list.
 */
function createRunner(options: SimcockifyOptions): SegmentsRunner {
	const engine: Engine = options.engine ?? DEFAULT_OPTIONS.engine;
	if (!ENGINES.includes(engine)) {
		throw new Error(`unknown engine "${engine}"; choose one of: ${ENGINES.join(', ')}`);
	}
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
		keyboard,
		slipDistance: slipDistanceFor(velocity),
		random: options.random ?? createSeededRandom(options.seed),
		log,
	};
	return (segments) => {
		log(`TEXT: ${JSON.stringify(segments.join(''))}`);
		log(`Rate ${rate.toFixed(3)} typos per word, velocity ${velocity}`);
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
 * Applies typos to several pieces of text in order with one PRNG stream and
 * returns each piece's text and changes. Used by the DOM helper.
 */
export function simcockifySegments(segments: string[], options: SimcockifyOptions = {}): SegmentResult[] {
	return createRunner(options)(segments);
}
