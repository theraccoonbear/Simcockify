import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, isProtectedChunk } from '../dist/index.js';

const kinds = (t) => tokenize(t).map((tok) => `${tok.kind}:${tok.text}`);

test('tokens concatenate back to the input', () => {
	const t = '  Hello, world!\n\nSee https://x.io/a — `code here` and don’t stop. 😀👍🏽 naïve ';
	assert.equal(tokenize(t).map((x) => x.text).join(''), t);
});

test('words, whitespace and punctuation are separated; apostrophes stay inside words', () => {
	assert.deepEqual(kinds("Don't stop, they’re here."), [
		"word:Don't", 'space: ', 'word:stop', 'punct:,', 'space: ', 'word:they’re', 'space: ', 'word:here', 'punct:.',
	]);
	assert.deepEqual(kinds('high-level'), ['word:high', 'punct:-', 'word:level']);
});

test('URLs, emails, numbers, handles, tags, code spans and code-ish tokens are protected', () => {
	for (const chunk of [
		'https://example.com/path?q=1', 'www.example.org', 'someone@example.com', 'mailto:a@b.co', '3.14', '1,000', '42nd',
		'v2', '@handle', '#hashtag', 'snake_case', 'camelCase', 'JavaScript', 'src/core.ts', 'C:\\Windows', 'package.json',
		'.eslintrc', 'a=b', 'fn()', '--engine', '<p>',
	]) {
		assert.ok(isProtectedChunk(chunk), chunk);
		assert.deepEqual(kinds(chunk), [`skip:${chunk}`], chunk);
	}
	assert.deepEqual(kinds('run `npm run build` now'), ['word:run', 'space: ', 'skip:`npm run build`', 'space: ', 'word:now']);
	assert.ok(kinds('a\n```\nfenced code block\n```\nb').includes('skip:```\nfenced code block\n```'));
	assert.deepEqual(kinds('NASA'), ['skip:NASA']);
	for (const word of ['hello', 'Hello', 'naïve', 'Ελληνικά', 'and/or'.slice(0, 3)]) assert.ok(!isProtectedChunk(word), word);
});

test('emoji and symbols are punctuation, never words', () => {
	assert.deepEqual(kinds('hi 👨‍👩‍👧!'), ['word:hi', 'space: ', 'punct:👨‍👩‍👧!']);
});
