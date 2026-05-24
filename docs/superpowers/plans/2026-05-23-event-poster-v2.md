# Event Poster v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the single-file Event Poster tool with a "Bitcoin Circle" visual redesign, a data-driven template copy engine (Style × Tone), hardened Luma import, correct timezone handling, and an accessibility/mobile/bug sweep — preserving all v1 functionality and hard constraints.

**Architecture:** One `index.html` (inline CSS + inline JS, <50 KB, no build, no deps, no CDN). The inline `<script>` is split into a **pure engine** block (DOM-free: config, helpers, timezone, Luma parsing, copy engine) wrapped in `/* ENGINE-START */ … /* ENGINE-END */` markers, and a **DOM layer** (render, form/state, init) below it. The pure block is unit-tested in Node by extracting it from `index.html` and evaluating it in a `vm` sandbox. The DOM/visual layer is verified with the Playwright MCP against the spec's §12 acceptance criteria.

**Tech Stack:** Vanilla HTML/CSS/JS (ES2020+, `Intl` for dates). Node ≥18 built-in `node:test` + `node:assert` for unit tests (dev-only, in `test/`). Playwright MCP for UI verification. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-23-event-poster-v2-design.md` (authoritative; section refs below point to it). **Branch:** `event-poster-v2`.

---

## File Structure

- **Modify:** `index.html` — the app. Inline `<script>` reorganized into sections:
  - `/* ENGINE-START */` config constants → pure helpers (`decodeEntities`, `normalizeLumaUrl`, `lumaSlug`, `fmtHashtags`) → timezone (`formatEventTime`, `timezoneConversions`) → Luma parse (`parseJsonLdEvent`, `deepFindEvent`, `readerToEvent`, `validateEvent`, `lumaToEvent`, `buildProxyAttempts`, `sanitizeVenueText`) → copy engine (`TONES`, `STYLES`, `STAGES`, `enforceXLimit`, `stripLinks`, `buildStages`, `compose`) `/* ENGINE-END */`
  - DOM layer: `fetchLumaHtml`, `importLumaUrl`, `renderOutput`, `updateCount`, copy/clipboard, form (`readForm`, `applyEvent`, `regenerate`), selectors, init.
- **Keep mostly as-is:** `events.json` (verify neutral; no schema change needed).
- **Create:** `test/load-engine.mjs` — extracts + evaluates the ENGINE block from `index.html`, exports the engine object.
- **Create:** `test/engine.test.mjs` — `node:test` unit tests for the pure engine.
- **Modify:** `README.md`, `BUILD_SPEC.md` — bring to v2 (spec §10b).
- **Note:** `test/` is dev-only and not part of the deployed product (GitHub Pages serves the root; the test dir is harmless). It does not count against the `index.html` 50 KB budget.

---

## Phase A — Test harness + pure helpers

### Task 1: Add the ENGINE markers and the test loader

**Files:**
- Modify: `index.html` (inside `<script>`, near the top constants)
- Create: `test/load-engine.mjs`
- Create: `test/engine.test.mjs`

- [ ] **Step 1: Add ENGINE markers around the existing pure constants in `index.html`.** Find the line `const X_LIMIT = 280;` and wrap the existing pure constants so the block looks exactly like this (we will grow this block in later tasks):

```js
/* ENGINE-START */
const X_LIMIT = 280;
const X_LONG_SOFT_LIMIT = 2000;
const NOSTR_SOFT_LIMIT = 500;
/* ENGINE-END */
```

Make sure `FALLBACK_DATA`, `TONES`, and the DOM code remain BELOW `/* ENGINE-END */` for now.

- [ ] **Step 2: Write the loader** `test/load-engine.mjs`:

```js
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
  'X_LIMIT', 'X_LONG_SOFT_LIMIT', 'NOSTR_SOFT_LIMIT'
];

const code = m[1] + `\n;globalThis.__engine = { ${EXPORTS.join(', ')} };`;
const sandbox = { console };
vm.createContext(sandbox);
new vm.Script(code).runInContext(sandbox);
export const engine = sandbox.__engine;
```

- [ ] **Step 3: Write the first test** `test/engine.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './load-engine.mjs';

test('engine loads and exposes limits', () => {
  assert.equal(engine.X_LIMIT, 280);
  assert.equal(engine.X_LONG_SOFT_LIMIT, 2000);
  assert.equal(engine.NOSTR_SOFT_LIMIT, 500);
});
```

- [ ] **Step 4: Run the test, expect PASS.**

Run: `node --test 'test/*.test.mjs'`
Expected: 1 test passing. (If it fails with "markers not found," re-check Step 1.)

- [ ] **Step 5: Commit.**

```bash
git add index.html test/load-engine.mjs test/engine.test.mjs
git commit -m "test: add zero-dep engine test harness with vm loader"
```

---

### Task 2: Pure entity decoder + URL helpers

Refactor `decodeHtml` (which uses the DOM) into a pure `decodeEntities`, and move the URL helpers into the ENGINE block so they're testable.

**Files:**
- Modify: `index.html` (move/refactor helpers into ENGINE block)
- Modify: `test/load-engine.mjs` (add exports)
- Modify: `test/engine.test.mjs`

- [ ] **Step 1: Write failing tests.** Add to `test/engine.test.mjs`:

```js
test('decodeEntities handles named + numeric entities, no DOM', () => {
  assert.equal(engine.decodeEntities('Tom &amp; Jerry'), 'Tom & Jerry');
  assert.equal(engine.decodeEntities('caf&#233; &lt;b&gt;'), 'café <b>');
  assert.equal(engine.decodeEntities('&quot;hi&quot; &#x27;x&#x27;'), '"hi" \'x\'');
  assert.equal(engine.decodeEntities(''), '');
});

test('normalizeLumaUrl adds scheme + bare slug', () => {
  assert.equal(engine.normalizeLumaUrl('luma.com/abc'), 'https://luma.com/abc');
  assert.equal(engine.normalizeLumaUrl('abc123'), 'https://luma.com/abc123');
  assert.equal(engine.normalizeLumaUrl('https://luma.com/x?y=1'), 'https://luma.com/x?y=1');
  assert.equal(engine.normalizeLumaUrl(''), '');
});

