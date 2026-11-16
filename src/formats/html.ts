// HTML and XML: everything but text content is protected.
import { Mask, protectMatches } from './mask.js';

export const ENTITY = /&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g;

/** Attribute-aware body of a tag: quoted values may contain `>`. */
const TAG_BODY = `(?:[^>"']|"[^"]*"|'[^']*')*`;

/** Elements whose whole content is protected. */
export const RAW_ELEMENTS = ['script', 'style', 'pre', 'code', 'textarea', 'svg', 'math'];

const HTML_TOKEN = new RegExp(
	[
		'<!--[\\s\\S]*?(?:-->|$)', // comment
		'<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>|$)', // CDATA
		'<![A-Za-z][^>]*>', // doctype and other declarations
		'<\\?[\\s\\S]*?(?:\\?>|$)', // processing instructions, <?xml ...?>
		`<(${RAW_ELEMENTS.join('|')})(?=[\\s/>])${TAG_BODY}>[\\s\\S]*?(?:<\\/\\1\\s*>|$)`, // element with protected content
		`<\\/?[A-Za-z][^\\s/>]*${TAG_BODY}>`, // any other tag, with its attributes
		ENTITY.source,
	].join('|'),
	'gi',
);

/**
 * Protects tags and their attributes, comments, CDATA, declarations,
 * processing instructions, entities, and the whole of `script`, `style`,
 * `pre`, `code`, `textarea`, `svg` and `math` elements.
 */
export function htmlMask(text: string): Mask {
	const mask = new Uint8Array(text.length);
	protectMatches(text, mask, HTML_TOKEN);
	return mask;
}
