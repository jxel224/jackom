/**
 * Single point of contact with the shared-types package. Every other file under apps/server/src
 * imports shared types via a relative path to THIS file (e.g. `../shared.js`, `../../shared.js`),
 * so the awkward `packages/shared-types/src` relative path only has to be written once.
 */
export * from '../../../packages/shared-types/src/index.js';
