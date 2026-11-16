import { simcockifySegments } from './core.js';
import type { Change } from './engine.js';
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

/** Replaces `node` with text nodes and `<span class="simcock">` elements marking each change. */
function wrapChanges(node: Text, text: string, changes: Change[]): void {
	const doc = node.ownerDocument;
	const parts: Node[] = [];
	let last = 0;
	for (const c of changes) {
		if (c.index > last) parts.push(doc.createTextNode(text.slice(last, c.index)));
		const span = doc.createElement('span');
		span.className = 'simcock';
		span.setAttribute('title', `was: ${c.original}`);
		span.appendChild(doc.createTextNode(c.replacement));
		parts.push(span);
		last = c.index + c.replacement.length;
	}
	if (last < text.length) parts.push(doc.createTextNode(text.slice(last)));
	node.replaceWith(...parts);
}

/**
 * Applies typos to every text node under `el`, in place. Elements matching
 * `options.exclude` (default `.no-simcockify`) are left untouched. The text
 * nodes are treated as one document in order, so fatigue runs across the
 * whole element. With `reveal` set (any mode), each changed word is wrapped
 * in `<span class="simcock" title="was: …">`, built as DOM nodes.
 */
export function simcockifyElement(el: Element, options: SimcockifyOptions = {}): void {
	const exclude = options.exclude ?? DEFAULT_OPTIONS.exclude;
	const nodes = textNodes(el, exclude);
	const results = simcockifySegments(
		nodes.map((n) => n.textContent ?? ''),
		options,
	);
	nodes.forEach((node, i) => {
		const { text, changes } = results[i];
		if (options.reveal && changes.length > 0) {
			wrapChanges(node, text, changes);
		} else if (text !== node.textContent) {
			node.textContent = text;
		}
	});
}
