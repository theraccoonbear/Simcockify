import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simcockify } from '../dist/index.js';
import { closestKey, isShorthandSpec, parseShorthand, SHORTHAND_ALIASES } from '../dist/shorthand.js';

const BIN = new URL('../bin/simcockify.js', import.meta.url).pathname;
const TEXT = 'Leverage agile frameworks to provide a robust synopsis for high level overviews.\n';
const dir = mkdtempSync(join(tmpdir(), 'simcockify-sh-'));

function cli(args, input = TEXT, cwd) {
	return spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8', timeout: 15000, cwd });
}
function file(name, content) {
	const p = join(dir, name);
	writeFileSync(p, content);
	return p;
}

test('aliases map to options', () => {
	assert.deepEqual(SHORTHAND_ALIASES, {
		c: 'Coffees',
		e: 'Espressos',
		fhe: 'FiveHourEnergies',
		hos: 'HoursOfSleep',
		mtc: 'MinutesTalkingToClients',
		dl: 'DeadlinesLooming',
		eb: 'EmployeesBlocked',
		s: 'seed',
		f: 'fatigue',
		p: 'persona',
	});
	assert.deepEqual(parseShorthand('fhe:3,eb:8,s:demo'), [
		{ key: 'fhe', option: 'FiveHourEnergies', value: '3' },
		{ key: 'eb', option: 'EmployeesBlocked', value: '8' },
		{ key: 's', option: 'seed', value: 'demo' },
	]);
});

test('full option names and flag names work in any case', () => {
	const options = (spec) => parseShorthand(spec).map((e) => e.option);
	assert.deepEqual(options('coffees:3,FiveHourEnergies:1,HOURSOFSLEEP:4'), ['Coffees', 'FiveHourEnergies', 'HoursOfSleep']);
	assert.deepEqual(options('five-hour-energies:1,deadlines-looming:2'), ['FiveHourEnergies', 'DeadlinesLooming']);
	assert.deepEqual(options('FHE:1,Eb:2,engine:classic,reveal:json,keyboard:qwerty,persona:caffeinated'), [
		'FiveHourEnergies',
		'EmployeesBlocked',
		'engine',
		'reveal',
		'keyboard',
		'persona',
	]);
});

test('spec recognition', () => {
	for (const s of ['fhe:3', 'fhe:3,eb:8', 'S:abc', 'f:-0.5', 'p:post-launch,dl:4', 's:']) assert.ok(isShorthandSpec(s), s);
	for (const s of ['fhe', 'notes.txt', '3:fhe', 'fhe:3,', ',fhe:3', 'fhe:3, eb:8', '/etc/motd', '-']) {
		assert.ok(!isShorthandSpec(s), s);
	}
});

test('unknown keys suggest the closest match', () => {
	assert.equal(closestKey('fhw'), 'fhe');
	assert.equal(closestKey('cofees'), 'coffees');
	assert.equal(closestKey('zzzzzz'), undefined);
	assert.throws(() => parseShorthand('fhw:3'), /unknown shorthand key "fhw"; did you mean "fhe" \(FiveHourEnergies\)\?/);
	const r = cli(['fhw:3']);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /did you mean "fhe"/);
	assert.equal(r.stdout, '');
	assert.match(cli(['qqqqqq:1']).stderr, /known keys: c, e, fhe/);
});

test('shorthand matches the equivalent flags and library options', () => {
	const r = cli(['fhe:3,eb:8,s:demo']);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, simcockify(TEXT, { seed: 'demo', FiveHourEnergies: 3, EmployeesBlocked: 8 }));
	assert.equal(r.stdout, cli(['--seed', 'demo', '--five-hour-energies', '3', '--employees-blocked', '8']).stdout);
	const all = cli(['c:3,e:1,fhe:1,hos:5,mtc:30,dl:4,eb:2,s:x,f:0.5,p:caffeinated']);
	assert.equal(all.status, 0);
	assert.equal(
		all.stdout,
		simcockify(TEXT, {
			seed: 'x',
			persona: 'caffeinated',
			Coffees: 3,
			Espressos: 1,
			FiveHourEnergies: 1,
			HoursOfSleep: 5,
			MinutesTalkingToClients: 30,
			DeadlinesLooming: 4,
			EmployeesBlocked: 2,
			fatigue: 0.5,
		}),
	);
	assert.equal(cli(['s:r,dl:20,reveal:json']).stdout, simcockify(TEXT, { seed: 'r', DeadlinesLooming: 20, reveal: 'json' }));
	assert.equal(cli(['s:r,dl:20,engine:classic']).stdout, simcockify(TEXT, { seed: 'r', DeadlinesLooming: 20, engine: 'classic' }));
});

