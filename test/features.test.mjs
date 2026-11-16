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

// --- fatigue ---

/** Changes per third of a long text (by output position). */
function thirds(o) {
	const r = detailed(PROSE.repeat(40), { seed: 'fatigue', DeadlinesLooming: 6, ...o });
	const n = [0, 0, 0];
	for (const c of r.changes) n[Math.min(2, Math.floor((3 * c.index) / r.text.length))]++;
	return n;
}

test('fatigue: start cleaner, end messier; negative is the reverse; 0 is flat', () => {
	const up = thirds({ fatigue: 1 });
	assert.ok(up[0] < up[1] && up[1] < up[2], `fatigue 1: ${up}`);
	assert.ok(up[2] > 2 * up[0], `fatigue 1: ${up}`);
	const down = thirds({ fatigue: -1 });
	assert.ok(down[0] > down[1] && down[1] > down[2], `fatigue -1: ${down}`);
	const flat = thirds({ fatigue: 0 });
	assert.ok(Math.max(...flat) < 1.6 * Math.min(...flat), `fatigue 0: ${flat}`);
	const total = (n) => n[0] + n[1] + n[2];
	assert.ok(Math.abs(total(up) - total(flat)) < 0.25 * total(flat), 'average rate roughly unchanged');
	// Out-of-range values are clamped to -1..1.
	assert.equal(simcockify(PROSE, { seed: 2, ...HEAVY, fatigue: 5 }), simcockify(PROSE, { seed: 2, ...HEAVY, fatigue: 1 }));
});

test('fatigue spans all segments in order (as for the text nodes of an element)', () => {
	const segs = Array(30).fill(PROSE);
	const counts = simcockifySegments(segs, { seed: 'seg', DeadlinesLooming: 6, fatigue: 1 }).map((r) => r.changes.length);
	const first = counts.slice(0, 10).reduce((a, b) => a + b, 0);
	const last = counts.slice(20).reduce((a, b) => a + b, 0);
	assert.ok(last > 2 * first, `first ten ${first}, last ten ${last}`);
});

// --- personas and layering ---

test('personas: about six presets, each changes the output and is listed', async () => {
	const { PERSONAS, PERSONA_NAMES } = await import('../dist/index.js');
	assert.deepEqual(PERSONA_NAMES, Object.keys(PERSONAS));
	for (const name of ['well-rested', 'monday-morning', 'friday-afternoon', 'post-launch', 'client-call', 'caffeinated']) {
		assert.ok(PERSONAS[name]?.description, name);
	}
	const long = PROSE.repeat(4);
	const changes = (persona) => detailed(long, { seed: 'p', persona }).changes.length;
	assert.ok(changes('well-rested') < changes('post-launch'));
	assert.ok(changes('well-rested') <= 3, `well-rested is near-clean: ${changes('well-rested')}`);
});

test('persona layering: { ...defaults, ...persona, ...options }', async () => {
	const { PERSONAS, layerOptions, DEFAULT_OPTIONS } = await import('../dist/index.js');
	const p = PERSONAS['post-launch'].options;
	// Applying a persona equals spreading its values by hand.
	assert.equal(simcockify(PROSE, { seed: 'L', persona: 'post-launch' }), simcockify(PROSE, { seed: 'L', ...p }));
	// Explicit options override the persona; unset (undefined) ones do not.
	const r = resolveOptions({ persona: 'post-launch', HoursOfSleep: 8, fatigue: undefined, typoWeights: { double: 0 } });
	assert.equal(r.HoursOfSleep, 8);
	assert.equal(r.EmployeesBlocked, p.EmployeesBlocked);
	assert.equal(r.fatigue, p.fatigue);
	// Weights layer per key: default -> persona -> explicit.
	assert.equal(r.typoWeights.double, 0);
	assert.equal(r.typoWeights.insert, p.typoWeights.insert);
	assert.equal(r.typoWeights.slip, DEFAULT_TYPO_WEIGHTS.slip);
	// layerOptions is plain spreads, lowest first.
	const l = layerOptions(DEFAULT_OPTIONS, { Coffees: 1, seed: 'a' }, { Coffees: 3 }, { seed: 'b' });
	assert.equal(l.Coffees, 3);
	assert.equal(l.seed, 'b');
	assert.equal(l.HoursOfSleep, DEFAULT_OPTIONS.HoursOfSleep);
	assert.throws(() => simcockify('x', { persona: 'nobody' }), /unknown persona "nobody"/);
});

