// Guesses the format of a text from its first 8 KB, optionally helped by a
// hint (a format name, a file name or an extension).
import { Format, formatMask, FORMATS } from './segment.js';

/** How much of the text detection reads. */
export const DETECT_BYTES = 8192;

/** Format names and extensions accepted as hints, mapped to a format. */
export const FORMAT_ALIASES: Readonly<Record<string, Format>> = {
	text: 'text',
	txt: 'text',
	plain: 'text',
	markdown: 'markdown',
	md: 'markdown',
	mdown: 'markdown',
	mkd: 'markdown',
	mdx: 'markdown',
	gfm: 'markdown',
	html: 'html',
	htm: 'html',
	xhtml: 'html',
	xml: 'html',
	svg: 'html',
	latex: 'latex',
	tex: 'latex',
	ltx: 'latex',
	sty: 'latex',
	cls: 'latex',
};

/**
 * The format a hint names: a format name or alias (`md`, `tex`), an
 * extension (`.md`) or a file name (`notes/draft.tex`). Undefined if unknown.
 */
export function formatFromHint(hint: string | undefined): Format | undefined {
	if (!hint) return undefined;
	const h = hint.trim().toLowerCase();
	if (h in FORMAT_ALIASES) return FORMAT_ALIASES[h];
	const ext = /\.([a-z0-9]+)$/.exec(h);
	return ext ? FORMAT_ALIASES[ext[1]] : undefined;
}

type Scored = Exclude<Format, 'text'>;

/** Decisive markers: the earliest one found settles the format (unless a hint says otherwise). */
const DECISIVE: [Scored, RegExp][] = [
	['html', /<!doctype\s|<html[\s>]|<\?xml\s/i],
	['latex', /\\documentclass(?![A-Za-z])|\\begin\{document\}/],
	['markdown', /^(?:---[ \t]*\r?\n(?:[^\n]*\n)*?[A-Za-z_][\w-]*:[^\n]*\n(?:[^\n]*\n)*?(?:---|\.\.\.)|\+\+\+[ \t]*\r?\n(?:[^\n]*\n)*?[A-Za-z_][\w-]*[ \t]*=[^\n]*\n(?:[^\n]*\n)*?\+\+\+)[ \t]*\r?(?:\n|$)/],
	['markdown', /^ {0,3}(`{3,}|~{3,})[^\n`]*\n[\s\S]*?\n {0,3}\1[ \t]*\r?$/m],
];

const count = (text: string, re: RegExp): number => text.match(re)?.length ?? 0;

/** Pairs of opening and closing tags with the same name. */
function balancedTags(text: string): number {
	const open = new Map<string, number>();
	const close = new Map<string, number>();
	for (const m of text.matchAll(/<(\/?)([A-Za-z][A-Za-z0-9-]*)(?=[\s/>])/g)) {
		const map = m[1] ? close : open;
		const name = m[2].toLowerCase();
		map.set(name, (map.get(name) ?? 0) + 1);
	}
	let pairs = 0;
	for (const [name, n] of open) pairs += Math.min(n, close.get(name) ?? 0);
	return pairs;
}

/** Environments with both a \begin and an \end. */
function environmentPairs(text: string): number {
	let pairs = 0;
	const ends = new Set([...text.matchAll(/\\end\{([^}\n]+)\}/g)].map((m) => m[1]));
	for (const m of text.matchAll(/\\begin\{([^}\n]+)\}/g)) if (ends.has(m[1])) pairs++;
	return pairs;
}

/** Evidence for each format, without the decisive markers. */
export function formatScores(text: string): Record<Scored, number> {
	const sample = text.slice(0, DETECT_BYTES);
	return {
		html:
			2 * balancedTags(sample) +
			0.5 * count(sample, /<(?:br|hr|img|meta|link|input)\b[^>]*>/gi) +
			0.25 * count(sample, /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi),
		latex:
			count(sample, /\\[A-Za-z]+\*?(?:\[[^\]\n]*\])?\{/g) +
			2 * environmentPairs(sample) +
			count(sample, /(?<![\\$])\$(?=[^\s$\d])[^$\n]*[^\s$\\]\$(?![\d$])/g) +
			count(sample, /\\\(|\\\[/g),
		markdown:
			2 * count(sample, /^ {0,3}#{1,6}[ \t]+\S/gm) +
			2 * count(sample, /!?\[[^\]\n]+\]\([^)\s]+(?:[ \t]+"[^"\n]*")?\)/g) +
			2 * count(sample, /^ {0,3}\[[^\]\n]+\]:[ \t]*\S+/gm) +
			count(sample, /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\S/gm) +
			count(sample, /\*\*[^*\n]+\*\*|__[^_\n]+__|(?<![\w*])\*[^*\s][^*\n]*\*(?![\w*])/g) +
			count(sample, /^ {0,3}>/gm) +
			3 * count(sample, /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*\|[ \t]*:?-{3,}:?/gm) +
			count(sample, /(?<!`)`[^`\n]+`(?!`)/g),
	};
}

/** Least evidence for a format other than text. */
const THRESHOLD = 2;
/** A runner-up within this share of the best score makes a close call. */
const CLOSE = 0.75;

/** The format whose segmentation protects more of the sample. */
function moreProtective(sample: string, a: Format, b: Format): Format {
	const covered = (f: Format): number => formatMask(sample, f).reduce((n, v) => n + v, 0);
	return covered(b) > covered(a) ? b : a;
}

/**
 * Guesses the format of `text` from its first 8 KB.
 *
 * - A doctype, `<html` or `<?xml` is decisive for html; `\documentclass` or
 *   `\begin{document}` for latex; front matter or a closed code fence for
 *   markdown. When several are present the earliest wins.
 * - Otherwise each format is scored (balanced tags; commands, environments
 *   and math; headings, links, lists, emphasis, quotes, tables and code) and
 *   the best score of at least 2 wins. If the runner-up is close (75% or
 *   more), the format whose segmentation protects more of the text wins.
 * - `hint` (a format name, extension or file name) is strong: it wins
 *   unless another format has a decisive marker and the hinted one has no
 *   evidence at all.
 */
export function detectFormat(text: string, hint?: string): Format {
	const sample = text.slice(0, DETECT_BYTES);
	const hinted = formatFromHint(hint);
	const scores = formatScores(sample);

	let decisive: Scored | undefined;
	let at = Infinity;
	for (const [format, re] of DECISIVE) {
		const m = re.exec(sample);
		if (m && m.index < at) {
			decisive = format;
			at = m.index;
		}
	}

	if (hinted) {
		const evidence = hinted === 'text' ? 0 : scores[hinted];
		return decisive && decisive !== hinted && evidence === 0 ? decisive : hinted;
	}
	if (decisive) return decisive;

	const ranked = (Object.entries(scores) as [Scored, number][]).sort((a, b) => b[1] - a[1]);
	const [[best, top], [second, next]] = ranked;
	if (top < THRESHOLD) return 'text';
	if (next >= THRESHOLD && next >= CLOSE * top) return moreProtective(sample, best, second);
	return best;
}

export { FORMATS };
