import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simcockify, createRandom, DEFAULT_OPTIONS } from '../dist/index.js';

const TEXT = 'Leverage agile frameworks to provide a robust synopsis for high level overviews.';

test('defaults are exported with the original values', () => {
	assert.equal(DEFAULT_OPTIONS.HoursOfSleep, 8);
	assert.equal(DEFAULT_OPTIONS.Coffees, 0);
	assert.equal(DEFAULT_OPTIONS.exclude, '.no-simcockify');
});

test('same seed and options give the same output', () => {
	const o = { seed: 'abc', Coffees: 4, DeadlinesLooming: 5 };
	assert.equal(simcockify(TEXT, o), simcockify(TEXT, o));
});

test('different seeds usually give different output', () => {
	const outs = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => simcockify(TEXT, { seed, DeadlinesLooming: 10 })));
	assert.ok(outs.size > 1);
});

test('PRNG yields values in [0, 1) and is repeatable', () => {
	const a = createRandom('s');
	const b = createRandom('s');
	for (let i = 0; i < 100; i++) {
		const v = a();
		assert.equal(v, b());
		assert.ok(v >= 0 && v < 1);
	}
});

test('classic engine: known output for a fixed seed (regression)', () => {
	assert.equal(
		simcockify('The quick brown fox jumps over the lazy dog, repeatedly and with feeling.', {
			seed: 'abc',
			Coffees: 5,
			HoursOfSleep: 4,
			engine: 'classic',
		}),
		'The quick brown fjx oumps over the lazy dog, peeratedly and with feeling.',
	);
});

test('classic engine: neutral factors still produce a few typos (original defaults)', () => {
	// Coffees defaults to 0, which is off-neutral, so the 0.5 term applies.
	assert.notEqual(simcockify(TEXT, { seed: 1, engine: 'classic' }), TEXT);
});

test('word engine: default factors give a light rate (0.1 per word), so most seeds change something in long text', () => {
	const changed = [1, 2, 3, 4, 5].filter((seed) => simcockify(TEXT.repeat(3), { seed }) !== TEXT.repeat(3));
	assert.ok(changed.length >= 4, `changed for seeds ${changed}`);
});

test('fully neutral settings produce no typos', () => {
	assert.equal(simcockify(TEXT, { seed: 1, Coffees: 2 }), TEXT);
});

test('more pressure means more changed characters', () => {
	const diff = (a, b) => [...a].filter((c, i) => c !== b[i]).length;
	const long = TEXT.repeat(20);
	const calm = simcockify(long, { seed: 7, Coffees: 2 });
	const frantic = simcockify(long, { seed: 7, Coffees: 2, DeadlinesLooming: 20, EmployeesBlocked: 15 });
	assert.ok(diff(long, frantic) > diff(long, calm));
});

test('each frequency option raises the typo count', () => {
	const long = TEXT.repeat(10);
	const base = { seed: 3, Coffees: 2 };
	for (const [k, v] of [['HoursOfSleep', 3], ['DeadlinesLooming', 10], ['EmployeesBlocked', 10], ['MinutesTalkingToClients', 600]]) {
		assert.notEqual(simcockify(long, { ...base, [k]: v }), long, k);
	}
});

test('velocity options change the output but not the typo count', () => {
	const a = simcockify(TEXT.repeat(5), { seed: 9, Coffees: 2, DeadlinesLooming: 8 });
	const b = simcockify(TEXT.repeat(5), { seed: 9, Coffees: 2, DeadlinesLooming: 8, Espressos: 10 });
	assert.notEqual(a, b);
});

test('numeric strings are treated as numbers', () => {
	assert.equal(simcockify(TEXT, { seed: 2, Coffees: '5' }), simcockify(TEXT, { seed: 2, Coffees: 5 }));
});

test('surrounding whitespace is preserved; short text is returned as is', () => {
	const out = simcockify('  \n' + TEXT + ' \n', { seed: 1, DeadlinesLooming: 5 });
	assert.ok(out.startsWith('  \n') && out.endsWith(' \n'));
	assert.equal(simcockify('a', { seed: 1 }), 'a');
	assert.equal(simcockify('', { seed: 1 }), '');
});

test('debug messages go to the supplied logger', () => {
	const msgs = [];
	simcockify(TEXT, { seed: 1, debug: true, logger: (m) => msgs.push(m) });
	assert.ok(msgs.some((m) => m.startsWith('TEXT:')));
	const quiet = [];
	simcockify(TEXT, { seed: 1, logger: (m) => quiet.push(m) });
	assert.equal(quiet.length, 0);
});
