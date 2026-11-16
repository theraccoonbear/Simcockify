import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simcockify } from '../dist/index.js';

const BIN = new URL('../bin/simcockify.js', import.meta.url).pathname;
const TEXT = 'Leverage agile frameworks to provide a robust synopsis for high level overviews.\n';
const dir = mkdtempSync(join(tmpdir(), 'simcockify-'));

function cli(args, input = TEXT) {
	return spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8', timeout: 15000 });
}
function config(obj) {
	const p = join(dir, `c${Math.random()}.json`);
	writeFileSync(p, JSON.stringify(obj));
	return p;
}

test('stdin to stdout, matching the library', () => {
	const r = cli(['--seed', 'abc', '--coffees', '5', '--hours-of-sleep', '4']);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, simcockify(TEXT, { seed: 'abc', Coffees: 5, HoursOfSleep: 4 }));
});

test('same seed is repeatable across runs', () => {
	assert.equal(cli(['--seed', 'q']).stdout, cli(['--seed', 'q']).stdout);
});

test('every numeric flag is accepted', () => {
	const r = cli(['--seed', '1', '--five-hour-energies', '1', '--espressos', '1', '--coffees', '3', '--hours-of-sleep', '6',
		'--minutes-talking-to-clients', '30', '--deadlines-looming', '2', '--employees-blocked', '1', '--keyboard', 'qwerty']);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, simcockify(TEXT, { seed: '1', FiveHourEnergies: 1, Espressos: 1, Coffees: 3, HoursOfSleep: 6,
		MinutesTalkingToClients: 30, DeadlinesLooming: 2, EmployeesBlocked: 1 }));
});

test('config file supplies options', () => {
	const r = cli(['--config', config({ seed: 'cfg', DeadlinesLooming: 9 })]);
	assert.equal(r.stdout, simcockify(TEXT, { seed: 'cfg', DeadlinesLooming: 9 }));
});

test('flags override config values; unset config values remain', () => {
	const p = config({ seed: 'cfg', DeadlinesLooming: 9, Coffees: 5 });
	const r = cli(['--config', p, '--seed', 'flag', '--coffees', '1']);
	assert.equal(r.stdout, simcockify(TEXT, { seed: 'flag', DeadlinesLooming: 9, Coffees: 1 }));
});

test('--help and --version exit 0', () => {
	const h = cli(['--help'], '');
	assert.equal(h.status, 0);
	assert.match(h.stdout, /Usage: simcockify/);
	const v = cli(['--version'], '');
	assert.equal(v.status, 0);
	assert.equal(v.stdout.trim(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
});

test('bad input exits non-zero with a message', () => {
	for (const args of [['--bogus'], ['--coffees', 'lots'], ['--keyboard', 'dvorak'], ['--config', join(dir, 'missing.json')],
		['--config', config([1, 2])], ['--config', config({ nope: 1 })]]) {
		const r = cli(args);
		assert.notEqual(r.status, 0, args.join(' '));
		assert.match(r.stderr, /^simcockify: /, args.join(' '));
		assert.equal(r.stdout, '');
	}
	const bad = join(dir, 'bad.json');
	writeFileSync(bad, '{not json');
	const r = cli(['--config', bad]);
	assert.notEqual(r.status, 0);
	assert.match(r.stderr, /not valid JSON/);
});

test('--debug logs to stderr, not stdout', () => {
	const r = cli(['--seed', '1', '--debug']);
	assert.match(r.stderr, /TEXT:/);
	assert.doesNotMatch(r.stdout, /TEXT:/);
});
