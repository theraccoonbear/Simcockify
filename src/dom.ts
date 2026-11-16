import { simcockifySegments } from './core.js';
import { DEFAULT_OPTIONS, SimcockifyOptions } from './options.js';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT']);

/** Text nodes under `el` in document order, skipping excluded elements. */
function textNodes(el: Element, exclude: string): Text[] {
	const out: Text[] = [];
	const walk = (node: Node): void => {
		if (node.nodeType === 3) {
			out.push(node as Text);
		} else if (node.nodeType === 1) {
			const e = node as Element;
			if (SKIP_TAGS.has(e.tagName.toUpperCase())) return;
			if (exclude && e.matches(exclude)) return;
			Array.from(e.childNodes).forEach(walk);
		}
	};
	walk(el);
	return out;
}

/**
 * Applies typos to every text node under `el`, in place. Elements matching
 * `options.exclude` (default `.no-simcockify`) are left untouched. One PRNG
 * stream is shared across the text nodes, in document order.
 */
export function simcockifyElement(el: Element, options: SimcockifyOptions = {}): void {
	const exclude = options.exclude ?? DEFAULT_OPTIONS.exclude;
	const nodes = textNodes(el, exclude);
	const results = simcockifySegments(
		nodes.map((n) => n.textContent ?? ''),
		options,
	);
	nodes.forEach((node, i) => {
		if (results[i].text !== node.textContent) node.textContent = results[i].text;
	});
}
