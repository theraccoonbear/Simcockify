// LaTeX: commands, math, verbatim, comments and non-prose arguments are
// protected; the text of arguments such as \section{...} or \emph{...} stays prose.
import { Mask, protect, protectMatches } from './mask.js';

const VERBATIM_ENVS = ['verbatim\\*?', 'Verbatim\\*?', 'BVerbatim', 'LVerbatim', 'lstlisting', 'minted', 'comment', 'alltt'];
const MATH_ENVS = [
	'equation',
	'align',
	'alignat',
	'flalign',
	'gather',
	'multline',
	'eqnarray',
	'math',
	'displaymath',
	'split',
	'dmath',
	'IEEEeqnarray',
	'tikzpicture',
];

const VERBATIM_ENV = new RegExp(`\\\\begin\\{(${VERBATIM_ENVS.join('|')})\\}[\\s\\S]*?(?:\\\\end\\{\\1\\}|$)`, 'g');
const MATH_ENV = new RegExp(`\\\\begin\\{((?:${MATH_ENVS.join('|')})\\*?)\\}[\\s\\S]*?(?:\\\\end\\{\\1\\}|$)`, 'g');
const VERB = /\\(?:verb\*?|lstinline(?:\[[^\]\n]*\])?|mintinline\{[^}\n]*\})(?:([^\sA-Za-z{])[^\n]*?\1|\{[^}\n]*\})/g;
const DISPLAY_MATH = /(?<!\\)\$\$[\s\S]+?\$\$|(?<!\\)\\\[[\s\S]*?\\\]|(?<!\\)\\\([\s\S]*?\\\)/g;
const INLINE_MATH = /(?<!\\)\$(?:\\[\s\S]|[^$\\])+?\$/g;
/** Commands whose arguments (every bracket and brace group that follows) are not prose. */
const ARGUMENT_COMMANDS = [
	'ref', 'eqref', 'pageref', 'autoref', 'cref', 'Cref', 'vref', 'nameref', 'label',
	'cite[A-Za-z]*', 'Cite[A-Za-z]*', 'nocite', 'parencite', 'textcite', 'footcite', 'bibitem',
	'url', 'nolinkurl', 'path', 'includegraphics', 'input', 'include', 'includeonly', 'subfile',
	'bibliography', 'bibliographystyle', 'addbibresource', 'usepackage', 'RequirePackage', 'documentclass',
	'newcommand', 'renewcommand', 'providecommand', 'newenvironment', 'renewenvironment', 'DeclareMathOperator',
	'newtheorem', 'newlength', 'setlength', 'addtolength', 'settowidth', 'setcounter', 'addtocounter', 'numberwithin',
	'hspace', 'vspace', 'graphicspath', 'hypersetup', 'geometry', 'definecolor', 'color', 'pagestyle',
	'thispagestyle', 'pagenumbering', 'lstset', 'lstinputlisting', 'inputminted', 'usetikzlibrary', 'tikzset',
];
/** Commands where only the first brace group (after any options) is not prose. */
const FIRST_ARGUMENT_COMMANDS = ['href', 'textcolor', 'colorbox', 'hyperref', 'fcolorbox'];
const ARGUMENT_COMMAND = new RegExp(`\\\\(${ARGUMENT_COMMANDS.join('|')})\\*?(?![A-Za-z@])`, 'g');
const FIRST_ARGUMENT_COMMAND = new RegExp(`\\\\(${FIRST_ARGUMENT_COMMANDS.join('|')})\\*?(?![A-Za-z@])`, 'g');
const DEF = /\\[gex]?def\s*\\(?:[A-Za-z@]+|.)[^{\n]*/g;
const BEGIN_END = /\\(?:begin|end)\s*\{[^}\n]*\}/g;
const COMMAND = /\\(?:[A-Za-z@]+\*?|[^A-Za-z@])/g;
const SPECIAL = /[{}&~#^_]/g;

/** Reads a balanced `{...}` or `[...]` group starting at `k`; returns the index after it, or -1. */
function readGroup(text: string, k: number): number {
	const open = text[k];
	const close = open === '{' ? '}' : open === '[' ? ']' : '';
	if (!close) return -1;
	let depth = 0;
	for (let i = k; i < text.length; i++) {
		const c = text[i];
		if (c === '\\') {
			i++;
		} else if (c === '{') {
			depth++;
		} else if (c === '}') {
			if (open === '{' && --depth === 0) return i + 1;
			if (open === '[') depth--;
		} else if (c === ']' && open === '[' && depth === 0) {
			return i + 1;
		}
	}
	return -1;
}

/** Skips spaces and at most one line break. */
function skipSpace(text: string, k: number): number {
	const m = /^[ \t]*(?:\r?\n[ \t]*)?/.exec(text.slice(k, k + 200))!;
	return k + m[0].length;
}

/**
 * Protects each match of `re` plus the bracket and brace groups after it:
 * all of them, or, with `braces` set, up to and including that many `{}` groups.
 */
function protectWithGroups(text: string, mask: Mask, re: RegExp, braces = Infinity, spaced = true): void {
	for (const m of text.matchAll(re)) {
		if (mask[m.index!]) continue;
		let end = m.index! + m[0].length;
		let seen = 0;
		while (seen < braces) {
			const k = spaced ? skipSpace(text, end) : end;
			const after = readGroup(text, k);
			if (after < 0) break;
			if (text[k] === '{') seen++;
			end = after;
		}
		protect(mask, m.index!, end);
	}
}

/** Even number of backslashes before `i`, so the character at `i` is not escaped. */
function unescaped(text: string, i: number): boolean {
	let n = 0;
	while (text[i - 1 - n] === '\\') n++;
	return n % 2 === 0;
}

function protectComments(text: string, mask: Mask): void {
	for (let i = text.indexOf('%'); i >= 0; i = text.indexOf('%', i + 1)) {
		if (mask[i] || !unescaped(text, i)) continue;
		const nl = text.indexOf('\n', i);
		protect(mask, i, nl < 0 ? text.length : nl);
	}
}

/**
 * Protects verbatim environments and `\verb`, comments, math (`$…$`,
 * `$$…$$`, `\(…\)`, `\[…\]` and math environments), the arguments of
 * reference, citation, label, URL, graphics, package and definition
 * commands, `\href`'s URL, environment names and options, every command
 * name, and braces and other special characters.
 */
export function latexMask(text: string): Mask {
	const mask = new Uint8Array(text.length);
	protectMatches(text, mask, VERBATIM_ENV);
	protectMatches(text, mask, VERB);
	protectComments(text, mask);
	protectMatches(text, mask, MATH_ENV);
	protectMatches(text, mask, DISPLAY_MATH);
	protectMatches(text, mask, INLINE_MATH);
	protectWithGroups(text, mask, ARGUMENT_COMMAND);
	protectWithGroups(text, mask, FIRST_ARGUMENT_COMMAND, 1);
	protectWithGroups(text, mask, DEF, 1, false);
	protectWithGroups(text, mask, BEGIN_END, Infinity, false);
	protectMatches(text, mask, COMMAND);
	protectMatches(text, mask, SPECIAL);
	return mask;
}
