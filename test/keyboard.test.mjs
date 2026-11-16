import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearbyKeys, accessibleKeys, KEYBOARD_MAPS } from '../dist/index.js';

const QWERTY = KEYBOARD_MAPS.QWERTY;
const keys = (c, d) => nearbyKeys(c, QWERTY, d).map((k) => k.key).sort();

test('nearbyKeys: immediate neighbours on the staggered layout, every row in range', () => {
	assert.deepEqual(keys('s', 1.25), ['a', 'd', 'e', 'w', 'x', 'z']);
	assert.deepEqual(keys('g', 1.25), ['b', 'f', 'h', 't', 'v', 'y']);
	// Bottom row reaches up; the classic lookup excludes the last row in range.
	assert.ok(keys('z', 1.25).includes('a'));
	assert.ok(keys('m', 1.25).includes('j'));
});

test('nearbyKeys: window is centred on the key at any column', () => {
	// 'p' sits far right; the classic slice end index (2 * velocity) cuts it off.
	assert.deepEqual(keys('p', 1.25), ['l', 'o']);
	assert.deepEqual(accessibleKeys('p', QWERTY, 4).filter((k) => k === 'o' || k === 'l'), []);
});

test('nearbyKeys: wider distance reaches further, nearest first', () => {
	const near = keys('s', 1.25);
	const far = nearbyKeys('s', QWERTY, 2.25);
	assert.ok(far.length > near.length);
	assert.ok(far.every((k, i) => i === 0 || far[i - 1].distance <= k.distance));
});

test('nearbyKeys: preserves case, letters only, unknown characters give none', () => {
	assert.deepEqual(keys('S', 1.25), ['A', 'D', 'E', 'W', 'X', 'Z']);
	assert.ok(nearbyKeys('l', QWERTY, 2).every((k) => /^[a-z]$/.test(k.key)));
	assert.deepEqual(nearbyKeys('é', QWERTY, 2), []);
	assert.deepEqual(nearbyKeys('😀', QWERTY, 2), []);
});

test('accessibleKeys keeps its classic behaviour', () => {
	assert.deepEqual(accessibleKeys('é', QWERTY, 4), ['é']);
	// rowTo is exclusive: from the top row only rows 0 and 1 are used.
	assert.ok(accessibleKeys('1', QWERTY, 4).every((k) => '`1234567890-=\tqwertyuiop[]\\'.includes(k)));
});
