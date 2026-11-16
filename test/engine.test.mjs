import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simcockify, simcockifySegments, createSimcockifier, nearbyKeys, KEYBOARD_MAPS, createSeededRandom } from '../dist/index.js';

const QWERTY = KEYBOARD_MAPS.QWERTY;
const PROSE =
	'Leverage agile frameworks to provide a robust synopsis for high level overviews. Iterative approaches to corporate strategy foster collaborative thinking to further the overall value proposition. Organically grow the holistic world view of disruptive innovation via workplace diversity and empowerment.';
// 0.5 typos per word, limited to the letter-level types these tests are about
// (word-level types such as duplicate and homophone are tested in features.test.mjs).
const LETTER_TYPES = { slip: 4, transpose: 3, insert: 2, double: 0, drop: 0, apostrophe: 0, homophone: 0, duplicate: 0, stickyShift: 0, sentenceEnd: 0 };
const HEAVY = { DeadlinesLooming: 20, EmployeesBlocked: 15, typoWeights: LETTER_TYPES };
const detailed = (text, o) => simcockifySegments([text], o)[0];

/** Changes made by exactly one mistake of `type`, gathered over many seeds. */
function singles(type, text = PROSE, extra = {}) {
	const out = [];
	for (let seed = 0; seed < 40; seed++) {
		const r = detailed(text, { seed, ...HEAVY, ...extra });
		for (const c of r.changes) {
			assert.equal(r.text.slice(c.index, c.index + c.replacement.length), c.replacement, 'index points at replacement');
			if (c.type === type) out.push(c);
		}
	}
	assert.ok(out.length > 5, `${type}: got ${out.length} single-type changes`);
	return out;
}

const removeAt = (s, i) => s.slice(0, i) + s.slice(i + 1);
const firstDiff = (a, b) => [...a].findIndex((ch, i) => ch !== b[i]);

// [mutation]

test('[mutation] key slip: one letter replaced by an immediate neighbour, same case', () => {
	for (const c of singles('slip')) {
		assert.equal(c.replacement.length, c.original.length);
		const diffs = [...c.original].map((ch, i) => [ch, c.replacement[i]]).filter(([a, b]) => a !== b);
		assert.equal(diffs.length, 1, JSON.stringify(c));
		const [from, to] = diffs[0];
		assert.ok(nearbyKeys(from, QWERTY, 1.25).some((k) => k.key === to), `${from} -> ${to}`);
	}
});

test('[mutation] transposition: adjacent letters within one word, never across spaces or punctuation', () => {
	for (const c of singles('transpose')) {
		const o = c.original.toLowerCase();
		const r = c.replacement.toLowerCase();
		const i = firstDiff(o, r);
		assert.ok(i >= 0 && i < o.length - 1);
		assert.equal(r, o.slice(0, i) + o[i + 1] + o[i] + o.slice(i + 2), JSON.stringify(c));
	}
	for (let seed = 0; seed < 30; seed++) {
		const out = simcockify(PROSE, { seed, ...HEAVY });
		assert.equal(out.split(/\s+/).length, PROSE.split(/\s+/).length, 'word count unchanged');
		assert.deepEqual(out.match(/[^\p{L}\s]/gu), PROSE.match(/[^\p{L}\s]/gu), 'punctuation unchanged and in place');
	}
});

test('[mutation] extra character is inserted next to a neighbouring key; nothing is overwritten', () => {
	for (const c of singles('insert')) {
		assert.equal(c.replacement.length, c.original.length + 1);
		const r = c.replacement;
		const ok = [...r].some(
			(extra, k) =>
				removeAt(r, k) === c.original &&
				[r[k - 1], r[k + 1]].some((n) => n && nearbyKeys(n, QWERTY, 1.25).some((key) => key.key === extra)),
		);
		assert.ok(ok, JSON.stringify(c));
	}
	// The 1.x bug: "cat" became "cxt". Every insert keeps all original letters in order.
	for (let seed = 0; seed < 50; seed++) {
		for (const c of detailed('category', { seed, ...HEAVY }).changes) {
			if (c.type === 'insert') assert.ok([...c.replacement].some((_, k) => removeAt(c.replacement, k) === 'category'));
		}
	}
});

test('[mutation] case is preserved: slips on capitals stay capital', () => {
	const caps = 'WONDERFUL EVENING EVERYBODY TOGETHER';
	for (let seed = 0; seed < 40; seed++) {
		const out = simcockify(caps, { seed, ...HEAVY });
		assert.equal(out, out.toUpperCase(), out);
		for (const c of detailed('Wonderful Evening Everybody', { seed, ...HEAVY }).changes) {
			if (c.type !== 'slip') continue;
			const i = firstDiff(c.original, c.replacement);
			assert.equal(c.replacement[i] === c.replacement[i].toUpperCase(), c.original[i] === c.original[i].toUpperCase());
		}
	}
});

test('[mutation] velocity widens slips beyond immediate neighbours', () => {
	const long = PROSE.repeat(5);
	const far = (o) =>
		detailed(long, { seed: 3, ...HEAVY, ...o })
			.changes.filter((c) => c.type === 'slip')
			.some((c) => {
				const i = firstDiff(c.original, c.replacement);
				return !nearbyKeys(c.original[i], QWERTY, 1.25).some((k) => k.key === c.replacement[i]);
			});
	assert.equal(far({}), false);
	assert.equal(far({ Espressos: 15, FiveHourEnergies: 8 }), true);
});

// [selection]

