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

test('formatEventTime falls back to the ISO offset when IANA missing (machine-independent)', () => {
  const out = engine.formatEventTime('2026-05-28T18:30:00-06:00', '');
  assert.match(out, /Thu, May 28/);
  assert.match(out, /6:30 PM GMT-6/);
});

test('timezoneConversions uses the ISO offset for local when IANA missing', () => {
  const conv = engine.timezoneConversions('2026-05-28T19:00:00-06:00', '');
  assert.match(conv, /7:00 PM GMT-6/);
  assert.match(conv, /9:00 PM EDT/);
  assert.match(conv, /6:00 PM PDT/);
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

const JSONLD_HTML = `<html><head>
<script type="application/ld+json">
{"@type":"Event","name":"Bitcoin in Healthcare","startDate":"2026-05-28T18:30:00-06:00",
 "description":"How to build a practice on a Bitcoin standard.","url":"https://luma.com/pks2tmn1",
 "location":{"@type":"Place","name":"Denver"}}
</` + `script></head><body></body></html>`;

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

const NEXT_HTML = `<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"somethingNew":{"event":{"name":"Denver BitDevs",
 "start_at":"2026-06-04T17:00:00-06:00","timezone":"America/Denver",
 "url":"https://luma.com/yj1xgw3q"}}}}}
</` + `script></body></html>`;

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
  // JSONLD_HTML has no __NEXT_DATA__ timezone, so display falls back to the ISO offset (GMT-6)
  assert.match(ev.date_display, /6:30 PM GMT-6/);
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

test('buildProxyAttempts includes 4 no-key proxies with correct Jina URL', () => {
  const url = 'https://luma.com/mrxb609z';
  const attempts = engine.buildProxyAttempts(url);
  const urls = attempts.map(a => a.url);
  assert.equal(attempts.length, 4);
  assert.ok(urls.some(u => u.includes('api.codetabs.com/v1/proxy?quest=')));
  assert.ok(urls.some(u => u.includes('api.allorigins.win/get?url=')));
  assert.ok(urls.some(u => u.includes('corsproxy.io/?url=')));
  const jina = urls.find(u => u.includes('r.jina.ai'));
  assert.equal(jina, 'https://r.jina.ai/https://luma.com/mrxb609z');
  assert.doesNotMatch(jina, /r\.jina\.ai\/http:\/\/r\.jina\.ai/);
});

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

const EV = {
  title:'Bitcoin in Healthcare', speaker:'Dr. Noah Kaufman', speaker_x:'@noah', speaker_nostr:'',
  date_iso:'2026-05-28T19:00:00-06:00', tz:'America/Denver',
  date_display:'Thu, May 28 · 7:00 PM MDT', hook:'How do you build a practice on a Bitcoin standard?',
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

test('speaker X handle tags on X posts and npub tags on Nostr, in both styles', () => {
  const ev = { ...EV, speaker_x:'@noah', speaker_nostr:'npub1abc' };
  for(const style of ['conversational', 'structured']){
    const posts = engine.compose(ev, style, 'educational');
    const announce = posts.find(p => p.stage === 'Announcement');
    assert.match(announce.x, /@noah/, `X handle missing on ${style} announcement X`);
    assert.match(announce.nostr, /nostr:npub1abc/, `npub missing on ${style} announcement Nostr`);
    const rem1 = posts.find(p => p.stage === '24-hr reminder');
    assert.match(rem1.x, /@noah/, `X handle missing on ${style} 24-hr X`);
  }
});

test('short X does not truncate the hook at an abbreviation like "Dr."', () => {
  const ev = { ...EV, hook: 'Dr. Smith shows how to run a clinic on a Bitcoin standard. Come learn how.' };
  const announce = engine.compose(ev, 'conversational', 'educational')[0];
  assert.match(announce.x, /Dr\. Smith shows how to run a clinic on a Bitcoin standard\./);
});

test('reader fallback ignores the "Title: … · Luma" line and captures the body', () => {
  const reader = [
    'Title: My Event · Luma',
    'URL Source: https://luma.com/abc',
    'About Event',
    'Come learn about sovereign computing.',
    'We will cover hash rate heating.',
    'Hosted By',
    'Someone'
  ].join('\n');
  const ev = engine.lumaToEvent(reader, 'https://luma.com/abc');
  assert.doesNotMatch(ev.description, /Title:/);
  assert.doesNotMatch(ev.description, /· Luma/);
  assert.match(ev.description, /sovereign computing/);
  assert.match(ev.description, /hash rate heating/);
});

test('buildStage returns empty strings for an unknown stage id', () => {
  const out = engine.buildStage({ id:'nope', label:'X', when:'' }, EV, 'conversational', 'educational', 0);
  assert.equal(out.x, '');
  assert.equal(out.xlong, '');
  assert.equal(out.nostr, '');
});

test('no dangling RSVP/CTA label when luma_url is empty', () => {
  const ev = { ...EV, luma_url:'' };
  for(const style of ['structured','conversational']){
    for(const p of engine.compose(ev, style, 'educational')){
      const all = p.x + '\n' + p.xlong + '\n' + p.nostr;
      assert.doesNotMatch(all, /RSVP:\s*(\n|$)/i, `dangling "RSVP:" in ${style}/${p.stage}`);
      assert.doesNotMatch(all, /RSVP →\s*(\n|$)/i, `dangling "RSVP →" in ${style}/${p.stage}`);
    }
  }
});

test('stripLinks removes bare domains without a path', () => {
  assert.doesNotMatch(engine.stripLinks('come to luma.com today'), /luma\.com/);
  assert.doesNotMatch(engine.stripLinks('see bit.ly/abc here'), /bit\.ly/);
  assert.doesNotMatch(engine.stripLinks('at mysite.app/path ok'), /mysite\.app/);
});

test('compose still includes RSVP url when present (regression guard)', () => {
  const a = engine.compose(EV, 'structured', 'educational')[0];
  assert.match(a.x, /luma\.com\/pks2tmn1/);
});
