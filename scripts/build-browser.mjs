// Bundles the DOM helper and the jQuery adapter into one browser script
// exposing a global `Simcockify`.
import { build } from 'esbuild';

await build({
	entryPoints: ['src/browser.ts'],
	bundle: true,
	format: 'iife',
	globalName: 'Simcockify',
	target: 'es2018',
	minify: true,
	sourcemap: true,
	outfile: 'dist/simcockify.browser.js',
});
