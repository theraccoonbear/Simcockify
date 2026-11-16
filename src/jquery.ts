import { createRandom } from './random.js';
import { simcockifyElement } from './dom.js';
import { SimcockifyOptions } from './options.js';

/** The slice of jQuery this adapter touches. */
export interface JQueryLike {
	fn: Record<string, unknown>;
	extend(...args: unknown[]): unknown;
}

/**
 * Registers `$.fn.simcockify(options)` and `$.seedPRNG(seed)` on a jQuery.
 * After `$.seedPRNG`, calls share one PRNG stream unless they pass their own
 * `seed` or `random`.
 */
export function install($: JQueryLike): void {
	let shared: (() => number) | undefined;

	($ as unknown as { seedPRNG: (seed?: number | string) => void }).seedPRNG = (seed) => {
		shared = createRandom(seed);
	};

	$.fn.simcockify = function (this: { each(cb: (this: Element) => void): unknown }, options?: SimcockifyOptions) {
		const opts: SimcockifyOptions = { ...options };
		if (opts.random === undefined && opts.seed === undefined && shared) opts.random = shared;
		return this.each(function () {
			simcockifyElement(this, opts);
		});
	};
}