test('layering: defaults < persona < config < shorthand < flags', () => {
	const cfg = file('layer.json', JSON.stringify({ seed: 'cfg', persona: 'post-launch', DeadlinesLooming: 9, Coffees: 5 }));
	// Shorthand overrides config; unset config values remain; the config persona applies.
	assert.equal(
		cli(['--config', cfg, 'dl:1,s:sh']).stdout,
		simcockify(TEXT, { seed: 'sh', persona: 'post-launch', DeadlinesLooming: 1, Coffees: 5 }),
	);
	// Flags override shorthand.
	assert.equal(
		cli(['--config', cfg, 'dl:1,s:sh', '--deadlines-looming', '15', '--seed', 'flag']).stdout,
		simcockify(TEXT, { seed: 'flag', persona: 'post-launch', DeadlinesLooming: 15, Coffees: 5 }),
	);
	// A shorthand persona replaces the config persona; a flag persona replaces both.
	assert.equal(
		cli(['--config', cfg, 'p:caffeinated']).stdout,
		simcockify(TEXT, { seed: 'cfg', persona: 'caffeinated', DeadlinesLooming: 9, Coffees: 5 }),
	);
	assert.equal(
		cli(['--config', cfg, 'p:caffeinated', '--persona', 'client-call']).stdout,
		simcockify(TEXT, { seed: 'cfg', persona: 'client-call', DeadlinesLooming: 9, Coffees: 5 }),
	);
	// Shorthand overrides the persona's own values.
	assert.equal(
		cli(['p:post-launch,hos:8,s:z']).stdout,
		simcockify(TEXT, { seed: 'z', persona: 'post-launch', HoursOfSleep: 8 }),
	);
	// Later keys win within a spec and across specs.
	assert.equal(cli(['s:a,dl:3,dl:12', 'eb:4,eb:6']).stdout, simcockify(TEXT, { seed: 'a', DeadlinesLooming: 12, EmployeesBlocked: 6 }));
});

test('invalid shorthand values are usage errors', () => {
	for (const spec of ['fhe:x', 'fhe:', 'f:2', 'p:nobody', 'engine:fancy', 'reveal:xml', 'keyboard:dvorak']) {
		const r = cli([spec]);
		assert.equal(r.status, 2, spec);
		assert.match(r.stderr, new RegExp(`^simcockify: shorthand ${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `), spec);
		assert.equal(r.stdout, '', spec);
	}
});

test('a file argument is read instead of stdin', () => {
	const p = file('draft.md', TEXT);
	const r = cli(['s:f,dl:10', p], 'stdin text that must be ignored\n');
	assert.equal(r.status, 0);
	assert.equal(r.stdout, simcockify(TEXT, { seed: 'f', DeadlinesLooming: 10 }));
	// Order does not matter, and flags still apply.
	assert.equal(cli([p, '--seed', 'f', '--deadlines-looming', '10'], '').stdout, r.stdout);
	// A relative path.
	assert.equal(cli(['s:f,dl:10', 'draft.md'], '', dir).stdout, r.stdout);
	// "-" means stdin.
	assert.equal(cli(['s:f,dl:10', '-']).stdout, r.stdout);
});

test('file vs stdin vs spec disambiguation', () => {
	// A file whose name looks like a spec is still read as a spec.
	file('dl:5', 'never read\n');
	assert.equal(cli(['dl:5,s:q'], TEXT, dir).stdout, simcockify(TEXT, { seed: 'q', DeadlinesLooming: 5 }));
	// A name that is neither a spec nor an existing file is an error.
	const missing = cli(['no-such-file.txt']);
	assert.equal(missing.status, 2);
	assert.match(missing.stderr, /"no-such-file.txt" is not an existing file or a key:value spec/);
	// A near-spec with a space is reported as such.
	assert.match(cli(['fhe:3, eb:8']).stderr, /is not a key:value spec \(check for spaces/);
	// Directories are not input files.
	mkdirSync(join(dir, 'sub'), { recursive: true });
	assert.equal(cli([join(dir, 'sub')]).status, 2);
	// Only one input file.
	const a = file('a.txt', 'a\n');
	const two = cli([a, a]);
	assert.equal(two.status, 2);
	assert.match(two.stderr, /only one input file/);
	// --help wins over positional arguments.
	assert.match(cli(['--help', 'whatever']).stdout, /Usage: simcockify/);
});

test('a plain pipe with no arguments works (cat /etc/motd | simcockify)', () => {
	const motd = 'Welcome to the build server.\nScheduled maintenance happens every Sunday morning.\n';
	const r = cli([], motd);
	assert.equal(r.status, 0);
	assert.equal(r.stderr, '');
	// Unseeded, so the exact text varies; the line structure and word count do not change much.
	assert.equal(r.stdout.split('\n').length, motd.split('\n').length);
	// Neutral conditions through the shorthand give the input back unchanged.
	assert.equal(cli(['c:2'], motd).stdout, motd);
	// Empty input gives empty output.
	assert.equal(cli([], '').stdout, '');
});

test('--help documents the shorthand', () => {
	const h = cli(['--help'], '').stdout;
	assert.match(h, /Usage: simcockify \[options\] \[spec\] \[file\]/);
	assert.match(h, /fhe FiveHourEnergies/);
	assert.match(h, /cat my-document\.md \| simcockify fhe:3,eb:8 > human-document\.md/);
	assert.match(h, /config file, then the shorthand spec, then flags/);
});
