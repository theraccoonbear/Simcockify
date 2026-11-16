import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simcockify, simcockifySegments, resolveOptions, TYPO_TYPES, HOMOPHONES, DEFAULT_TYPO_WEIGHTS } from '../dist/index.js';

const PROSE =
	'Leverage agile frameworks to provide a robust synopsis for high level overviews. Iterative approaches to corporate strategy foster collaborative thinking to further the overall value proposition. Organically grow the holistic world view of disruptive innovation via workplace diversity and empowerment.';
const HEAVY = { DeadlinesLooming: 20, EmployeesBlocked: 15 }; // 0.5 typos per word
const only = (type) => Object.fromEntries(TYPO_TYPES.map((t) => [t, t === type ? 1 : 0]));
const detailed = (text, o) => simcockifySegments([text], o)[0];
const removeAt = (s, i) => s.slice(0, i) + s.slice(i + 1);

/** Changes made by exactly one mistake of `type` (all other weights 0), over many seeds. */
function singles(type, text = PROSE, extra = {}) {
	const out = [];
	for (let seed = 0; seed < 40; seed++) {
		const r = detailed(text, { seed, ...HEAVY, typoWeights: only(type), ...extra });
		for (const c of r.changes) {
			assert.equal(r.text.slice(c.index, c.index + c.replacement.length), c.replacement);
			if (c.type === type) out.push(c);
		}
	}
	assert.ok(out.length > 5, `${type}: got ${out.length} single-type changes`);
	return out;
}

// --- mistake types, each forced in isolation ---

test('double: one letter typed twice', () => {
	for (const c of singles('double')) {
		assert.equal(c.replacement.length, c.original.length + 1);
		assert.ok(
			[...c.replacement].some((ch, i) => ch === c.replacement[i + 1] && removeAt(c.replacement, i) === c.original),
			JSON.stringify(c),
		);
	}
});

test('drop: one letter missing, never the first', () => {
	for (const c of singles('drop')) {
		assert.equal(c.replacement.length, c.original.length - 1);
		assert.ok([...c.original].some((_, i) => removeAt(c.original, i) === c.replacement), JSON.stringify(c));
		assert.equal(c.replacement[0], c.original[0]);
	}
});

test('apostrophe: contraction loses its apostrophe', () => {
	const text = "Don't panic, it's fine, we're nearly done and they'll cope. You can’t stop now. ".repeat(3);
	for (const c of singles('apostrophe', text)) assert.equal(c.replacement, c.original.replace(/['’]/, ''));
});

test('homophone: swapped within its group, case preserved', () => {
	const text = 'Their dog lost its ball over there, then you said your plan was too much to lose. Its effect was clear. ';
	const groups = HOMOPHONES.map((g) => new Set(g));
	for (const c of singles('homophone', text.repeat(3))) {
		const group = groups.find((g) => g.has(c.original.toLowerCase()));
		assert.ok(group && group.has(c.replacement.toLowerCase()) && c.replacement !== c.original, JSON.stringify(c));
		assert.equal(/^\p{Lu}/u.test(c.replacement), /^\p{Lu}/u.test(c.original), 'first-letter case kept');
	}
	for (let seed = 0; seed < 10; seed++) {
		const out = simcockify('THEIR TOO', { seed, ...HEAVY, typoWeights: only('homophone') });
		assert.equal(out, out.toUpperCase());
	}
	assert.match(simcockify('it’s', { seed: 1, DeadlinesLooming: 400, typoWeights: only('homophone') }), /^its$/);
});

test('duplicate: word repeated as if left from a rewrite', () => {
	for (const c of singles('duplicate')) assert.equal(c.replacement, `${c.original} ${c.original}`);
});

test('stickyShift: THe or tHe, on capitalised words only', () => {
	for (const c of singles('stickyShift')) {
		const o = c.original;
		assert.ok(
			c.replacement === o[0] + o[1].toUpperCase() + o.slice(2) ||
				c.replacement === o[0].toLowerCase() + o[1].toUpperCase() + o.slice(2),
			JSON.stringify(c),
		);
	}
	const lower = 'all lower case words here';
	assert.equal(simcockify(lower, { seed: 1, ...HEAVY, typoWeights: only('stickyShift') }), lower);
});

test('sentenceEnd: final period dropped, doubled or turned into a comma, only at sentence ends', () => {
	const seen = new Set();
	for (const c of singles('sentenceEnd')) {
		assert.ok(c.original.endsWith('.'));
		const stem = c.original.slice(0, -1);
		assert.ok(c.replacement.startsWith(stem));
		const end = c.replacement.slice(stem.length);
		assert.ok(['', '..', ','].includes(end), end);
		seen.add(end);
	}
	assert.equal(seen.size, 3);
	const t = 'Version 2.5 of example.com is live... or is it? Yes!';
	for (let seed = 0; seed < 20; seed++) assert.equal(simcockify(t, { seed, ...HEAVY, typoWeights: only('sentenceEnd') }), t);
});

test('very short words only get word-level mistakes', () => {
	const text = 'I am at it so we go by on up to do no';
	let changed = 0;
	for (let seed = 0; seed < 30; seed++) {
		for (const c of detailed(text, { seed, ...HEAVY }).changes) {
			changed++;
			// The first mistake is word-level; after a swap such as to -> too, letters can change too.
			assert.match(c.type, /^(homophone|duplicate)(\+|$)/, JSON.stringify(c));
		}
	}
	assert.ok(changed > 0);
});

test('word-specific types keep their share instead of absorbing short-word draws', () => {
	const types = [];
	for (let seed = 0; seed < 30; seed++) for (const c of detailed(PROSE, { seed, ...HEAVY }).changes) types.push(...c.type.split('+'));
	const share = types.filter((t) => t === 'duplicate').length / types.length;
	assert.ok(share < 0.08, `duplicate share ${share.toFixed(3)}`);
});

test('typoWeights: merged over the defaults; validated', () => {
	const w = resolveOptions({ typoWeights: { transpose: 9 } }).typoWeights;
	assert.equal(w.transpose, 9);
	assert.equal(w.slip, DEFAULT_TYPO_WEIGHTS.slip);
	assert.throws(() => resolveOptions({ typoWeights: { nope: 1 } }), /unknown typo weight "nope"/);
	assert.throws(() => resolveOptions({ typoWeights: { slip: -1 } }), /must be a number >= 0/);
	// All weights zero: nothing changes.
	const zero = Object.fromEntries(TYPO_TYPES.map((t) => [t, 0]));
	assert.equal(simcockify(PROSE, { seed: 1, ...HEAVY, typoWeights: zero }), PROSE);
});

test('a zero rate gives identical output, whatever the weights', () => {
	const t = `${PROSE}\n\n  Their report isn't due. `;
	for (let seed = 0; seed < 10; seed++) {
		assert.equal(simcockify(t, { seed, Coffees: 2, typoWeights: { duplicate: 50, sentenceEnd: 1, homophone: 9 } }), t);
	}
});
