import type { Change } from './engine.js';
import type { RevealMode } from './options.js';

export interface DetailedResult {
	text: string;
	changes: Change[];
}

export function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);
}

const ANSI_MARK = '\x1b[4;31m'; // red, underlined
const ANSI_DIM = '\x1b[2m';
const ANSI_RESET = '\x1b[0m';

function splice(result: DetailedResult, wrap: (c: Change) => string): string {
	let out = '';
	let last = 0;
	for (const c of [...result.changes].sort((a, b) => a.index - b.index)) {
		out += result.text.slice(last, c.index) + wrap(c);
		last = c.index + c.replacement.length;
	}
	return out + result.text.slice(last);
}

/**
 * Renders a result with its changes marked:
 * - `html`: each change wrapped in `<span class="simcock" title="was: …">`; the
 *   replacement and the original are HTML-escaped, the surrounding text is left as is.
 * - `ansi`: the replacement red and underlined, then the original dimmed in brackets.
 * - `json`: `{ "text", "changes": [{ index, original, replacement, type }] }`.
 */
export function renderReveal(result: DetailedResult, mode: RevealMode): string {
	switch (mode) {
		case 'html':
			return splice(
				result,
				(c) => `<span class="simcock" title="was: ${escapeHtml(c.original)}">${escapeHtml(c.replacement)}</span>`,
			);
		case 'ansi':
			return splice(
				result,
				(c) => `${ANSI_MARK}${c.replacement}${ANSI_RESET}${ANSI_DIM}[${c.original}]${ANSI_RESET}`,
			);
		case 'json':
			return JSON.stringify({ text: result.text, changes: result.changes }, null, 2) + '\n';
		default:
			throw new Error(`unknown reveal mode: ${String(mode)}`);
	}
}

/**
 * Lists the changes between an input and a classic-engine output. The classic
 * engine never changes the length of the text, so the two are compared
 * position by position and grouped into runs between shared whitespace.
 */
export function diffSameLength(input: string, output: string, type: string): Change[] {
	if (input.length !== output.length) {
		return input === output ? [] : [{ index: 0, original: input, replacement: output, type }];
	}
	const changes: Change[] = [];
	const isSpace = (i: number): boolean => /\s/.test(input[i]) && /\s/.test(output[i]);
	let i = 0;
	while (i < input.length) {
		if (isSpace(i)) {
			i++;
			continue;
		}
		let j = i;
		while (j < input.length && !isSpace(j)) j++;
		if (input.slice(i, j) !== output.slice(i, j)) {
			changes.push({ index: i, original: input.slice(i, j), replacement: output.slice(i, j), type });
		}
		i = j;
	}
	return changes;
}
