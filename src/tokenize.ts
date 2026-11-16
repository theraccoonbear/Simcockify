// Splits text into word, whitespace, punctuation and protected ("skip")
// tokens for the word engine. Only word tokens are ever mutated.

export type TokenKind = 'word' | 'space' | 'punct' | 'skip';

export interface Token {
	kind: TokenKind;
	text: string;
}

/** Fenced code blocks and inline `code` spans. */
const CODE_SPAN = /```[\s\S]*?```|`[^`\n]+`/g;
const CHUNK = /\s+|\S+/g;
const WORD_OR_PUNCT = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu;

/** Patterns that mark a whitespace-delimited chunk as something to leave exactly alone. */
const PROTECTED: RegExp[] = [
	/\d/, // numbers, times, versions, prices
	/:\/\//, // URLs with a scheme
	/^\W*www\./i, // bare www. URLs
	/\S@\S/, // email addresses
	/^\W*[@#]\S/, // @handles and #tags
	/_/, // snake_case
	/\p{Ll}\p{Lu}/u, // camelCase and other internal capitals
	/[/\\]/, // paths
	/\p{L}\.\p{L}/u, // dotted names: domains, file.ext, a.b.c
	/^\W*\.\p{L}/u, // dotfiles
	/[=<>{}[\]|^~$%+]/, // code and maths
	/\(\)/, // calls
	/^-{1,2}\p{L}/u, // command-line flags
];

/** All-capital words of up to five letters are treated as acronyms. */
const ACRONYM = /^\p{Lu}{2,5}$/u;

/** True when a whitespace-free chunk looks like a URL, email, number, handle, path or code. */
export function isProtectedChunk(chunk: string): boolean {
	return PROTECTED.some((re) => re.test(chunk));
}

function pushChunk(tokens: Token[], chunk: string): void {
	if (/^\s/.test(chunk)) {
		tokens.push({ kind: 'space', text: chunk });
		return;
	}
	if (isProtectedChunk(chunk)) {
		tokens.push({ kind: 'skip', text: chunk });
		return;
	}
	for (const m of chunk.matchAll(WORD_OR_PUNCT)) {
		const text = m[0];
		if (/^[\p{L}\p{M}]/u.test(text)) {
			tokens.push({ kind: ACRONYM.test(text) ? 'skip' : 'word', text });
		} else {
			tokens.push({ kind: 'punct', text });
		}
	}
}

/** Tokenises `text`; concatenating the token texts gives `text` back. */
export function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	const plain = (s: string): void => {
		for (const m of s.matchAll(CHUNK)) pushChunk(tokens, m[0]);
	};
	let last = 0;
	for (const m of text.matchAll(CODE_SPAN)) {
		plain(text.slice(last, m.index));
		tokens.push({ kind: 'skip', text: m[0] });
		last = m.index! + m[0].length;
	}
	plain(text.slice(last));
	return tokens;
}
