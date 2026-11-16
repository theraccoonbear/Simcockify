// Entry point for the browser bundle (global `Simcockify`).
import { install } from './jquery.js';

export * from './index.js';
export { simcockifyElement } from './dom.js';
export { install as installJQuery } from './jquery.js';

const jq = (globalThis as { jQuery?: Parameters<typeof install>[0] }).jQuery;
if (jq) install(jq);
