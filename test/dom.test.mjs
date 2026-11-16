import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { simcockifyElement } from '../dist/dom.js';
import { install } from '../dist/jquery.js';

const JQUERY_SRC = readFileSync(new URL('../node_modules/jquery/dist/jquery.js', import.meta.url), 'utf8');
const HTML = `<div id="r"><p>Leverage agile frameworks to provide a robust <a href="#">synopsis</a> for overviews.</p>
<p class="no-simcockify">Leave this paragraph exactly alone, please.</p><script>var keep = 1;</script></div>`;

function setup() {
	const dom = new JSDOM(HTML, { runScripts: 'outside-only' });
	dom.window.eval(JQUERY_SRC);
	return { dom, root: dom.window.document.getElementById('r') };
}

test('simcockifyElement alters text, keeps markup and excluded nodes', () => {
	const { root } = setup();
	simcockifyElement(root, { seed: 's', DeadlinesLooming: 20, EmployeesBlocked: 15 });
	assert.notEqual(root.textContent, setup().root.textContent);
	assert.equal(root.querySelectorAll('a').length, 1);
	assert.equal(root.querySelector('.no-simcockify').textContent, 'Leave this paragraph exactly alone, please.');
	assert.equal(root.querySelector('script').textContent, 'var keep = 1;');
});

test('simcockifyElement is repeatable with a seed', () => {
	const a = setup().root;
	const b = setup().root;
	simcockifyElement(a, { seed: 'x', DeadlinesLooming: 15 });
	simcockifyElement(b, { seed: 'x', DeadlinesLooming: 15 });
	assert.equal(a.innerHTML, b.innerHTML);
});

test('jQuery adapter registers $.fn.simcockify and $.seedPRNG', () => {
	const { dom, root } = setup();
	const $ = dom.window.jQuery;
	install($);
	$.seedPRNG('shared');
	$('#r').simcockify({ DeadlinesLooming: 15 });
	const first = root.innerHTML;
	const again = setup();
	const $2 = again.dom.window.jQuery;
	install($2);
	$2.seedPRNG('shared');
	$2('#r').simcockify({ DeadlinesLooming: 15 });
	assert.equal(again.root.innerHTML, first);
	assert.notEqual(first, setup().root.innerHTML);
});

test('simcockifyElement: classic engine and word engine both work; protected tokens in nodes survive', () => {
	const dom = new JSDOM('<div id="r"><p>Visit https://example.com/a-b or mail bob@example.com about item 42.</p><p>Leverage agile frameworks to provide a robust synopsis.</p></div>');
	const root = dom.window.document.getElementById('r');
	simcockifyElement(root, { seed: 3, DeadlinesLooming: 20, EmployeesBlocked: 15 });
	assert.match(root.textContent, /https:\/\/example\.com\/a-b/);
	assert.match(root.textContent, /bob@example\.com/);
	assert.match(root.textContent, / 42\./);
	assert.equal(root.querySelectorAll('p').length, 2);
});

test('simcockifyElement: fatigue runs across the element in document order', () => {
	const para = '<p>Leverage agile frameworks to provide a robust synopsis for high level overviews.</p>';
	const dom = new JSDOM(`<div id="r">${para.repeat(60)}</div>`);
	const root = dom.window.document.getElementById('r');
	const before = [...root.querySelectorAll('p')].map((p) => p.textContent);
	simcockifyElement(root, { seed: 'f', DeadlinesLooming: 8, fatigue: 1 });
	const changed = [...root.querySelectorAll('p')].map((p, i) => (p.textContent === before[i] ? 0 : 1));
	const first = changed.slice(0, 20).reduce((a, b) => a + b, 0);
	const last = changed.slice(40).reduce((a, b) => a + b, 0);
	assert.ok(last > first, `changed paragraphs: first ${first}, last ${last}`);
});

test('simcockifyElement reveal: changes wrapped in span elements built as DOM nodes', () => {
	const dom = new JSDOM('<div id="r"><p>Leverage agile frameworks &lt;b&gt;not bold&lt;/b&gt; to provide a robust <a href="#">synopsis overview</a> for everyone today.</p></div>');
	const root = dom.window.document.getElementById('r');
	const before = root.textContent;
	simcockifyElement(root, { seed: 'rv', DeadlinesLooming: 20, EmployeesBlocked: 15, reveal: 'html' });
	const spans = [...root.querySelectorAll('span.simcock')];
	assert.ok(spans.length > 0);
	for (const s of spans) {
		assert.match(s.getAttribute('title'), /^was: \S/);
		assert.equal(s.children.length, 0, 'span holds only text');
	}
	// Escaped markup in the text stays text: no <b> element appears.
	assert.equal(root.querySelectorAll('b').length, 0);
	assert.ok(root.textContent.includes('<b>'));
	assert.equal(root.querySelectorAll('a').length, 1);
	// Undoing each span's change restores the original text.
	for (const s of spans) s.replaceWith(dom.window.document.createTextNode(s.getAttribute('title').slice(5)));
	assert.equal(root.textContent, before);
});
