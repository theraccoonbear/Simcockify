#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { run } from '../dist/cli.js';

const code = run(process.argv.slice(2), {
	stdin: () => readFileSync(0, 'utf8'),
	stdout: (s) => process.stdout.write(s),
	stderr: (s) => process.stderr.write(s),
	stdinIsTTY: process.stdin.isTTY === true,
});
process.exitCode = code;