test('[selection] every position in a word can be hit, including the last letter', () => {
	const hits = new Set();
	for (let seed = 0; seed < 200; seed++) {
		for (const c of detailed('keyboard', { seed, ...HEAVY }).changes) {
			if (c.type === 'slip') hits.add(firstDiff(c.original, c.replacement));
		}
	}
	assert.deepEqual([...hits].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('[selection] positions are spread evenly, not biased toward the start', () => {
	const n = new Array(8).fill(0);
	const text = 'keyboard '.repeat(50);
	for (let seed = 0; seed < 400; seed++) {
		for (const c of detailed(text, { seed, ...HEAVY }).changes) if (c.type === 'slip') n[firstDiff(c.original, c.replacement)]++;
	}
	// The 1.x pick gave the first position twice its share and the last none.
	assert.ok(Math.max(...n) < 1.5 * Math.min(...n), `slip positions ${n}`);
});

test('[selection] no minimum per text: a low rate leaves many short texts untouched', () => {
	let untouched = 0;
	for (let seed = 0; seed < 50; seed++) if (simcockify('Please review this.', { seed }) === 'Please review this.') untouched++;
	assert.ok(untouched > 25, `untouched ${untouched}/50`);
	// Each text node is a chunk in the DOM helper; short nodes are no longer forced to change.
	const results = simcockifySegments(Array(40).fill('Thanks.'), { seed: 1 });
	assert.ok(results.filter((r) => r.text === 'Thanks.').length > 30);
});

test('[selection] a zero rate gives identical output', () => {
	const t = `${PROSE}\n\n  Their report isn't due. `;
	for (let seed = 0; seed < 10; seed++) assert.equal(simcockify(t, { seed, Coffees: 2 }), t);
});

test('[selection] similar seeds give independent streams', () => {
	const firsts = new Set([0, 1, 2, 3, 4, 5, 'a', 'b'].map((s) => createSeededRandom(s)().toFixed(3)));
	assert.equal(firsts.size, 8);
	const r = createSeededRandom('range');
	for (let i = 0; i < 1e5; i++) {
		const v = r();
		assert.ok(v >= 0 && v < 1);
	}
});

// [tokens]

test('[tokens] URLs, emails, numbers, handles, tags and code-ish tokens are never touched', () => {
	const protectedText = [
		'https://example.com/path?q=1', 'www.example.org', 'mailto:someone@example.com', 'someone@example.com',
		'3.14159', '1,000', '42nd', 'v2', '@handle', '#hashtag', '`inline code here`', 'snake_case_name', 'camelCaseName',
		'JavaScript', 'src/core.ts', '/usr/local/bin', 'C:\\Windows', 'package.json', '.eslintrc', 'a=b', 'fn()', '--engine',
		'NASA', 'HTML', '```\nfenced block of code\n```',
	].join(' ');
	for (let seed = 0; seed < 20; seed++) assert.equal(simcockify(protectedText, { seed, ...HEAVY }), protectedText);
});

test('[tokens] very short words get no letter-level typos', () => {
	const t = 'I am at it so we go by on up to do no';
	for (let seed = 0; seed < 20; seed++) assert.equal(simcockify(t, { seed, ...HEAVY }), t);
});

test('[tokens] surrogate pairs, emoji and combining marks are never split', () => {
	const text = 'Café naïve résumé 😀 emoji 👍🏽 here 👨‍👩‍👧 family 𝒳𝒴𝒵 fancy Ελληνικά слово 中文字 friends. ';
	const emoji = (s) => s.match(/\p{Extended_Pictographic}/gu);
	for (let seed = 0; seed < 40; seed++) {
		const out = simcockify(text.repeat(2), { seed, ...HEAVY });
		assert.ok(out.isWellFormed(), 'no lone surrogates');
		assert.deepEqual(emoji(out), emoji(text.repeat(2)));
		assert.ok(out.includes('👨‍👩‍👧') && out.includes('👍🏽'));
		assert.doesNotMatch(out, /(^|[^\p{L}])\p{M}/u, 'combining mark detached from its letter');
	}
	const decomposed = 'nai\u0308ve cafe\u0301 re\u0301sume\u0301 '.repeat(5);
	for (let seed = 0; seed < 40; seed++) assert.doesNotMatch(simcockify(decomposed, { seed, ...HEAVY }), /(^|[^\p{L}])\p{M}/u);
});

// general

test('determinism: same seed and options give the same output; different seeds differ', () => {
	const o = { seed: 'abc', ...HEAVY };
	assert.equal(simcockify(PROSE, o), simcockify(PROSE, o));
	assert.deepEqual(detailed(PROSE, o), detailed(PROSE, o));
	assert.equal(new Set(['a', 'b', 'c', 'd'].map((seed) => simcockify(PROSE, { ...o, seed }))).size, 4);
	const f = createSimcockifier({ seed: 'stream', ...HEAVY });
	const g = createSimcockifier({ seed: 'stream', ...HEAVY });
	assert.deepEqual([f(PROSE), f(PROSE)], [g(PROSE), g(PROSE)]);
});

test('whitespace and line structure are preserved', () => {
	const t = '  \n# Heading here\n\n- first item written\n- second item written\n\t\n';
	const out = simcockify(t, { seed: 4, ...HEAVY });
	assert.equal(out.replace(/\S/g, ''), t.replace(/\S/g, ''));
	assert.ok(out.startsWith('  \n# ') && out.endsWith('\n\t\n'));
});

test('more pressure means more changes', () => {
	const count = (o) => detailed(PROSE.repeat(5), { seed: 7, Coffees: 2, ...o }).changes.length;
	assert.ok(count(HEAVY) > count({ DeadlinesLooming: 2 }));
});

test('unknown engine is an error', () => {
	assert.throws(() => simcockify('x', { engine: 'nope' }), /unknown engine/);
});