// --- reveal and simcockifyDetailed ---

test('simcockifyDetailed: indexes point at replacements; replaying changes rebuilds the input', async () => {
	const { simcockifyDetailed } = await import('../dist/index.js');
	const t = `${PROSE} Don't lose it's place; their report.`;
	for (const engine of ['word', 'classic']) {
		const r = simcockifyDetailed(t, { seed: 'd', ...HEAVY, engine });
		assert.ok(r.changes.length > 0, engine);
		assert.equal(r.text, simcockify(t, { seed: 'd', ...HEAVY, engine }), engine);
		let rebuilt = r.text;
		for (const c of [...r.changes].reverse()) {
			assert.equal(r.text.slice(c.index, c.index + c.replacement.length), c.replacement);
			rebuilt = rebuilt.slice(0, c.index) + c.original + rebuilt.slice(c.index + c.replacement.length);
		}
		assert.equal(rebuilt, t, engine);
	}
});

test('reveal html: each change wrapped in a span with the HTML-escaped original', async () => {
	const { simcockifyDetailed } = await import('../dist/index.js');
	const t = `Don't stop "quoting" <tags> & keep going, they're fine. ${PROSE}`;
	const o = { seed: 'h', ...HEAVY, typoWeights: { apostrophe: 50 } };
	const html = simcockify(t, { ...o, reveal: 'html' });
	const { text, changes } = simcockifyDetailed(t, o);
	const spans = [...html.matchAll(/<span class="simcock" title="was: ([^"]*)">([^<]*)<\/span>/g)];
	assert.equal(spans.length, changes.length);
	assert.ok(spans.some((m) => m[1].includes('&#39;')), 'apostrophe escaped in title');
	const unescape = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
	spans.forEach((m, i) => {
		assert.equal(unescape(m[1]), changes[i].original);
		assert.equal(unescape(m[2]), changes[i].replacement);
	});
	// Removing the spans gives the plain output; surrounding text is left as is.
	assert.equal(html.replace(/<span class="simcock" title="[^"]*">([^<]*)<\/span>/g, (_, r) => unescape(r)), text);
	assert.ok(html.includes('<tags> &'));
});

test('reveal ansi: replacement red and underlined, original dimmed in brackets', async () => {
	const { simcockifyDetailed } = await import('../dist/index.js');
	const o = { seed: 'a', ...HEAVY };
	const ansi = simcockify(PROSE, { ...o, reveal: 'ansi' });
	const { text, changes } = simcockifyDetailed(PROSE, o);
	const marks = [...ansi.matchAll(/\x1b\[4;31m(.*?)\x1b\[0m\x1b\[2m\[(.*?)\]\x1b\[0m/g)];
	assert.equal(marks.length, changes.length);
	marks.forEach((m, i) => assert.deepEqual([m[1], m[2]], [changes[i].replacement, changes[i].original]));
	assert.equal(ansi.replace(/\x1b\[2m\[.*?\]\x1b\[0m/g, '').replace(/\x1b\[[0-9;]*m/g, ''), text);
});

test('reveal json: { text, changes } matching simcockifyDetailed', async () => {
	const { simcockifyDetailed } = await import('../dist/index.js');
	const o = { seed: 'j', ...HEAVY };
	const parsed = JSON.parse(simcockify(PROSE, { ...o, reveal: 'json' }));
	assert.deepEqual(parsed, simcockifyDetailed(PROSE, o));
	assert.deepEqual(Object.keys(parsed.changes[0]), ['index', 'original', 'replacement', 'type']);
	assert.throws(() => simcockify('x', { reveal: 'xml' }), /unknown reveal mode/);
});
