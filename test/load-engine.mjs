import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const m = html.match(/\/\* ENGINE-START \*\/([\s\S]*?)\/\* ENGINE-END \*\//);
if (!m) throw new Error('ENGINE-START/ENGINE-END markers not found in index.html');

// Names we expose for testing. Extend this list as the engine grows.
const EXPORTS = [
  'X_LIMIT', 'X_LONG_SOFT_LIMIT', 'NOSTR_SOFT_LIMIT',
  'decodeEntities', 'normalizeLumaUrl', 'lumaSlug', 'fmtHashtags',
  'formatEventTime', 'timezoneConversions',
  'enforceXLimit', 'stripLinks', 'sanitizeVenueText',
  'parseJsonLdEvent', 'validateEvent',
  'deepFindEvent', 'lumaToEvent',
  'buildProxyAttempts',
  'TONES', 'STYLES',
  'STAGES', 'compose', 'buildStage'
];

const code = m[1] + `\n;globalThis.__engine = { ${EXPORTS.join(', ')} };`;
const sandbox = { console };
vm.createContext(sandbox);
new vm.Script(code).runInContext(sandbox);
export const engine = sandbox.__engine;