test('lumaSlug extracts the first path segment', () => {
  assert.equal(engine.lumaSlug('https://luma.com/mrxb609z?lm_source=embed'), 'mrxb609z');
  assert.equal(engine.lumaSlug('pks2tmn1'), 'pks2tmn1');
});
```

- [ ] **Step 2: Run, expect FAIL** (`engine.decodeEntities is not a function`).

Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Implement inside the ENGINE block** in `index.html` (add below the limit constants, before `/* ENGINE-END */`):

```js
function decodeEntities(s){
  const named = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", '#39':"'", nbsp:' ' };
  return (s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
    if(code[0] === '#'){
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const key = code.toLowerCase();
    return key in named ? named[key] : m;
  });
}
function normalizeLumaUrl(s){
  const raw = (s || '').trim();
  if(!raw) return '';
  if(/^https?:\/\//i.test(raw)) return raw;
  return `https://luma.com/${raw.replace(/^\/+/, '')}`;
}
function lumaSlug(url){
  try{ return new URL(normalizeLumaUrl(url)).pathname.split('/').filter(Boolean)[0] || ''; }
  catch(e){ return (url || '').replace(/^https?:\/\/[^/]+\//, '').split(/[?#/]/)[0]; }
}
function fmtHashtags(s){
  if(!s) return '';
  return s.split(/\s+/).filter(Boolean).map(h => h.startsWith('#') ? h : '#'+h).join(' ');
}
```

Then **delete the old DOM-based `decodeHtml`** below the markers and replace every `decodeHtml(` call in the file with `decodeEntities(`. Remove the old `normalizeLumaUrl`/`lumaSlug`/`fmtHashtags` definitions that were below the markers (now duplicated) so there is exactly one definition of each, inside the ENGINE block.

- [ ] **Step 4: Update exports** in `test/load-engine.mjs` — add to `EXPORTS`: `'decodeEntities', 'normalizeLumaUrl', 'lumaSlug', 'fmtHashtags'`.

- [ ] **Step 5: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'` → all passing.

- [ ] **Step 6: Commit.**

```bash
git add index.html test/
git commit -m "refactor: pure decodeEntities + URL helpers in engine block"
```

---

### Task 3: Timezone formatting + conversions

Replace v1's hardcoded `America/Denver` with real-zone formatting and add Live-stage conversions (spec §7).

**Files:** Modify `index.html` (ENGINE block), `test/load-engine.mjs`, `test/engine.test.mjs`.

- [ ] **Step 1: Write failing tests.**

```js
test('formatEventTime renders in the event zone with short tz label', () => {
  // 2026-05-28T18:30:00-06:00 is 6:30 PM in America/Denver (MDT)
  const out = engine.formatEventTime('2026-05-28T18:30:00-06:00', 'America/Denver');
  assert.match(out, /Thu, May 28/);
  assert.match(out, /6:30 ?PM MDT|6:30 PM MDT/);
});

test('formatEventTime infers zone from offset when IANA missing', () => {
  const out = engine.formatEventTime('2026-05-28T18:30:00-06:00', '');
  assert.match(out, /6:30 PM|6:30 PM/); // still renders a time + GMT-ish label
});

test('timezoneConversions returns deduped local+ET+PT, DST-correct', () => {
  const conv = engine.timezoneConversions('2026-05-28T19:00:00-06:00', 'America/Denver');
  // 7:00 PM MDT -> 9:00 PM EDT -> 6:00 PM PDT
  assert.match(conv, /7:00 PM MDT/);
  assert.match(conv, /9:00 PM EDT/);
  assert.match(conv, /6:00 PM PDT/);
  assert.equal(conv.split('·').length, 3);
});

test('timezoneConversions dedupes when event is already Eastern', () => {
  const conv = engine.timezoneConversions('2026-05-28T21:00:00-04:00', 'America/New_York');
  // 9 PM EDT local; ET equals local so it is not repeated -> local + PT only
  assert.equal(conv.split('·').length, 2);
  assert.match(conv, /9:00 PM EDT/);
  assert.match(conv, /6:00 PM PDT/);
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Implement in the ENGINE block.**

```js
function fmtParts(iso, tz){
  const opts = { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' };
  if(tz) opts.timeZone = tz;
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(new Date(iso))
    .reduce((a,p) => (a[p.type] = p.value, a), {});
  return parts;
}
function formatEventTime(iso, tz){
  if(!iso) return '';
  try{
    const p = fmtParts(iso, tz);
    return `${p.weekday}, ${p.month} ${p.day} · ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`.replace(/\s+/g, ' ').trim();
  }catch(e){ return ''; }
}
function clockIn(iso, tz){
  const p = fmtParts(iso, tz);
  return `${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`;
}
function timezoneConversions(iso, tz){
  if(!iso) return '';
  const zones = [tz || 'America/Denver', 'America/New_York', 'America/Los_Angeles'];
  const seen = new Set();
  const out = [];
  for(const z of zones){
    let label;
    try{ label = clockIn(iso, z); }catch(e){ continue; }
    if(seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.join(' · ');
}
```

- [ ] **Step 4: Update exports** — add `'formatEventTime', 'timezoneConversions'`.

- [ ] **Step 5: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'`

  Note: `Intl` may emit a narrow no-break space (` `) before AM/PM. The test regex above tolerates both; if an assertion still fails on whitespace, normalize in the function with `.replace(/ /g, ' ')` and re-run.

- [ ] **Step 6: Commit.**

```bash
git add index.html test/
git commit -m "feat: real-zone time formatting + live-stage conversions"
```

---

### Task 4: X-limit enforcement + link stripping

**Files:** Modify `index.html` (ENGINE block — move `trimTo`/`enforceXLimit` up, add `stripLinks`), `test/*`.

- [ ] **Step 1: Write failing tests.**

```js
test('enforceXLimit keeps short posts unchanged', () => {
  const s = 'Short and sweet';
  assert.equal(engine.enforceXLimit(s), s);
});

test('enforceXLimit trims to <= 280 and protects URL/hashtag lines', () => {
  const long = 'A'.repeat(300) + '\nRSVP: https://luma.com/x\n#Bitcoin';
  const out = engine.enforceXLimit(long);
  assert.ok(out.length <= 280, `len=${out.length}`);
  assert.match(out, /https:\/\/luma\.com\/x/);
  assert.match(out, /#Bitcoin/);
});

test('stripLinks removes URLs from long-X body', () => {
  const body = 'Come hear it.\nRSVP: https://luma.com/x\nSee you';
  const out = engine.stripLinks(body);
  assert.doesNotMatch(out, /https?:\/\//);
  assert.doesNotMatch(out, /luma\.com/);
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Move `trimTo` and `enforceXLimit` into the ENGINE block** (they already exist below the markers — relocate the existing definitions above `/* ENGINE-END */` and delete the originals). Then **add** `stripLinks`:

```js
function stripLinks(text){
  return (text || '')
    .split('\n')
    .map(line => line.replace(/https?:\/\/\S+/g, '').replace(/\b[\w.-]+\.(?:com|org|net|io|co)\/\S*/gi, ''))
    .map(line => line.replace(/\bRSVP:\s*$/i, '').replace(/[ \t]+$/,''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

- [ ] **Step 4: Update exports** — add `'enforceXLimit', 'stripLinks'`.

- [ ] **Step 5: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 6: Commit.**

```bash
git add index.html test/
git commit -m "feat: link stripping for long-X; relocate X-limit enforcement to engine"
```

---

### Task 5: Venue-neutrality sanitizer

Keep v1's `sanitizeVenueText` but move it into the ENGINE block and lock it with tests (spec §10).

**Files:** Modify `index.html`, `test/*`.

- [ ] **Step 1: Write failing tests.**

```js
test('sanitizeVenueText scrubs forbidden venue references', () => {
  const dirty = 'Hosted at The Space tonight. A Space member spoke. #TheSpace';
  const clean = engine.sanitizeVenueText(dirty);
  assert.doesNotMatch(clean, /The Space/);
  assert.doesNotMatch(clean, /Space member/i);
  assert.doesNotMatch(clean, /#TheSpace/);
  assert.match(clean, /the venue/);
  assert.match(clean, /community member/i);
  assert.match(clean, /#Bitcoin/);
});

test('sanitizeVenueText leaves clean text alone', () => {
  const s = 'Denver Bitcoin meetup at 6:30 PM';
  assert.equal(engine.sanitizeVenueText(s), s);
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Relocate the existing `sanitizeVenueText` into the ENGINE block** (move the v1 definition above `/* ENGINE-END */`, delete the original). It already uses `String.fromCharCode` obfuscation; keep that intact.

- [ ] **Step 4: Update exports** — add `'sanitizeVenueText'`.

- [ ] **Step 5: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 6: Commit.**

```bash
git add index.html test/
git commit -m "test: lock venue-neutrality sanitizer; move to engine"
```

---

## Phase B — Luma import (parsing)

### Task 6: JSON-LD Event parser + validator

**Files:** Modify `index.html` (ENGINE block), `test/*`.

- [ ] **Step 1: Write failing tests.**

```js
const JSONLD_HTML = `<html><head>
<script type="application/ld+json">
{"@type":"Event","name":"Bitcoin in Healthcare","startDate":"2026-05-28T18:30:00-06:00",
 "description":"How to build a practice on a Bitcoin standard.","url":"https://luma.com/pks2tmn1",
 "location":{"@type":"Place","name":"Denver"}}
</script></head><body></body></html>`;

test('parseJsonLdEvent pulls name/startDate/description/url', () => {
  const ev = engine.parseJsonLdEvent(JSONLD_HTML);
  assert.equal(ev.name, 'Bitcoin in Healthcare');
  assert.equal(ev.startDate, '2026-05-28T18:30:00-06:00');
  assert.match(ev.description, /Bitcoin standard/);
  assert.equal(ev.url, 'https://luma.com/pks2tmn1');
});

test('parseJsonLdEvent returns null when absent', () => {
  assert.equal(engine.parseJsonLdEvent('<html></html>'), null);
});

test('validateEvent requires a title and (date or description)', () => {
  assert.equal(engine.validateEvent({ title:'X', date_iso:'2026-01-01T00:00:00Z' }), true);
  assert.equal(engine.validateEvent({ title:'X', description:'hi' }), true);
  assert.equal(engine.validateEvent({ title:'' }), false);
  assert.equal(engine.validateEvent({ title:'X' }), false);
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Implement in the ENGINE block** (adapt v1's `findEventJsonLd` to be pure — it already only uses regex + `decodeEntities`; rename and move it in):

```js
function parseJsonLdEvent(html){
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for(const script of scripts){
    const json = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try{
      const data = JSON.parse(decodeEntities(json));
      const items = Array.isArray(data) ? data : [data];
      const ev = items.find(it => it && (it['@type'] === 'Event' || (Array.isArray(it['@type']) && it['@type'].includes('Event'))));
      if(ev) return ev;
    }catch(e){}
  }
  return null;
}
function validateEvent(ev){
  return !!(ev && ev.title && (ev.date_iso || ev.description));
}
```

- [ ] **Step 4: Update exports** — add `'parseJsonLdEvent', 'validateEvent'`.

- [ ] **Step 5: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 6: Commit.**

```bash
git add index.html test/
git commit -m "feat: pure JSON-LD Event parser + result validator"
```

---

### Task 7: `__NEXT_DATA__` deep-search + `lumaToEvent` integration

Replace v1's brittle fixed-path `findNextDataEvent` with a deep search, and wire `lumaToEvent` to prefer JSON-LD, then deep-search, then reader text (spec §8).

**Files:** Modify `index.html` (ENGINE block), `test/*`.

- [ ] **Step 1: Write failing tests.**

```js
const NEXT_HTML = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"somethingNew":{"event":{"name":"Denver BitDevs",
 "start_at":"2026-06-04T17:00:00-06:00","timezone":"America/Denver",
 "url":"https://luma.com/yj1xgw3q"}}}}}
</script></body></html>`;

test('deepFindEvent finds an event-shaped object regardless of path', () => {
  const ev = engine.deepFindEvent(NEXT_HTML);
  assert.equal(ev.name, 'Denver BitDevs');
  assert.equal(ev.start_at, '2026-06-04T17:00:00-06:00');
  assert.equal(ev.timezone, 'America/Denver');
});

test('lumaToEvent builds a normalized event from JSON-LD html', () => {
  const ev = engine.lumaToEvent(JSONLD_HTML, 'https://luma.com/pks2tmn1');
  assert.equal(ev.title, 'Bitcoin in Healthcare');
  assert.equal(ev.date_iso, '2026-05-28T18:30:00-06:00');
  assert.match(ev.date_display, /6:30 PM MDT/);
  assert.equal(ev.luma_url, 'https://luma.com/pks2tmn1');
  assert.ok(engine.validateEvent(ev));
});

test('lumaToEvent uses __NEXT_DATA__ timezone for display', () => {
  const ev = engine.lumaToEvent(NEXT_HTML, 'https://luma.com/yj1xgw3q');
  assert.equal(ev.title, 'Denver BitDevs');
  assert.equal(ev.tz, 'America/Denver');
  assert.match(ev.date_display, /5:00 PM MDT/);
});

test('lumaToEvent throws when no title found', () => {
  assert.throws(() => engine.lumaToEvent('<html></html>', ''), /title/i);
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Implement in the ENGINE block.** Add `deepFindEvent`, keep the pure reader helpers from v1 (`cleanReaderLine`, `readerTitle`, `readerDate`, `readerDescription`, `stripLumaTitle`, `metaContent`, `extractSpeaker`, `docToText` — move them into the ENGINE block; they are already DOM-free except none use the DOM after Task 2's `decodeEntities` swap). Then rewrite `lumaToEvent` to set `tz` and use `formatEventTime`:

```js
function deepFindEvent(html){
  const m = html.match(/<script id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!m) return null;
  let data; try{ data = JSON.parse(decodeEntities(m[1])); }catch(e){ return null; }
  const looksLikeEvent = o => o && typeof o === 'object' && typeof o.name === 'string'
    && (o.start_at || o.startDate || o.start_time);
  const stack = [data];
  while(stack.length){
    const node = stack.pop();
    if(Array.isArray(node)){ for(const v of node) stack.push(v); continue; }
    if(node && typeof node === 'object'){
      if(node.event && looksLikeEvent(node.event)) return node.event;
      if(looksLikeEvent(node)) return node;
      for(const k in node) stack.push(node[k]);
    }
  }
  return null;
}
function lumaToEvent(input, fallbackUrl){
  const raw = input || '';
  const html = raw.includes('<') ? raw : '';
  const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const jsonLd = html ? parseJsonLdEvent(html) : null;
  const nextEv = html ? (deepFindEvent(html) || {}) : {};
  const date_iso = jsonLd?.startDate || nextEv.start_at || nextEv.startDate || '';
  const tz = nextEv.timezone || '';
  const title = stripLumaTitle(jsonLd?.name || nextEv.name || metaContent(html, 'og:title') || readerTitle(raw)
    || (raw.match(/(.+?)\s+·\s+Luma/) || [])[1] || '');
  if(!title) throw new Error('Could not find an event title in that Luma content.');
  const description = jsonLd?.description || metaContent(html, 'og:description') || readerDescription(lines) || '';
  const url = normalizeLumaUrl(jsonLd?.url || metaContent(html, 'og:url') || fallbackUrl || nextEv.url || '');
  const date_display = date_iso ? formatEventTime(date_iso, tz) : (readerDate(lines) || '');
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    title: sanitizeVenueText(title),
    date_iso, tz, date_display,
    host: 'Denver Bitcoin meetup',
    speaker: extractSpeaker(title, description),
    speaker_org:'', speaker_x:'', speaker_nostr:'',
    description: sanitizeVenueText(description),
    hashtags: ['#Bitcoin', '#Denver'],
    luma_url: url, style:'conversational', tone:'educational',
    image_url: Array.isArray(jsonLd?.image) ? jsonLd.image[0] : (jsonLd?.image || nextEv.cover_url || '')
  };
}
```

Delete the old `findEventJsonLd`, `findNextDataEvent`, and v1 `lumaToEvent` below the markers.

- [ ] **Step 4: Update exports** — add `'deepFindEvent', 'lumaToEvent'`.

- [ ] **Step 5: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 6: Commit.**

```bash
git add index.html test/
git commit -m "feat: deep-search __NEXT_DATA__ + zone-aware lumaToEvent"
```

---

### Task 8: Proxy attempt list (Jina fix + parallel race wiring)

Unit-test the proxy URL construction (the Jina fix lives here); the actual `fetch` race is thin orchestration verified in Phase E.

**Files:** Modify `index.html` (ENGINE block adds `buildProxyAttempts`; DOM layer's `fetchLumaHtml` consumes it), `test/*`.

- [ ] **Step 1: Write failing tests.**

```js
test('buildProxyAttempts includes 4 no-key proxies with correct Jina URL', () => {
  const url = 'https://luma.com/mrxb609z';
  const attempts = engine.buildProxyAttempts(url);
  const urls = attempts.map(a => a.url);
  assert.equal(attempts.length, 4);
  assert.ok(urls.some(u => u.includes('api.codetabs.com/v1/proxy?quest=')));
  assert.ok(urls.some(u => u.includes('api.allorigins.win/get?url=')));
  assert.ok(urls.some(u => u.includes('corsproxy.io/?url=')));
  // Jina fix: single prefix, no doubled host, no leading http:// duplication
  const jina = urls.find(u => u.includes('r.jina.ai'));
  assert.equal(jina, 'https://r.jina.ai/https://luma.com/mrxb609z');
  assert.doesNotMatch(jina, /r\.jina\.ai\/http:\/\/r\.jina\.ai/);
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Implement `buildProxyAttempts` in the ENGINE block.**

```js
function buildProxyAttempts(url){
  const enc = encodeURIComponent(url);
  return [
    { name:'codetabs',   kind:'raw',  url:`https://api.codetabs.com/v1/proxy?quest=${enc}` },
    { name:'corsproxy',  kind:'raw',  url:`https://corsproxy.io/?url=${enc}` },
    { name:'allorigins', kind:'json', url:`https://api.allorigins.win/get?url=${enc}` },
    { name:'jina',       kind:'raw',  url:`https://r.jina.ai/${url}` }
  ];
}
```

- [ ] **Step 4: Rewrite `fetchLumaHtml` in the DOM layer** (below `/* ENGINE-END */`) to race the attempts and validate:

```js
async function fetchTextWithTimeout(url, ms){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try{ const r = await fetch(url, { signal: ctrl.signal }); if(!r.ok) throw new Error('status '+r.status); return await r.text(); }
  finally{ clearTimeout(t); }
}
async function runAttempt(a){
  const text = await fetchTextWithTimeout(a.url, 15000);
  const body = a.kind === 'json' ? (JSON.parse(text).contents || '') : text;
  if(!(body.includes('application/ld+json') || body.includes('__NEXT_DATA__') || /^Title:/mi.test(body)))
    throw new Error('no event data');
  // Confirm we can actually parse it before declaring victory.
  const ev = lumaToEvent(body, '');
  if(!validateEvent(ev)) throw new Error('unparseable');
  return body;
}
async function fetchLumaHtml(url){
  const attempts = buildProxyAttempts(url).map(a => () => runAttempt({ ...a, url: a.url }));
  return await Promise.any(attempts.map(fn => fn()));
}
```

- [ ] **Step 5: Update exports** — add `'buildProxyAttempts'`.

- [ ] **Step 6: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'` (network race itself is verified in Phase E).

- [ ] **Step 7: Commit.**

```bash
git add index.html test/
git commit -m "feat: parallel proxy race + Jina URL fix"
```

---

## Phase C — Copy engine

### Task 9: TONES + STYLES voice/skeleton data

Replace v1's `TONES` with the reworked voice banks (spec §5.4) and add `STYLES` (spec §5.2). Move both into the ENGINE block.

**Files:** Modify `index.html` (ENGINE block), `test/*`.

- [ ] **Step 1: Write failing tests.**

```js
test('TONES has the four reworked tones, each with opener+cta+signoff arrays', () => {
  for(const t of ['educational', 'welcoming', 'cypherpunk', 'punchy']){
    assert.ok(engine.TONES[t], `missing tone ${t}`);
    assert.ok(Array.isArray(engine.TONES[t].openers) && engine.TONES[t].openers.length >= 3);
    assert.ok(Array.isArray(engine.TONES[t].ctas) && engine.TONES[t].ctas.length >= 2);
    assert.ok(Array.isArray(engine.TONES[t].signoffs));
  }
});

test('STYLES are structured + conversational', () => {
  assert.deepEqual(Object.keys(engine.STYLES).sort(), ['conversational', 'structured']);
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Implement in the ENGINE block** (delete v1's `TONES` below the markers):

```js
const TONES = {
  educational: {
    openers: ['Ever wonder', 'Here’s a good one:', 'Worth knowing about:', 'New on the calendar — and worth your time:'],
    ctas: ['Free to RSVP →', 'Save your seat →', 'Details + RSVP →', 'Sign up to attend →'],
    signoffs: ['Bring your questions.', 'Come curious.']
  },
  welcoming: {
    openers: ['You’re invited 👋', 'Come hang with us:', 'New to Bitcoin? Start here:', 'All welcome —'],
    ctas: ['First time? Just show up →', 'RSVP and say hi →', 'Bring a friend →'],
    signoffs: ['Newcomers genuinely welcome.', 'No experience needed — just curiosity.']
  },
  cypherpunk: {
    openers: ['Signal:', 'For the orange-pilled:', 'Sound money, in person:', 'Tune out the noise —'],
    ctas: ['RSVP. No KYC.', 'Show up. Stay sovereign.', 'Lock it in →'],
    signoffs: ['Be there.', 'Bring cash, bring questions.']
  },
  punchy: {
    openers: ['Mark it. 📅', 'This one’s big.', 'Don’t sleep on this:', 'Lock it in.'],
    ctas: ['RSVP now →', 'Grab a spot →', 'Go. →'],
    signoffs: ['See you there.', 'Pull up.']
  }
};
const STYLES = { structured:{ id:'structured' }, conversational:{ id:'conversational' } };
```

- [ ] **Step 4: Update exports** — add `'TONES', 'STYLES'`.

- [ ] **Step 5: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 6: Commit.**

```bash
git add index.html test/
git commit -m "feat: reworked tone voice banks + style data"
```

---

### Task 10: STAGES + `buildStages`/`compose`

The heart of the rewrite: data-driven 6-stage builder honoring spec §5.3 rules and §5.5 skeletons. Use a fixed (seeded) picker in tests for determinism.

**Files:** Modify `index.html` (ENGINE block), `test/*`.

- [ ] **Step 1: Write failing tests.**

```js
const EV = {
  title:'Bitcoin in Healthcare', speaker:'Dr. Noah Kaufman', speaker_x:'@noah', speaker_nostr:'',
  date_iso:'2026-05-28T18:30:00-06:00', tz:'America/Denver',
  date_display:'Thu, May 28 · 6:30 PM MDT', hook:'How do you build a practice on a Bitcoin standard?',
  luma_url:'https://luma.com/pks2tmn1', youtube_url:'', hashtags:'#Bitcoin #Healthcare', venue:'Denver Bitcoin meetup'
};

test('compose returns 6 stages, each with x/xlong/nostr strings', () => {
  const posts = engine.compose(EV, 'conversational', 'educational');
  assert.equal(posts.length, 6);
  for(const p of posts){
    assert.equal(typeof p.x, 'string');
    assert.equal(typeof p.xlong, 'string');
    assert.equal(typeof p.nostr, 'string');
    assert.ok(p.stage && p.when);
  }
});

test('short X is always <= 280', () => {
  for(const style of ['structured', 'conversational']){
    for(const tone of ['educational', 'welcoming', 'cypherpunk', 'punchy']){
      for(const p of engine.compose(EV, style, tone)) assert.ok(p.x.length <= 280, `${style}/${tone}/${p.stage}=${p.x.length}`);
    }
  }
});

test('long X never contains a URL (link-light)', () => {
  for(const p of engine.compose(EV, 'conversational', 'educational')) assert.doesNotMatch(p.xlong, /https?:\/\/|luma\.com/);
});

test('pre-event stages have no blank placeholders; post-event have at most one', () => {
  const posts = engine.compose(EV, 'conversational', 'educational');
  const byStage = Object.fromEntries(posts.map(p => [p.stage, p]));
  const preStages = ['Announcement', '7-day reminder', '24-hr reminder', 'Live update'];
  for(const s of preStages){
    const all = byStage[s].x + byStage[s].xlong + byStage[s].nostr;
    assert.doesNotMatch(all, /\[[^\]]+\]/, `unexpected blank in ${s}`);
  }
  assert.match(byStage['Follow-up'].x, /\[[^\]]+\]/);
});

test('announcement includes the RSVP URL on short X and Nostr', () => {
  const a = engine.compose(EV, 'structured', 'educational')[0];
  assert.match(a.x, /luma\.com\/pks2tmn1/);
  assert.match(a.nostr, /luma\.com\/pks2tmn1/);
});

test('live stage shows timezone conversions', () => {
  const live = engine.compose(EV, 'conversational', 'punchy').find(p => p.stage === 'Live update');
  assert.match(live.x, /9:00 PM EDT/);
});

test('youtube recap: X says link in reply, nostr embeds url', () => {
  const ev = { ...EV, youtube_url:'https://youtube.com/watch?v=abc' };
  const recap = engine.compose(ev, 'conversational', 'educational').find(p => p.stage === 'YouTube recap');
  assert.match(recap.x, /reply/i);
  assert.doesNotMatch(recap.x, /youtube\.com/);
  assert.match(recap.nostr, /youtube\.com\/watch\?v=abc/);
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `node --test 'test/*.test.mjs'`

- [ ] **Step 3: Implement the engine.** Add to the ENGINE block. `pickWith` is deterministic given a seed so behavior is testable; `compose` defaults the seed to a rotating value in the DOM layer.

```js
function pickWith(arr, seed){ return arr[Math.abs(seed) % arr.length]; }
function speakerTag(ev){ return ev.speaker_x ? (ev.speaker_x.startsWith('@') ? ev.speaker_x : '@'+ev.speaker_x) : (ev.speaker || ''); }
function venueLabel(ev){ return ev.venue || 'Denver Bitcoin meetup'; }
function daysUntil(iso){ if(!iso) return 7; return Math.max(0, Math.round((new Date(iso) - new Date()) / 86400000)); }

const STAGES = [
  { id:'announce', label:'Announcement', when:'post now' },
  { id:'rem7',     label:'7-day reminder', when:'7 days before' },
  { id:'rem1',     label:'24-hr reminder', when:'1 day before' },
  { id:'live',     label:'Live update', when:'day-of, at start' },
  { id:'followup', label:'Follow-up', when:'day after' },
  { id:'recap',    label:'YouTube recap', when:'after recording is live' }
];

function buildStage(stage, ev, style, tone, seed){
  const T = TONES[tone] || TONES.educational;
  const conv = style === 'conversational';
  const opener = pickWith(T.openers, seed);
  const cta = pickWith(T.ctas, seed + 1);
  const signoff = pickWith(T.signoffs, seed + 2);
  const tag = speakerTag(ev);
  const venue = venueLabel(ev);
  const tags = ev.hashtags || '';
  const rsvp = ev.luma_url || '';
  const date = ev.date_display || '';
  const conversions = ev.date_iso ? timezoneConversions(ev.date_iso, ev.tz) : (date || '');
  const yt = ev.youtube_url || '';
  const hook = ev.hook || '';

  const J = (...lines) => lines.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();

  switch(stage.id){
    case 'announce':
      return {
        x: conv
          ? J(`${opener} ${hook || ev.title}`, ev.speaker && `${ev.speaker} is showing us.`, date && `📅 ${date}`, `${cta} ${rsvp}`, tags)
          : J(`New event: ${ev.title}`, date && `📅 ${date}`, `📍 ${venue}`, tag && `🎤 ${tag}`, `${cta} ${rsvp}`, tags),
        xlong: stripLinks(J(ev.title, '', hook || 'A new one is on the calendar.', '',
          ev.speaker ? `With ${ev.speaker}${ev.speaker_org ? ` (${ev.speaker_org})` : ''}.` : '', date, venue, '',
          signoff, '', "RSVP’s in the reply 👇", yt && 'Stream link in the reply too.', tags)),
        nostr: J(`${opener} ${ev.title}`, '', date && `📅 ${date}`, `📍 ${venue}`,
          ev.speaker && `🎤 ${ev.speaker}`, ev.speaker_nostr && `nostr:${ev.speaker_nostr}`, '', hook, '', cta, rsvp, '', tags)
      };
    case 'rem7': {
      const d = Math.max(daysUntil(ev.date_iso), 7);
      return {
        x: conv ? J(`One week out: ${ev.title}.`, hook, `RSVP: ${rsvp}`, tags)
                : J(`${d} days out — ${ev.title}`, date, `RSVP: ${rsvp}`, tags),
        xlong: stripLinks(J(`${d} days out: ${ev.title}`, '', date, ev.speaker && `With ${ev.speaker}.`, '',
          hook || 'Easy to miss, worth having on the calendar.', '', 'Know someone who’d enjoy it? Bring them.', '', signoff, tags)),
        nostr: J(`${d} days out: ${ev.title}`, date, hook, '', `RSVP: ${rsvp}`, '', tags)
      };
    }
    case 'rem1':
      return {
        x: conv ? J(`Tomorrow. ${ev.title}${ev.speaker ? ` with ${ev.speaker}` : ''}.`, `${date}`, `Last call to RSVP → ${rsvp}`, tags)
                : J(`Tomorrow — ${ev.title}`, `${date} · ${venue}`, tag, `${rsvp}`, tags),
        xlong: stripLinks(J(`Tomorrow: ${ev.title}`, '', date, venue, ev.speaker && `With ${ev.speaker}.`, '',
          hook || 'One more nudge before this happens.', '', 'RSVP if you’re coming and bring someone curious.', '', "Link’s in the reply 👇", tags)),
        nostr: J(`Tomorrow: ${ev.title}`, ev.speaker && `With ${ev.speaker}`, date, `📍 ${venue}`, '', `Last chance to RSVP:`, rsvp, '', tags)
      };
    case 'live':
      return {
        x: conv ? J(`We’re live 🔴 ${ev.title}`, conversions, `📍 ${venue}${yt ? ' — or catch the stream.' : ''}`, tags)
                : J(`LIVE — ${ev.title}`, `🔴 ${conversions}`, `📍 ${venue}`, tags),
        xlong: stripLinks(J(`We’re live: ${ev.title}`, '', conversions, hook, '',
          yt ? 'Streaming now — link in the reply.' : 'If you’re nearby, now’s the time to come through.', venue, tags)),
        nostr: J(`Live now 🔴 ${ev.title}`, conversions, '', hook, '', `📍 ${venue}`, yt && `Stream: ${yt}`, '', tags)
      };
    case 'followup':
      return {
        x: conv ? J(`${ev.title} — what a night.`, `The thing that stuck with me: [the one thing worth taking away]`, 'Recording soon 👇', tags)
                : J(`Recap: ${ev.title}${tag ? ` · ${tag}` : ''}`, `Big takeaway: [the one thing worth taking away]`, 'Recording soon.', tags),
        xlong: stripLinks(J(`${ev.title} — thanks to everyone who came out.`, '',
          'The one thing worth carrying forward: [the one thing worth taking away]', '',
          'Good questions, good people, good night.', '', 'Recording goes in the reply when it’s ready.', tags)),
        nostr: J(`Recap: ${ev.title}${ev.speaker ? ` with ${ev.speaker}` : ''}`, '',
          'The thing worth carrying home: [the one thing worth taking away]', '', 'Recording soon. Next time, bring a friend.', '', tags)
      };
    case 'recap':
      return {
        x: conv ? J(`The recording from ${ev.title} is up.`, 'If you missed it, the one bit worth your time: [one moment worth watching]', 'Link in the reply 👇', tags)
                : J(`Recording’s up: ${ev.title}`, 'Watch for: [one moment worth watching]', 'Link in the reply.', tags),
        xlong: stripLinks(J(`The recording from ${ev.title} is up.`, '',
          'For everyone who couldn’t make it — watch for: [one moment worth watching]', '',
          'The best events keep helping people after the room clears.', '', 'Link in the reply 👇', tags)),
        nostr: J(`The recording from ${ev.title} is up ⚡`, '',
          'If you couldn’t make it, here’s the one bit worth your time: [one moment worth watching]', '',
          `Watch: ${yt || '[paste YouTube link]'}`, '', tags)
      };
  }
}

function compose(ev, style, tone, seedBase){
  const seed = Number.isFinite(seedBase) ? seedBase : 0;
  return STAGES.map((stage, i) => {
    const out = buildStage(stage, ev, style, tone, seed + i * 7);
    return { stage: stage.label, when: stage.when, x: enforceXLimit(out.x), xlong: out.xlong, nostr: out.nostr.trim() };
  });
}
```

- [ ] **Step 4: Update exports** — add `'STAGES', 'compose', 'buildStage'`.

- [ ] **Step 5: Run, expect PASS.** Run: `node --test 'test/*.test.mjs'`. If a short-X case exceeds 280 for the `punchy` tone, confirm `enforceXLimit` is applied in `compose` (it is) and that the offending template line is protected correctly; tighten the template text, not the test.

- [ ] **Step 6: Commit.**

```bash
git add index.html test/
git commit -m "feat: data-driven 6-stage copy engine (Style x Tone)"
```

---

## Phase D — UI layer (visual + UX)

UI tasks are verified with the Playwright MCP (load `file://…/index.html`, assert DOM/behavior) plus visual inspection, since no DOM test framework is allowed. After each UI task, run the verification listed in its final step before committing.

### Task 11: Bitcoin Circle theme (CSS)

**Files:** Modify `index.html` `<style>` block (replace `:root` + component CSS per spec §3).

- [ ] **Step 1: Replace the `:root` variables** with the Bitcoin Circle palette:

```css
:root{
  --navy-950:#0f1129; --navy-900:#161837;
  --bg:#f8f9fc; --white:#fff; --field:#f0f1f5; --border:#e6e3dd;
  --text:#13141f; --text-2:#5c6178; --muted:#9196a8;
  --accent:#f7931a; --accent-deep:#e07f04; --on-accent:#0f1129;
  --x:#1d9bf0; --xlong:#7c5cc4; --nostr:#9b59ff;
  --ok:#30a46c; --error:#e5484d;
  --radius:16px; --radius-pill:9999px;
  --shadow:0 4px 16px rgba(0,0,0,.05);
  --font:'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 2: Replace base + button + panel + input CSS** to the light theme (full block — page bg `--bg`, white cards, pill buttons with near-black text on orange):

```css
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--accent-deep);text-decoration:none} a:hover{text-decoration:underline}
.wrap{max-width:1180px;margin:0 auto;padding:0 0 80px}
.topbar{background:var(--navy-950);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.logo{display:inline-flex;align-items:center;gap:10px;color:#fff;font-weight:700;font-size:18px}
.logo .dot{width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(247,147,26,.22)}
.topbar .sub{color:rgba(255,255,255,.7);font-size:12px}
.btn{display:inline-flex;align-items:center;gap:6px;background:var(--white);color:var(--text);border:1px solid var(--border);padding:9px 16px;border-radius:var(--radius-pill);font:inherit;font-size:13px;cursor:pointer;transition:all .15s}
.btn:hover{border-color:var(--accent)}
.btn.primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent);font-weight:600}
.btn.primary:hover{background:var(--accent-deep);border-color:var(--accent-deep)}
.btn.ghost{background:transparent;border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.85)}
.btn.ghost:hover{border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.06)}
.btn.small{padding:5px 12px;font-size:12px}
.btn:focus-visible, input:focus-visible, textarea:focus-visible, [role=radio]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.grid{display:grid;grid-template-columns:340px 1fr;gap:20px;padding:20px}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
.card{background:var(--white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.card + .card{margin-top:14px}
.overline{font-size:12px;font-weight:600;color:var(--accent-deep);text-transform:uppercase;letter-spacing:.07em;padding:14px 16px 0}
.card-body{padding:12px 16px 16px}
label{display:block;font-size:12px;color:var(--muted);margin:10px 0 5px}
input[type=text],textarea,select{width:100%;background:var(--field);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:10px 12px;font:inherit;font-size:14px;outline:none}
@media (max-width:900px){ input[type=text],textarea,select{font-size:16px} }
input:focus,textarea:focus{border-color:var(--accent)}
```

- [ ] **Step 3: Verify with Playwright MCP.** Open `index.html` via `mcp__playwright__browser_navigate` to the `file://` path, take a snapshot/screenshot. Confirm: navy header, light page, orange primary button with dark text. No console errors.

- [ ] **Step 4: Commit.**

```bash
git add index.html
git commit -m "style: Bitcoin Circle theme (navy header, white cards, orange accent)"
```

---

### Task 12: Markup — header, full form, output shell, checklist

**Files:** Modify `index.html` `<body>` (replace header + left panel + checklist; keep right `#output` container).

- [ ] **Step 1: Replace the header** with the navy topbar (Clear form + GitHub only; no Open Luma):

```html
<div class="topbar">
  <div><div class="logo"><span class="dot"></span> Event Poster</div>
  <div class="sub">Turn Luma events into X + Nostr campaigns.</div></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn ghost" id="btn-clear">Clear form</button>
    <a class="btn ghost" href="https://github.com/orangedaddocs/event-poster" target="_blank" rel="noopener">View on GitHub</a>
  </div>
</div>
```

- [ ] **Step 2: Replace the left form panel** with the full field set, including the new visible **Title**, stacked **Speaker X / npub**, and the **Style** selector before **Tone**:

```html
<section>
  <div class="card">
    <div class="overline">Luma import</div>
    <div class="card-body">
      <label for="luma_import_url">Luma event URL</label>
      <input type="text" id="luma_import_url" placeholder="https://luma.com/…" />
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px">
        <button class="btn primary" id="btn-import-luma">Import from Luma</button>
        <button class="btn" id="btn-toggle-luma-paste">Paste text/HTML</button>
      </div>
      <div id="luma-paste-wrap" hidden>
        <label for="luma_paste">Luma page text or HTML</label>
        <textarea id="luma_paste" placeholder="If import is blocked, paste the Luma page source or copied event text here."></textarea>
        <button class="btn" id="btn-parse-luma-paste" style="margin-top:8px">Use pasted content</button>
      </div>
      <div class="hint" id="import-status" aria-live="polite" style="font-size:12px;color:var(--muted);margin-top:9px">The Luma event is the source of truth; the fields below are just for edits.</div>
    </div>
  </div>

  <div class="card">
    <div class="overline">Event details</div>
    <div class="card-body">
      <label for="title">Title</label>
      <input type="text" id="title" placeholder="Event title" />
      <label for="date">Date / time</label>
      <input type="text" id="date" placeholder="Imported from Luma" />
      <label for="speaker">Speaker(s)</label>
      <input type="text" id="speaker" placeholder="Speaker name" />
      <label for="speaker_x">Speaker X handle (optional)</label>
      <input type="text" id="speaker_x" placeholder="@speaker" />
      <label for="speaker_nostr">Speaker Nostr npub (optional)</label>
      <input type="text" id="speaker_nostr" placeholder="npub1…" />
      <label for="hook">Hook / one-liner</label>
      <textarea id="hook" placeholder="Short event hook"></textarea>
      <label for="luma">Luma / RSVP URL</label>
      <input type="text" id="luma" placeholder="https://luma.com/…" />
      <label for="youtube">YouTube recording URL (optional)</label>
      <input type="text" id="youtube" placeholder="https://youtube.com/watch?v=…" />
      <label for="hashtags">Hashtags (space separated)</label>
      <input type="text" id="hashtags" placeholder="#Bitcoin #Denver #Nostr" />

      <label id="style-label">Style</label>
      <div class="seg" id="styleset" role="radiogroup" aria-labelledby="style-label"></div>
      <label id="tone-label">Tone</label>
      <div class="seg" id="toneset" role="radiogroup" aria-labelledby="tone-label"></div>

      <button class="btn primary" id="btn-generate" style="margin-top:14px;width:100%;justify-content:center">Generate posts</button>
    </div>
  </div>

  <div class="card">
    <div class="overline">Or load a seeded event</div>
    <div class="card-body" id="seed" style="display:flex;flex-direction:column;gap:8px"></div>
  </div>
</section>
```

- [ ] **Step 3: Add segmented-control CSS** (Style/Tone chips) to `<style>`:

```css
.seg{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:4px}
.seg [role=radio]{border:1px solid var(--border);border-radius:12px;padding:8px 10px;cursor:pointer;font-size:13px;font-weight:600;background:var(--white)}
.seg [role=radio] .desc{display:block;font-size:11px;color:var(--muted);font-weight:400;margin-top:1px}
.seg [role=radio][aria-checked=true]{border-color:var(--accent);background:rgba(247,147,26,.08)}
```

- [ ] **Step 4: Replace the checklist panel** — rename to "Posting checklist," keep quick-launch buttons:

```html
<div class="card" id="checklist-panel" hidden>
  <div class="overline">Posting checklist</div>
  <div class="card-body">
    <div class="checklist">
      <label><input type="checkbox" /> Look up + tag the speaker, add one image</label>
      <label><input type="checkbox" /> Post the Announcement now (X + Nostr)</label>
      <label><input type="checkbox" /> Schedule the 7-day + 24-hr reminders</label>
      <label><input type="checkbox" /> Day-of: post the Live update</label>
      <label><input type="checkbox" /> Day-after: post the Follow-up</label>
      <label><input type="checkbox" /> When the recording's up: post the recap, link in reply</label>
    </div>
    <div class="quicklaunch" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <a class="btn small" target="_blank" rel="noopener" href="https://x.com/compose/post">↗ X compose</a>
      <a class="btn small" target="_blank" rel="noopener" href="https://primal.net/home">↗ Primal</a>
      <a class="btn small" target="_blank" rel="noopener" href="https://damus.io">↗ Damus</a>
      <a class="btn small" target="_blank" rel="noopener" href="https://highlighter.com">↗ Highlighter</a>
    </div>
  </div>
</div>
```

Add `.checklist label{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--text-2);margin:6px 0}` to `<style>`.

- [ ] **Step 5: Verify with Playwright MCP.** Load the file; snapshot. Confirm all fields present (Title visible, X and npub on separate lines), Style + Tone radiogroups render, header has no "Open Luma." No console errors.

- [ ] **Step 6: Commit.**

```bash
git add index.html
git commit -m "feat: v2 markup — visible Title, Style selector, renamed checklist, header cleanup"
```

---

### Task 13: Render layer — auto-grow boxes, counts, copy/open, clipboard fallback, aria

**Files:** Modify `index.html` DOM layer (`renderOutput`, `updateCount`, copy helpers, add `autoGrow`).

- [ ] **Step 1: Replace `renderOutput`** to produce the three variants with sans auto-grow textareas, aria-labels, Open-in-X on short **and** long X, and an autosize call:

```js
function escapeHtml(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function netBlock(label, cls, id, text, limit, mode, stageLabel){
  const count = mode === 'short' ? `${text.length} / ${X_LIMIT}` : `${text.length} chars`;
  const open = (cls === 'x' || cls === 'xlong')
    ? `<button class="btn small" data-open-x="${id}" aria-label="Open ${label} for ${stageLabel} in X">Open in X</button>` : '';
  return `<div class="post">
    <div class="post-head"><span class="net ${cls}">${label}</span>
      <div class="post-actions"><button class="btn small" data-copy="${id}" aria-label="Copy ${label} for ${stageLabel}">Copy</button>${open}</div></div>
    <textarea class="post-body" id="${id}" data-mode="${mode}" data-limit="${limit}" spellcheck="true" aria-label="${label} draft for ${stageLabel}">${escapeHtml(text)}</textarea>
    <div class="post-meta"><span class="count${(mode==='short'&&text.length>X_LIMIT)?' warn':''}" data-target="${id}">${count}</span><span class="note" data-target="${id}"></span></div>
  </div>`;
}
function renderOutput(ev){
  const style = currentStyle(); const tone = currentTone();
  const posts = compose(ev, style, tone, Date.now() % 997);
  const out = document.getElementById('output');
  out.innerHTML = posts.map((p, i) => `
    <div class="card stage">
      <div class="stage-head"><span class="badge">${i+1} / ${posts.length}</span> <b>${p.stage}</b> <span class="when">${p.when}</span></div>
      <div class="posts">
        ${netBlock('𝕏 — X', 'x', 'x-'+i, p.x, X_LIMIT, 'short', p.stage)}
        ${netBlock('𝕏 — Long / link-light', 'xlong', 'xl-'+i, p.xlong, X_LONG_SOFT_LIMIT, 'long', p.stage)}
        ${netBlock('⚡ Nostr', 'nostr', 'n-'+i, p.nostr, NOSTR_SOFT_LIMIT, 'nostr', p.stage)}
      </div>
    </div>`).join('');
  document.getElementById('checklist-panel').hidden = false;
  out.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyText(postText(b.dataset.copy))));
  out.querySelectorAll('[data-open-x]').forEach(b => b.addEventListener('click', () => openXCompose(postText(b.dataset.openX))));
  out.querySelectorAll('.post-body').forEach(t => { autoGrow(t); updateCount(t.id); t.addEventListener('input', () => { autoGrow(t); updateCount(t.id); }); });
  window.scrollTo({ top: out.offsetTop - 20, behavior:'smooth' });
}
function autoGrow(t){ t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight, 64) + 'px'; }
function postText(id){ const n = document.getElementById(id); return 'value' in n ? n.value : n.innerText; }
```

- [ ] **Step 2: Replace `updateCount`** to handle all three modes (incl. the Nostr Highlighter hint that v1 never updated):

```js
function updateCount(id){
  const node = document.getElementById(id);
  const count = document.querySelector(`.count[data-target="${id}"]`);
  const note = document.querySelector(`.note[data-target="${id}"]`);
  if(!node || !count) return;
  const text = node.value; const len = text.length; const mode = node.dataset.mode;
  count.textContent = mode === 'short' ? `${len} / ${X_LIMIT}` : `${len} chars`;
  count.classList.toggle('warn', mode === 'short' && len > X_LIMIT);
  if(note){
    if(mode === 'short') note.textContent = len > X_LIMIT ? '⚠️ trim required' : '';
    else if(mode === 'long') note.textContent = /https?:\/\//.test(text) ? 'has link' : 'no in-post link';
    else note.textContent = len > NOSTR_SOFT_LIMIT ? '(long — consider Highlighter)' : '';
  }
}
```

- [ ] **Step 3: Add the clipboard fallback + X compose.**

```js
function toast(msg){ const t = document.getElementById('toast'); t.textContent = msg || 'Copied'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1400); }
function copyText(text){
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).then(() => toast('Copied')).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}
function fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{ document.execCommand('copy'); toast('Copied'); }catch(e){ toast('Copy failed — select and copy manually'); }
  document.body.removeChild(ta);
}
function openXCompose(text){ window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); }
```

- [ ] **Step 4: Add the post-card CSS** (sans body, badges, layout) to `<style>`:

```css
.stage-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--field);background:#fbfaf8;border-radius:var(--radius) var(--radius) 0 0}
.stage-head .when{margin-left:auto;font-size:12px;color:var(--muted)}
.badge{font-size:11px;background:rgba(247,147,26,.14);color:var(--accent-deep);border-radius:var(--radius-pill);padding:2px 9px;font-weight:600}
.posts{display:grid;grid-template-columns:repeat(3,1fr)}
@media (max-width:780px){.posts{grid-template-columns:1fr}}
.post{padding:13px 14px;border-top:1px solid var(--field)} .post + .post{border-left:1px solid var(--field)}
@media (max-width:780px){.post + .post{border-left:none}}
.post-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.net{font-size:11px;font-weight:600} .net.x{color:var(--x)} .net.xlong{color:var(--xlong)} .net.nostr{color:var(--nostr)}
.post-body{display:block;width:100%;min-height:64px;resize:vertical;background:#fbfaf8;border:1px solid #ebe7df;border-radius:12px;padding:10px 12px;font-family:var(--font);font-size:13px;line-height:1.55;color:var(--text);overflow:hidden}
.post-meta{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:11px;color:var(--muted)}
.count.warn{color:var(--error)}
.post-actions{display:flex;gap:6px}
@media (max-width:780px){.btn.small{padding:10px 14px}}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--ok);color:#fff;padding:10px 16px;border-radius:12px;font-weight:600;font-size:13px;opacity:0;pointer-events:none;transition:all .25s}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
```

Ensure `<div class="toast" id="toast">Copied</div>` exists before `</body>`.

- [ ] **Step 5: Verify with Playwright MCP.** Load file, click a seeded event (after Task 14 wires it; for now call `renderOutput(FALLBACK_DATA.events[0])` via `mcp__playwright__browser_evaluate`). Confirm 6 cards × 3 boxes, long-X/Nostr boxes taller than short-X, counts present, "Open in X" on X and Long. Test Copy returns text via the fallback on `file://`.

- [ ] **Step 6: Commit.**

```bash
git add index.html
git commit -m "feat: render layer — autosize boxes, full counts, clipboard fallback, aria"
```

---

### Task 14: Form/state — selectors, applyEvent, instant re-run, Regenerate + overwrite heads-up

**Files:** Modify `index.html` DOM layer (`readForm`, `applyEvent`, selectors, `init`, regenerate).

- [ ] **Step 1: Add selector rendering + current getters + edited-tracking.**

```js
const STYLE_OPTS = [['conversational','Conversational','Reads like a person wrote it'],['structured','Structured','Label-led, scannable']];
const TONE_OPTS = [['educational','📚 Educational','Why it matters'],['welcoming','🤝 Welcoming','Newcomers first'],['cypherpunk','🕶️ Cypherpunk','Signal, sovereignty'],['punchy','🥊 Punchy','Short, high energy']];
let manualEdited = false;
function renderSeg(id, opts, current){
  const wrap = document.getElementById(id);
  wrap.innerHTML = opts.map(([v,l,d]) =>
    `<div role="radio" tabindex="0" data-val="${v}" aria-checked="${v===current}">${l}<span class="desc">${d}</span></div>`).join('');
  wrap.querySelectorAll('[role=radio]').forEach(r => {
    const choose = () => { wrap.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x===r)); onKnobChange(); };
    r.addEventListener('click', choose);
    r.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); choose(); } });
  });
}
function currentStyle(){ return document.querySelector('#styleset [aria-checked=true]')?.dataset.val || 'conversational'; }
function currentTone(){ return document.querySelector('#toneset [aria-checked=true]')?.dataset.val || 'educational'; }
function onKnobChange(){ if(document.getElementById('title').value.trim()) renderOutput(readForm()); }
```

- [ ] **Step 2: Replace `readForm` / `applyEvent` / `val` / `setVal`** to include Title + style/tone, and set the seed venue:

```js
function val(id){ return document.getElementById(id).value.trim(); }
function setVal(id,v){ document.getElementById(id).value = v || ''; }
function readForm(){
  return {
    title: val('title'), date_display: val('date'), date_iso: window.__lastIso || '', tz: window.__lastTz || '',
    speaker: val('speaker'), speaker_x: val('speaker_x'), speaker_nostr: val('speaker_nostr'),
    hook: val('hook'), luma_url: val('luma'), youtube_url: val('youtube'),
    hashtags: fmtHashtags(val('hashtags')), venue: 'Denver Bitcoin meetup'
  };
}
function applyEvent(ev){
  window.__lastIso = ev.date_iso || ''; window.__lastTz = ev.tz || '';
  setVal('luma_import_url', ev.luma_url); setVal('title', ev.title); setVal('date', ev.date_display);
  setVal('speaker', ev.speaker); setVal('speaker_x', ev.speaker_x); setVal('speaker_nostr', ev.speaker_nostr);
  setVal('hook', ev.hook || ev.description); setVal('luma', ev.luma_url); setVal('youtube', ev.youtube_url || '');
  setVal('hashtags', Array.isArray(ev.hashtags) ? ev.hashtags.join(' ') : (ev.hashtags || ''));
  if(ev.style) document.querySelectorAll('#styleset [role=radio]').forEach(r => r.setAttribute('aria-checked', r.dataset.val===ev.style));
  if(ev.tone) document.querySelectorAll('#toneset [role=radio]').forEach(r => r.setAttribute('aria-checked', r.dataset.val===ev.tone));
  manualEdited = false;
  renderOutput(readForm());
  setGenerateLabel();
}
function setGenerateLabel(){ document.getElementById('btn-generate').textContent = document.getElementById('output').children.length ? 'Regenerate posts ↻' : 'Generate posts'; }
```

- [ ] **Step 3: Add overwrite heads-up to Generate/Regenerate + track edits.**

```js
function generate(){
  const ev = readForm();
  if(!ev.title){ alert('Add an event title first.'); return; }
  if(manualEdited && document.getElementById('output').children.length){
    if(!confirm('Regenerating will replace any drafts you have edited. Continue?')) return;
  }
  renderOutput(ev); manualEdited = false; setGenerateLabel();
}
```

In `renderOutput`'s textarea `input` listener (Task 13 Step 1), also set `manualEdited = true;` — update that line to: `t.addEventListener('input', () => { manualEdited = true; autoGrow(t); updateCount(t.id); });`

- [ ] **Step 4: Rewrite `init`** to wire everything (and clear must reset selectors + label):

```js
function init(){
  renderSeg('styleset', STYLE_OPTS, 'conversational');
  renderSeg('toneset', TONE_OPTS, 'educational');
  renderSeeds();
  document.getElementById('btn-generate').addEventListener('click', generate);
  document.getElementById('btn-import-luma').addEventListener('click', importLumaUrl);
  document.getElementById('btn-toggle-luma-paste').addEventListener('click', toggleLumaPaste);
  document.getElementById('btn-parse-luma-paste').addEventListener('click', importLumaPaste);
  document.getElementById('btn-clear').addEventListener('click', clearForm);
  loadEvents();
}
function clearForm(){
  ['luma_import_url','luma_paste','title','date','speaker','speaker_x','speaker_nostr','hook','luma','youtube','hashtags'].forEach(id => setVal(id,''));
  window.__lastIso = ''; window.__lastTz = ''; manualEdited = false;
  renderSeg('styleset', STYLE_OPTS, 'conversational'); renderSeg('toneset', TONE_OPTS, 'educational');
  document.getElementById('luma-paste-wrap').hidden = true;
  document.getElementById('output').innerHTML = '<div class="card" style="padding:40px;text-align:center;color:var(--muted)"><b style="color:var(--text)">Paste a Luma event or click a seeded event</b><div>You’ll get 6 stages with short X, long X, and Nostr copy.</div></div>';
  document.getElementById('checklist-panel').hidden = true;
  setGenerateLabel();
}
init();
```

Keep v1's `renderSeeds`, `loadEvents`, `importLumaUrl`, `importLumaPaste`, `toggleLumaPaste`, `setImportStatus`, `findSeedByLumaUrl` — update `importLumaUrl` to call `applyEvent` (unchanged signature) and to use the new `fetchLumaHtml`.

- [ ] **Step 5: Verify with Playwright MCP.** Load file. Click a seed → 6 stages render. Click a different Style chip → posts re-render instantly. Edit a box, then click Regenerate → confirm dialog appears. Clear form → empty state + button reads "Generate posts." No console errors.

- [ ] **Step 6: Commit.**

```bash
git add index.html
git commit -m "feat: Style/Tone selectors, instant re-run, Regenerate with overwrite guard"
```

---

### Task 15: Mobile + accessibility pass

**Files:** Modify `index.html` (verify/adjust CSS + aria already added in Tasks 11–14).

- [ ] **Step 1: Confirm/adjust responsive + a11y rules are present** (most were added earlier): single-column grid ≤900px, single-column posts ≤780px, 16px inputs ≤900px, ≥44px `.btn.small` ≤780px, focus-visible rings, `aria-live` on `#import-status`, `role=radiogroup`/`radio`/`aria-checked` on selectors, `aria-label`s on Copy/Open. Add any missing.

- [ ] **Step 2: Verify with Playwright MCP at 375px.** Use `mcp__playwright__browser_resize` to 375×800. Load file, click a seed. Confirm: single column, post variants stacked, Copy/Open buttons ≥44px tall, no horizontal overflow. Tab through the form and confirm visible focus rings on inputs and Style/Tone radios.

- [ ] **Step 3: Run a Lighthouse-style a11y spot check** via `mcp__playwright__browser_snapshot` — confirm the accessibility tree exposes labeled inputs, the radiogroups, and button names. Fix any unlabeled control.

- [ ] **Step 4: Commit.**

```bash
git add index.html
git commit -m "a11y: mobile single-column, 44px targets, focus rings, aria roles"
```

---

## Phase E — Docs + final acceptance

### Task 16: Update docs, run full acceptance, finalize

**Files:** Modify `README.md`, `BUILD_SPEC.md`; verify `events.json`.

- [ ] **Step 1: Update `BUILD_SPEC.md`** (spec §10b): change every "5 stages" / "length 5" to **6 stages**; change `Post = { stage, when, x, nostr }` to `Post = { stage, when, x, xlong, nostr }`; document the **Style** knob (Structured/Conversational) alongside Tone; note the visible **Title** field; document **timezone handling** (real zone + Live conversions); rename "15-min posting checklist" → "Posting checklist"; remove the "Open Luma" reference; add the provider-agnostic AI panel to §8 future enhancements. Keep it neutrality-clean.

- [ ] **Step 2: Update `README.md`** — reflect Style × Tone, the visible Title, timezone behavior, and 3-step GitHub Pages deploy. Neutrality-clean.

- [ ] **Step 3: Run the full unit suite.** Run: `node --test 'test/*.test.mjs'` → all green.

- [ ] **Step 4: Neutrality grep — expect no matches.**

Run:
```bash
rg -n "The Space|SpaceDenver|TheSpace|denver\.space|Space member|Space Event|space-event-poster|\bSpace\b" README.md BUILD_SPEC.md events.json LICENSE index.html
```
Expected: no output. (If `index.html` matches inside `sanitizeVenueText`, that's the obfuscated `String.fromCharCode` form, which the grep will NOT match — any literal match is a real violation to fix.)

- [ ] **Step 5: Size check.** Run: `wc -c index.html` → confirm < 51200 bytes (50 KB). If over, trim comments/whitespace (not features).

- [ ] **Step 6: Full §12 acceptance via Playwright MCP.** With `python3 -m http.server 8787` running (background), navigate to `http://127.0.0.1:8787/index.html` and verify each §12 item: cold load defaults; seeded click → 6×3, short X ≤280 with date+zone+RSVP; Style/Tone instant re-render; manual entry with Title; **import the test URL `https://luma.com/mrxb609z?lm_source=embed`** (succeeds or cleanly offers paste; title + date-with-zone + description; long-X no in-post link; recap present); edit → live counts incl. Nostr hint, Copy/Open use edited text; Live shows local+ET+PT; Regenerate guard; mobile 375px. Also verify Copy on the `file://` path (clipboard fallback).

- [ ] **Step 7: Final commit.**

```bash
git add README.md BUILD_SPEC.md events.json
git commit -m "docs: bring README + BUILD_SPEC to v2; final acceptance pass"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** §3 visual → Tasks 11–13; §4 UX (Title, stacked X/npub, regenerate, checklist rename, autosize) → Tasks 12–14; §5 copy engine → Tasks 9–10; §6 examples → exercised by Task 10 tests; §7 timezone → Task 3 + Task 10; §8 import → Tasks 6–8; §9 a11y/mobile/bugs (clipboard, Nostr hint, Open-in-X long, Title, Jina) → Tasks 13, 15, 8, 12; §10 neutrality → Task 5 + Task 16 grep; §10b docs → Task 16; §11 future (no build) → documented only; §12 acceptance → Task 16. No gaps.

**Placeholder scan:** The only `[bracketed]` strings are the intentional post-event copy blanks (spec §5.3), asserted as such in Task 10. No TBD/TODO/"handle errors" placeholders.

**Type consistency:** `compose(ev, style, tone, seed)`, `buildStage`, `enforceXLimit`, `stripLinks`, `lumaToEvent`, `validateEvent`, `buildProxyAttempts`, `currentStyle`/`currentTone`, `renderOutput`/`updateCount`/`autoGrow`/`postText`/`copyText` are referenced consistently across tasks. The `EXPORTS` list in `test/load-engine.mjs` grows monotonically and every tested name is added in its task.
