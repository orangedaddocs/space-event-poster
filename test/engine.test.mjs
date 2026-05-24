import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from './load-engine.mjs';

test('engine loads and exposes limits', () => {
  assert.equal(engine.X_LIMIT, 280);
  assert.equal(engine.X_LONG_SOFT_LIMIT, 2000);
  assert.equal(engine.NOSTR_SOFT_LIMIT, 500);
});

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

test('formatEventTime renders in the event zone with short tz label', () => {
  const out = engine.formatEventTime('2026-05-28T18:30:00-06:00', 'America/Denver');
  assert.match(out, /Thu, May 28/);
  assert.match(out, /6:30 ?PM MDT|6:30 PM MDT/);
});

test('formatEventTime infers zone from offset when IANA missing', () => {
  const out = engine.formatEventTime('2026-05-28T18:30:00-06:00', '');
  assert.match(out, /6:30 PM|6:30 PM/);
});

test('timezoneConversions returns deduped local+ET+PT, DST-correct', () => {
  const conv = engine.timezoneConversions('2026-05-28T19:00:00-06:00', 'America/Denver');
  assert.match(conv, /7:00 PM MDT/);
  assert.match(conv, /9:00 PM EDT/);
  assert.match(conv, /6:00 PM PDT/);
  assert.equal(conv.split('·').length, 3);
});

test('timezoneConversions dedupes when event is already Eastern', () => {
  const conv = engine.timezoneConversions('2026-05-28T21:00:00-04:00', 'America/New_York');
  assert.equal(conv.split('·').length, 2);
  assert.match(conv, /9:00 PM EDT/);
  assert.match(conv, /6:00 PM PDT/);
});

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
