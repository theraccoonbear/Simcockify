// Assembles the GitHub Pages site into site/: the demo page plus the
// browser bundle. Run `npm run build` first so dist/ exists.
import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site');

const files = [
	['demo/index.html', 'index.html'],
	['dist/simcockify.browser.js', 'simcockify.browser.js'],
	['dist/simcockify.browser.js.map', 'simcockify.browser.js.map'],
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const [from, to] of files) {
	const src = join(root, from);
	try {
		await access(src);
	} catch {
		console.error(`Missing ${from}; run "npm run build" first.`);
		process.exit(1);
	}
	await cp(src, join(out, to));
}

// Serve files as-is; skip Jekyll processing.
await writeFile(join(out, '.nojekyll'), '');
console.log(`Site assembled in ${out}`);
