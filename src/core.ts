import { createClassicSimcockifier } from './classic.js';
import { KeyboardMap } from './keyboard.js';
import { DEFAULT_OPTIONS, Engine, ENGINES, readConditions, SimcockifyOptions } from './options.js';
import { createRandom } from './random.js';

/**
 * Builds a function that applies typos to text. All calls share one PRNG
 * stream, so a sequence of texts is repeatable as a whole.
 */
export function createSimcockifier(options: SimcockifyOptions = {}): (text: string) => string {
	const engine: Engine = options.engine ?? DEFAULT_OPTIONS.engine;
	if (!ENGINES.includes(engine)) {
		throw new Error(`unknown engine "${engine}"; choose one of: ${ENGINES.join(', ')}`);
	}
	const keyboard: KeyboardMap = options.keyboardType ?? DEFAULT_OPTIONS.keyboardType;
	const random = options.random ?? createRandom(options.seed);
	const log = (msg: string): void => {
		if (options.debug) (options.logger ?? console.log)(msg);
	};
	return createClassicSimcockifier(readConditions(options), keyboard, random, log);
}

/** Returns `text` with typos injected. Same seed and options give the same output. */
export function simcockify(text: string, options: SimcockifyOptions = {}): string {
	return createSimcockifier(options)(text);
}
