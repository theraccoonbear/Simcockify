// Splits input into prose and protected segments. Each format marks the
// characters it protects in a mask; the engine only ever sees the prose.
import { htmlMask } from './html.js';
import { latexMask } from './latex.js';
import { Mask } from './mask.js';
import { markdownMask } from './markdown.js';

export const FORMATS = ['text', 'markdown', 'html', 'latex'] as const;
export type Format = (typeof FORMATS)[number];
/** A format, or `'auto'` to detect it from the text. */
export type FormatOption = Format | 'auto';

export interface Segment {
	text: string;
	/** True for text the engine may change; false for text copied through exactly. */
	prose: boolean;
}

const MASKERS: Record<Exclude<Format, 'text'>, (text: string) => Mask> = {
	markdown: markdownMask,
	html: htmlMask,
	latex: latexMask,
};

/**
 * The protection mask for `text` in `format` (all zeros for `text`). Line
 * breaks are always protected in the other formats, because they carry
 * structure (headings, list items, paragraphs) and the classic engine would
 * otherwise swap them.
 */
export function formatMask(text: string, format: Format): Mask {
	if (format === 'text') return new Uint8Array(text.length);
	const mask = MASKERS[format](text);
	for (let i = 0; i < text.length; i++) if (text[i] === '\n' || text[i] === '\r') mask[i] = 1;
	return mask;
}

/**
 * Splits `text` into alternating prose and protected segments for `format`.
 * Joining the segment texts gives `text` back exactly. For `'text'` the whole
 * input is one prose segment.
 */
export function segment(text: string, format: Format): Segment[] {
	if (!(FORMATS as readonly string[]).includes(format)) {
		throw new Error(`unknown format "${format}"; choose one of: ${FORMATS.join(', ')}`);
	}
	if (format === 'text') return [{ text, prose: true }];
	const mask = formatMask(text, format);
	const out: Segment[] = [];
	let start = 0;
	for (let i = 1; i <= text.length; i++) {
		if (i === text.length || mask[i] !== mask[start]) {
			out.push({ text: text.slice(start, i), prose: mask[start] === 0 });
			start = i;
		}
	}
	return out;
}
