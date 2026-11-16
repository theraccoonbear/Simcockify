// Markdown (GFM): a line pass finds block structure, then an inline pass finds
// code spans, links, autolinks, raw HTML and entities in what is left.
import { ENTITY, RAW_ELEMENTS } from './html.js';
import { Mask, protect, protectMatches } from './mask.js';

interface Line {
	start: number;
	/** The line without its "\n" (a trailing "\r" is kept). */
	text: string;
}

const BLANK = /^[ \t]*\r?$/;
/** Container prefix (blockquotes, then a list marker) before a code fence. */
const FENCE_OPEN = /^((?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?)(`{3,}|~{3,})([^\r]*)\r?$/;
const FENCE_CLOSE = /^(?:[ \t]*>[ \t]?)*[ \t]*(`{3,}|~{3,})[ \t]*\r?$/;
const RAW_BLOCK = /^[ \t]{0,3}<(script|pre|style|textarea)(?=[\s>]|$)/i;
const REFERENCE_DEFINITION = /^ {0,3}\[(?!\^)(?:[^\]\\]|\\.)+\]:[ \t]*(?:<[^>\n]*>|\S+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*\r?$/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*\r?$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*\r?$/;
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*\r?$/;
/** Blockquote markers, a list marker with an optional task box, a heading marker or footnote label. */
const LINE_PREFIX =
	/^((?:[ \t]*>[ \t]?)*)([ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+|(?=\r?$))(?:\[[ xX]\](?:[ \t]+|(?=\r?$)))?)?([ \t]*#{1,6}(?:[ \t]+|(?=\r?$)))?([ \t]*\[\^[^\]\s]+\]:[ \t]*)?/;
const HEADING_CLOSE = /[ \t]+#+[ \t]*\r?$/;

const AUTOLINK = /<(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>]+)>/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const RAW_INLINE = new RegExp(
	`<(${RAW_ELEMENTS.join('|')})(?=[\\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>[\\s\\S]*?<\\/\\1\\s*>`,
	'gi',
);
const HTML_TAG =
	/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;
const BARE_URL = /(?:\b[A-Za-z][A-Za-z0-9+.-]{1,31}:\/\/|\bwww\.)[^\s<>()[\]]*[^\s<>()[\].,:;!?'"*_~]/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const ESCAPE = /\\[!-/:-@[-`{-~]/g;

function splitLines(text: string): Line[] {
	const lines: Line[] = [];
	let start = 0;
	for (const t of text.split('\n')) {
		lines.push({ start, text: t });
		start += t.length + 1;
	}
	return lines;
}

/** Indentation width, counting a tab as reaching the next multiple of 4. */
function indentWidth(line: string): number {
	let w = 0;
	for (const c of line) {
		if (c === ' ') w++;
		else if (c === '\t') w += 4 - (w % 4);
		else break;
	}
	return w;
}

/** The line pass: front matter, code blocks, raw HTML blocks, definitions, breaks, tables and line markers. */
function protectBlocks(text: string, mask: Mask): void {
	const lines = splitLines(text);
	const protectLines = (a: number, b: number): void =>
		protect(mask, lines[a].start, lines[b].start + lines[b].text.length + 1);

	let i = 0;
	// Front matter: YAML between --- lines, or TOML between +++ lines, at the very start.
	const fm = /^(---|\+\+\+)[ \t]*\r?$/.exec(lines[0].text);
	if (fm) {
		const close = fm[1] === '---' ? /^(?:---|\.\.\.)[ \t]*\r?$/ : /^\+\+\+[ \t]*\r?$/;
		const j = lines.findIndex((l, k) => k > 0 && close.test(l.text));
		if (j > 0) {
			protectLines(0, j);
			i = j + 1;
		}
	}

	let inList = false;
	let inParagraph = false;
	let prevBlank = true;
	for (; i < lines.length; i++) {
		const line = lines[i].text;
		if (BLANK.test(line)) {
			prevBlank = true;
			inParagraph = false;
			continue;
		}

		const fence = FENCE_OPEN.exec(line);
		if (fence && !(fence[2][0] === '`' && fence[3].includes('`'))) {
			let j = i + 1;
			for (; j < lines.length; j++) {
				const c = FENCE_CLOSE.exec(lines[j].text);
				if (c && c[1][0] === fence[2][0] && c[1].length >= fence[2].length) break;
			}
			j = Math.min(j, lines.length - 1);
			protectLines(i, j);
			i = j;
			inParagraph = prevBlank = false;
			continue;
		}

		const raw = RAW_BLOCK.exec(line);
		if (raw) {
			const end = new RegExp(`</${raw[1]}\\s*>`, 'i');
			let j = i;
			while (j < lines.length - 1 && !end.test(lines[j].text)) j++;
			protectLines(i, j);
			i = j;
			inParagraph = prevBlank = false;
			continue;
		}

		const indent = indentWidth(line);
		if (indent >= 4 && !inList && !inParagraph) {
			protectLines(i, i); // indented code
			prevBlank = false;
			continue;
		}

		if (REFERENCE_DEFINITION.test(line)) {
			protectLines(i, i);
			prevBlank = false;
			continue;
		}

		if (THEMATIC_BREAK.test(line) || (inParagraph && SETEXT_UNDERLINE.test(line))) {
			protectLines(i, i);
			inParagraph = prevBlank = false;
			continue;
		}

		if (TABLE_DELIMITER.test(line) && line.includes('|') && inParagraph && lines[i - 1].text.includes('|')) {
			protectLines(i, i);
			const pipes = (k: number): void => {
				const l = lines[k];
				for (let c = 0; c < l.text.length; c++) {
					if (l.text[c] === '|' && l.text[c - 1] !== '\\') protect(mask, l.start + c, l.start + c + 1);
				}
			};
			pipes(i - 1);
			while (i + 1 < lines.length && !BLANK.test(lines[i + 1].text) && lines[i + 1].text.includes('|')) pipes(++i);
			inParagraph = prevBlank = false;
			continue;
		}

		const prefix = LINE_PREFIX.exec(line)!;
		protect(mask, lines[i].start, lines[i].start + prefix[0].length);
		const isHeading = prefix[3] !== undefined;
		if (isHeading) {
			const close = HEADING_CLOSE.exec(line);
			if (close && close.index >= prefix[0].length) {
				protect(mask, lines[i].start + close.index, lines[i].start + line.length);
			}
		}
		if (prefix[2] !== undefined) inList = true;
		else if (indent === 0 && prevBlank && !prefix[1]) inList = false;
		inParagraph = !isHeading;
		prevBlank = false;
	}
}

/** Code spans: a backtick run closed by the next run of the same length, not across a blank line. */
function protectCodeSpans(text: string, mask: Mask): void {
	const runs = [...text.matchAll(/`+/g)].filter((m) => !mask[m.index!]);
	for (let k = 0; k < runs.length; k++) {
		const open = runs[k];
		if (text[open.index! - 1] === '\\') continue;
		for (let l = k + 1; l < runs.length; l++) {
			const close = runs[l];
			if (/\n[ \t]*\r?\n/.test(text.slice(open.index!, close.index!))) break;
			if (close[0].length !== open[0].length) continue;
			protect(mask, open.index!, close.index! + close[0].length);
			k = l;
			break;
		}
	}
}

function skipSpace(text: string, k: number): number {
	let newlines = 0;
	while (k < text.length && /[ \t\r\n]/.test(text[k])) {
		if (text[k] === '\n' && ++newlines > 1) break;
		k++;
	}
	return k;
}

/** Given the index of "(" after "]", returns the index of the closing ")", or -1. */
function inlineDestinationEnd(text: string, open: number): number {
	let k = skipSpace(text, open + 1);
	if (text[k] === '<') {
		const close = text.indexOf('>', k);
		if (close < 0 || text.slice(k, close).includes('\n')) return -1;
		k = close + 1;
	} else {
		let depth = 0;
		while (k < text.length && !/\s/.test(text[k])) {
			if (text[k] === '\\') k++;
			else if (text[k] === '(') depth++;
			else if (text[k] === ')') {
				if (depth === 0) break;
				depth--;
			}
			k++;
		}
	}
	k = skipSpace(text, k);
	const q = text[k];
	if (q === '"' || q === "'" || q === '(') {
		const closer = q === '(' ? ')' : q;
		k++;
		while (k < text.length && text[k] !== closer) k += text[k] === '\\' ? 2 : 1;
		if (k >= text.length) return -1;
		k = skipSpace(text, k + 1);
	}
	return text[k] === ')' ? k : -1;
}

/**
 * Links and images: the brackets, the URL and title of inline links, the
 * label of reference links, and footnote references are protected; link
 * text and alt text stay prose.
 */
function protectLinks(text: string, mask: Mask): void {
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== '[' || mask[i] || text[i - 1] === '\\') continue;
		// Find the matching "]", skipping escapes and protected text, not across a blank line.
		let depth = 1;
		let j = i + 1;
		for (; j < text.length; j++) {
			if (mask[j]) continue;
			const c = text[j];
			if (c === '\\') j++;
			else if (c === '[') depth++;
			else if (c === ']' && --depth === 0) break;
			else if (c === '\n' && /^\n[ \t]*\r?(?:\n|$)/.test(text.slice(j, j + 80))) {
				j = text.length;
			}
		}
		if (j >= text.length) continue;
		const start = text[i - 1] === '!' && !mask[i - 1] ? i - 1 : i;
		if (text[i + 1] === '^') {
			protect(mask, start, j + 1); // footnote reference
			continue;
		}
		if (text[j + 1] === '(') {
			const end = inlineDestinationEnd(text, j + 1);
			if (end > 0) {
				protect(mask, start, i + 1);
				protect(mask, j, end + 1);
			}
		} else if (text[j + 1] === '[') {
			const end = text.indexOf(']', j + 2);
			if (end > 0 && !text.slice(j + 2, end).includes('\n')) {
				protect(mask, start, i + 1);
				protect(mask, j, end + 1);
			}
		}
	}
}

/**
 * Protects front matter, fenced and indented code, inline code, link and
 * image URLs and titles, reference definitions, autolinks and bare URLs,
 * raw HTML (tags, comments, and script/style/pre/code/textarea contents),
 * entities, escapes, table pipes and delimiter rows, thematic breaks,
 * setext underlines, and heading, list, task and blockquote markers.
 */
export function markdownMask(text: string): Mask {
	const mask = new Uint8Array(text.length);
	protectBlocks(text, mask);
	protectCodeSpans(text, mask);
	protectMatches(text, mask, AUTOLINK);
	protectMatches(text, mask, HTML_COMMENT);
	protectMatches(text, mask, RAW_INLINE);
	protectMatches(text, mask, HTML_TAG);
	protectLinks(text, mask);
	protectMatches(text, mask, BARE_URL);
	protectMatches(text, mask, EMAIL);
	protectMatches(text, mask, ENTITY);
	protectMatches(text, mask, ESCAPE);
	return mask;
}
