import { createSimcockifier } from './core.js';
import { DEFAULT_OPTIONS, SimcockifyOptions } from './options.js';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

/**
 * Applies typos to every text node under `el`, in place. Elements matching
 * `options.exclude` (default `.no-simcockify`) are left untouched. One PRNG
 * stream is shared across the whole walk.
 */
export function simcockifyElement(el: Element, options: SimcockifyOptions = {}): void {
	const exclude = options.exclude ?? DEFAULT_OPTIONS.exclude;
	const apply = createSimcockifier(options);

	const walk = (node: Node): void => {
		if (node.nodeType === 3) {
			node.textContent = apply(node.textContent ?? '');
		} else if (node.nodeType === 1) {
			const e = node as Element;
			if (SKIP_TAGS.has(e.tagName.toUpperCase())) return;
			if (exclude && e.matches(exclude)) return;
			Array.from(e.childNodes).forEach(walk);
		}
	};
	walk(el);
}
