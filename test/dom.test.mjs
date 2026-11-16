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
	simcockifyElement(root, { seed: 's', DeadlinesLooming: 15 });
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
