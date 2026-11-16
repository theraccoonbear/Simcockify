import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	detectFormat,
	formatFromHint,
	resolveOptions,
	segment,
	simcockify,
	simcockifyDetailed,
	simcockifySegments,
} from '../dist/index.js';
import { formatMask } from '../dist/formats/segment.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/formats/${name}`, import.meta.url), 'utf8');
const SAMPLES = { markdown: fixture('sample.md'), html: fixture('sample.html'), latex: fixture('sample.tex') };
const BIN = new URL('../bin/simcockify.js', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'simcockify-fmt-'));

/** Very high typo settings with every mistake type switched on. */
const HEAVY = {
	DeadlinesLooming: 40,
	EmployeesBlocked: 30,
	HoursOfSleep: 0,
	MinutesTalkingToClients: 1440,
	Coffees: 6,
	Espressos: 4,
	typoWeights: { duplicate: 3, sentenceEnd: 1, stickyShift: 3 },
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Asserts that `out` is the protected segments of `input`, byte for byte, with only single-line prose between. */
function assertProtectedSurvive(input, out, format, label) {
	const pattern = segment(input, format)
		.map((s) => (s.prose ? '[^\\n]*?' : escape(s.text)))
		.join('');
	assert.match(out, new RegExp(`^${pattern}$`), label);
}

function assertCovered(text, format, snippet, expected) {
	const mask = formatMask(text, format);
	const at = text.indexOf(snippet);
	assert.ok(at >= 0, `missing from sample: ${snippet}`);
	for (let i = at; i < at + snippet.length; i++) {
		if (expected === 0 && !/\p{L}/u.test(text[i])) continue; // only letters must be prose
		assert.equal(mask[i], expected, `${format}: ${JSON.stringify(snippet)} at offset ${i - at} (${JSON.stringify(text[i])})`);
	}
}

test('segments join back to the input', () => {
	for (const [format, text] of Object.entries(SAMPLES)) {
		for (const f of ['text', 'markdown', 'html', 'latex']) {
			assert.equal(segment(text, f).map((s) => s.text).join(''), text, `${format} as ${f}`);
		}
	}
	assert.deepEqual(segment('', 'markdown'), []);
	assert.deepEqual(segment('plain words', 'text'), [{ text: 'plain words', prose: true }]);
	assert.throws(() => segment('x', 'rst'), /unknown format "rst"/);
});

for (const [format, text] of Object.entries(SAMPLES)) {
	test(`${format}: protected regions survive byte-for-byte at heavy settings`, () => {
		for (const engine of ['word', 'classic']) {
			for (const seed of ['a', 'b', 'c', 42, 'formats']) {
				const out = simcockify(text, { ...HEAVY, seed, engine, format });
				assert.notEqual(out, text, `${engine}/${seed}: prose should change`);
				assertProtectedSurvive(text, out, format, `${engine}/${seed}`);
			}
		}
	});

	test(`${format}: change indices point into the output`, () => {
		const r = simcockifyDetailed(text, { ...HEAVY, seed: 'idx', format });
		assert.ok(r.changes.length > 5);
		for (const c of r.changes) assert.equal(r.text.slice(c.index, c.index + c.replacement.length), c.replacement);
		assert.equal(r.text, simcockify(text, { ...HEAVY, seed: 'idx', format }));
		const html = simcockify(text, { ...HEAVY, seed: 'idx', format, reveal: 'html' });
		assert.equal((html.match(/class="simcock"/g) ?? []).length, r.changes.length);
	});
}

test('markdown: every listed region is protected and prose stays prose', () => {
	const md = SAMPLES.markdown;
	for (const s of [
		'---\ntitle: Release checklist for the platform team\ntags: [release, checklist]\n---\n', // front matter
		'~~~sh\nnpm run build --production\ndeploy release candidate to staging\n~~~', // fenced code (tilde)
		'```js\nconst message = "please review the attached proposal";\n```', // fenced code (backtick)
		'    indented example: restart the worker queue before lunch', // indented code
		'`npm run release --tag latest`', // inline code
		'](https://example.com/docs/deployment-guide "Deployment guide for operators")', // link URL and title
		'](images/architecture-overview.png)', // image URL
		'![', // image marker
		'][rollback]', // reference link label
		'[rollback]: https://example.com/docs/rollback-notes "Rollback notes for operators"', // reference definition
		'<mailto:releases@example.com>', // autolinks
		'<https://example.com/status>',
		'https://status.example.com/incidents', // bare URL
		'oncall@example.com',
		'<span class="warning" data-level="high">', // raw HTML tags
		'</span>',
		'<!-- an html comment with words -->',
		'<pre>\npreformatted block with several words inside\n</pre>',
		'&mdash;',
		'| :-------- | :---: | -----: |', // table delimiter row
		'# ', // heading marker
		' #\n', // closing heading sequence
		'--------------------------------', // setext underline
		'- [ ] ', // list and task markers
		'- [x] ',
		'  1. ',
		'> > ', // quote markers
		'[^1]', // footnote reference
		'\\*', // escapes
	]) {
		assertCovered(md, 'markdown', s, 1);
	}
	for (const s of [
		'Release checklist for the platform team #',
		'deployment guide',
		'architecture diagram',
		'rollback notes][',
		'Setext heading for the operators',
		'confirm the changes with the release manager',
		'Nested quotes should keep their markers intact',
		'Waiting on review',
		'this warning text',
		'The footnote text itself is prose',
	]) {
		assertCovered(md, 'markdown', s, 0);
	}
	// Pipes in header and body rows.
	const row = md.indexOf('| Scheduler |');
	assert.equal(formatMask(md, 'markdown')[row], 1);
});

test('html: every listed region is protected and text content stays prose', () => {
	const html = SAMPLES.html;
	for (const s of [
		'<!DOCTYPE html>',
		'<html lang="en">',
		'<meta charset="utf-8">',
		'<style>\n    body { font-family: Georgia, serif; } .warning { color: darkred; }\n  </style>',
		'<script>\n    const greeting = "please do not change this string";',
		'<body class="notes" data-owner="platform team">',
		'<!-- reviewers should check the deadline section -->',
		'<h1 title="Planning notes for the quarter">',
		'<a href="https://example.com/docs/proposal" title="attached proposal">',
		'&amp;',
		'<code>npm run release --tag latest</code>',
		'<pre>\npreformatted text that must stay exactly as written\n  </pre>',
		'<img src="images/roadmap-overview.png" alt="roadmap overview diagram">',
		'<![CDATA[ character data with several words ]]>',
		'<textarea name="feedback">default feedback text</textarea>',
	]) {
		assertCovered(html, 'html', s, 1);
	}
	for (const s of ['Quarterly planning notes', 'Please review the', 'before Friday', 'send feedback to the whole team', 'after the review']) {
		assertCovered(html, 'html', s, 0);
	}
});

test('latex: every listed region is protected and prose stays prose', () => {
	const tex = SAMPLES.latex;
	for (const s of [
		'\\documentclass[11pt,a4paper]{article}',
		'\\usepackage[utf8]{inputenc}',
		'\\newcommand{\\project}[1]{\\textbf{Project #1}}',
		'\\section{',
		'\\label{sec:introduction}',
		'~\\ref{sec:results}',
		'\\citet[p.~4]{smith2020planning}',
		'$E = mc^2$',
		'\\(a^2 + b^2 = c^2\\)',
		'% reviewers should check this comment',
		'\\$',
		'\\begin{equation}\n  \\label{eq:growth}\n  growth = \\frac{revenue_{new} - revenue_{old}}{revenue_{old}}\n\\end{equation}',
		'\\begin{align*}\n  total &= base + bonus \\\\\n  bonus &= rate \\times hours\n\\end{align*}',
		'$$ average = \\frac{sum}{count} $$',
		'\\[ variance = expected - mean \\]',
		'\\begin{figure}[htbp]',
		'\\includegraphics[width=0.8\\textwidth]{figures/roadmap-overview.png}',
		'\\begin{verbatim}\nverbatim text that must stay exactly as written\n\\end{verbatim}',
		'\\begin{lstlisting}[language=Python]\nprint("please do not change this string")\n\\end{lstlisting}',
		'\\url{https://example.com/docs/proposal}',
		'\\href{https://example.com/status}{',
		'\\verb|npm run release|',
		'\\begin{tabular}{|l|c|}',
	]) {
		assertCovered(tex, 'latex', s, 1);
	}
	assert.equal(formatMask(tex, 'latex')[tex.indexOf('Component & Owner') + 10], 1); // tabular "&"
	for (const s of [
		'Quarterly planning notes',
		'Introduction',
		'Please review the attached proposal before Friday',
		'Roadmap overview for the coming quarter',
		'the status page',
		'Scheduler',
	]) {
		assertCovered(tex, 'latex', s, 0);
	}
});

test('format text and unset format behave exactly as before', () => {
	const text = 'Leverage agile frameworks to provide a robust synopsis for high level overviews.\n';
	for (const engine of ['word', 'classic']) {
		const o = { ...HEAVY, seed: 't', engine };
		assert.equal(simcockify(text, { ...o, format: 'text' }), simcockify(text, o));
		assert.equal(simcockify(text, { ...o, format: 'auto' }), simcockify(text, o));
		assert.deepEqual(simcockifyDetailed(SAMPLES.markdown, { ...o, format: 'text' }), simcockifyDetailed(SAMPLES.markdown, o));
	}
	assert.equal(
		simcockify(SAMPLES.markdown, { ...HEAVY, seed: 'm', format: 'auto' }),
		simcockify(SAMPLES.markdown, { ...HEAVY, seed: 'm', format: 'markdown' }),
	);
	assert.throws(() => simcockify('x', { format: 'rst' }), /unknown format "rst"; choose one of: auto, text, markdown, html, latex/);
	assert.equal(resolveOptions({ format: 'latex' }).format, 'latex');
});

test('simcockifySegments (the DOM path) ignores format', () => {
	const parts = ['Please review the <b>attached</b> proposal', ' before Friday and send feedback.'];
	assert.deepEqual(
		simcockifySegments(parts, { ...HEAVY, seed: 'd', format: 'html' }),
		simcockifySegments(parts, { ...HEAVY, seed: 'd' }),
	);
});

test('detection: representative samples', () => {
	assert.equal(detectFormat(SAMPLES.markdown), 'markdown');
	assert.equal(detectFormat(SAMPLES.html), 'html');
	assert.equal(detectFormat(SAMPLES.latex), 'latex');
	assert.equal(detectFormat('Please review the attached proposal before Friday.\nThanks, the team.\n'), 'text');
	assert.equal(detectFormat(''), 'text');
	// Without decisive markers.
	assert.equal(detectFormat('# Notes\n\nSee the [guide](docs/guide.md).\n\n- one item\n- another item\n'), 'markdown');
	assert.equal(detectFormat('| a | b |\n| --- | --- |\n| 1 | 2 |\n'), 'markdown');
	assert.equal(detectFormat('<p>Please review the proposal.</p>\n<p>Send <em>feedback</em> soon.</p>\n'), 'html');
	assert.equal(detectFormat('<note><to>Team</to><body>Please review it.</body></note>'), 'html');
	assert.equal(detectFormat('\\section{Results}\nThe value $x$ grows, see \\emph{Table} \\ref{t}.\n'), 'latex');
	assert.equal(detectFormat('\\begin{itemize}\n\\item one\n\\end{itemize}\n'), 'latex');
	// Decisive markers.
	assert.equal(detectFormat('<?xml version="1.0"?>\n<root>text</root>'), 'html');
	assert.equal(detectFormat('Intro text\n<html><body>hi</body></html>'), 'html');
	assert.equal(detectFormat('% preamble\n\\documentclass{article}\nHello.'), 'latex');
	assert.equal(detectFormat('---\ntitle: Post\n---\nJust prose here.\n'), 'markdown');
	assert.equal(detectFormat('Run this:\n\n```\nmake all\n```\n'), 'markdown');
	assert.equal(detectFormat('+++\ntitle = "Post"\n+++\nProse.\n'), 'markdown');
});

test('detection: ambiguous cases', () => {
	// A little emphasis, a lone list item, prices or a stray tag are not enough.
	assert.equal(detectFormat('That was *really* good, thanks.\n'), 'text');
	assert.equal(detectFormat('Shopping:\n- milk\n'), 'text');
	assert.equal(detectFormat('It costs $5 and $10 later, or $15 in total.\n'), 'text');
	assert.equal(detectFormat('Use a <br> here.\n'), 'text');
	assert.equal(detectFormat('Paid 50% upfront, see C:\\docs for details.\n'), 'text');
	// The earliest decisive marker wins: markdown showing HTML or LaTeX in a fence.
	assert.equal(detectFormat('```html\n<!doctype html>\n<html></html>\n```\n'), 'markdown');
	assert.equal(detectFormat('```tex\n\\documentclass{article}\n```\n'), 'markdown');
	// Close call between markdown and HTML: the more protective format wins.
	// (markdown: heading 2 + two list items = 4; html: two tag pairs = 4)
	const mixed = '# Shortcuts\n\n- Press <kbd>Ctrl</kbd> and <kbd>C</kbd> to copy\n- Press Esc to close\n';
	const covered = (f) => formatMask(mixed, f).reduce((n, v) => n + v, 0);
	const expected = covered('markdown') >= covered('html') ? 'markdown' : 'html';
	assert.equal(detectFormat(mixed), expected);
	assert.equal(expected, 'markdown');
	// Not close: HTML with one stray markdown-looking line stays HTML.
	assert.equal(detectFormat('<div><p>Intro</p><p>More</p><ul><li>a</li><li>b</li></ul></div>\n- note\n'), 'html');
	// Only the first 8 KB are read.
	assert.equal(detectFormat('word '.repeat(2000) + '\n\\documentclass{article}\n'), 'text');
});

test('detection: hints', () => {
	assert.equal(formatFromHint('notes/draft.MD'), 'markdown');
	assert.equal(formatFromHint('.tex'), 'latex');
	assert.equal(formatFromHint('xml'), 'html');
	assert.equal(formatFromHint('page.htm'), 'html');
	assert.equal(formatFromHint('README'), undefined);
	const plain = 'Please review the attached proposal before Friday.\n';
	assert.equal(detectFormat(plain, 'draft.md'), 'markdown');
	assert.equal(detectFormat(plain, 'draft.tex'), 'latex');
	assert.equal(detectFormat(SAMPLES.markdown, 'unknown.ext'), 'markdown');
	// A hint beats ordinary evidence...
	assert.equal(detectFormat('<p>one</p><p>two</p>', 'notes.md'), 'markdown');
	assert.equal(detectFormat('# Heading\n\n- a\n- b\n', 'notes.txt'), 'text');
	// ...but not a decisive marker for another format when the hinted format has no evidence.
	assert.equal(detectFormat('Run:\n```\nmake\n```\n', 'notes.txt'), 'markdown');
	assert.equal(detectFormat('\\documentclass{article}\nHi.', 'paper.md'), 'latex');
});

function cli(args, input = '') {
	return spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8', timeout: 15000 });
}

test('CLI: auto-detects by default; --format and format: override', () => {
	const md = SAMPLES.markdown;
	const o = { seed: 'cli', DeadlinesLooming: 20, EmployeesBlocked: 15 };
	const args = ['s:cli,dl:20,eb:15'];
	const auto = cli(args, md);
	assert.equal(auto.status, 0);
	assert.equal(auto.stdout, simcockify(md, { ...o, format: 'markdown' }));
	assertProtectedSurvive(md, auto.stdout, 'markdown', 'cli auto');
	assert.equal(cli([...args, '--format', 'text'], md).stdout, simcockify(md, o));
	assert.equal(cli([...args, '--format', 'md'], md).stdout, auto.stdout);
	assert.equal(cli(['s:cli,dl:20,eb:15,format:text'], md).stdout, simcockify(md, o));
	assert.equal(cli(['--config', configFile({ format: 'html' }), ...args], md).stdout, simcockify(md, { ...o, format: 'html' }));
	// Flags beat the shorthand.
	assert.equal(cli(['s:cli,dl:20,eb:15,format:text', '--format', 'markdown'], md).stdout, auto.stdout);
	for (const bad of [['--format', 'rst'], ['format:docx']]) {
		const r = cli(bad, md);
		assert.equal(r.status, 2, bad.join(' '));
		assert.match(r.stderr, /format must be one of: auto, text, markdown, html, latex/);
	}
	assert.match(cli(['--help']).stdout, /--format <name>/);
	assert.match(cli(['--debug', ...args], md).stderr, /Format: markdown/);
});

test('CLI: a file extension is a strong hint', () => {
	const text = 'Release notes\n\nPlease review the <b>attached</b> proposal before Friday and send feedback.\n';
	const o = { seed: 'ext', DeadlinesLooming: 30, EmployeesBlocked: 20 };
	const write = (name) => {
		const p = join(dir, name);
		writeFileSync(p, text);
		return p;
	};
	for (const [name, format] of [['notes.md', 'markdown'], ['notes.html', 'html'], ['notes.tex', 'latex'], ['notes.txt', 'text']]) {
		const r = cli(['s:ext,dl:30,eb:20', write(name)]);
		assert.equal(r.status, 0, name);
		assert.equal(r.stdout, simcockify(text, { ...o, format }), name);
	}
	// --format still wins over the extension.
	assert.equal(cli(['s:ext,dl:30,eb:20', write('x.tex'), '--format', 'text']).stdout, simcockify(text, { ...o, format: 'text' }));
});

function configFile(obj) {
	const p = join(dir, `c${Math.random()}.json`);
	writeFileSync(p, JSON.stringify(obj));
	return p;
}
