// Classic-engine parity: outputs recorded from the 2.0.0 port (fixtures/classic-parity.json)
// must keep reproducing exactly under `engine: 'classic'`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { simcockify } from '../dist/index.js';
import { simcockifyElement } from '../dist/dom.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/classic-parity.json', import.meta.url), 'utf8'));

test('classic engine reproduces every recorded text output', () => {
	assert.ok(FIXTURE.cases.length >= 80);
	for (const c of FIXTURE.cases) {
		assert.equal(simcockify(c.text, { ...c.options, engine: 'classic' }), c.output, JSON.stringify(c.options));
	}
});

test('classic engine reproduces recorded DOM output', () => {
	for (const c of FIXTURE.dom) {
		const el = new JSDOM(c.html).window.document.getElementById('r');
		simcockifyElement(el, { ...c.options, engine: 'classic' });
		assert.equal(el.innerHTML, c.innerHTML, JSON.stringify(c.options));
	}
});

test('classic typo selection stays in bounds for extreme random values', () => {
	const text = 'Leverage agile frameworks to provide a robust synopsis.';
	// Constant rolls at and around each cumulative boundary (0.05, 0.95) and the top of [0, 1).
	for (const roll of [0, 0.049999, 0.05, 0.050001, 0.5, 0.949999, 0.95, 0.950001, 0.999999999]) {
		const out = simcockify(text, { random: () => roll, engine: 'classic', DeadlinesLooming: 20 });
		assert.equal(typeof out, 'string', `roll ${roll}`);
		assert.equal(out.length, text.length, `roll ${roll}`);
		assert.equal(out, simcockify(text, { random: () => roll, engine: 'classic', DeadlinesLooming: 20 }));
	}
});
