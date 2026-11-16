export { simcockify, createSimcockifier, simcockifySegments, resolveOptions, layerOptions, personaOptions } from './core.js';
export type { Change, SegmentResult } from './core.js';
export { HOMOPHONES } from './mutations.js';
export { PERSONAS, PERSONA_NAMES } from './personas.js';
export type { Persona } from './personas.js';
export {
	DEFAULT_OPTIONS,
	DEFAULT_TYPO_WEIGHTS,
	NUMERIC_OPTIONS,
	TYPO_TYPES,
	ENGINES,
	typoRate,
	typoVelocity,
} from './options.js';
export type { SimcockifyOptions, Engine, TypoType, TypoWeights } from './options.js';
export { KEYBOARD_MAPS, accessibleKeys, nearbyKeys } from './keyboard.js';
export type { KeyboardMap, NearbyKey } from './keyboard.js';
export { createRandom, createSeededRandom, hashCode } from './random.js';
export { tokenize, isProtectedChunk } from './tokenize.js';
export type { Token, TokenKind } from './tokenize.js';
