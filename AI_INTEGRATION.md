# AI_INTEGRATION.md — Wiring Event Poster to a real AI (optional)

Event Poster ships as a **template engine**: it fills pre-written sentences with your event's details. That's fast, free, private, and offline — but the wording follows fixed patterns. If you want genuinely custom, per-event copy, you can bolt on a real LLM. This file is the how-to.

**This is optional and not built into the shipped app.** Hand this file to Claude Code / Codex / Cursor (or do it by hand) when you want the upgrade.

---

## 0. Principles (keep these)

- **Templates stay the default and the fallback.** No key configured, or the AI call fails → silently use the existing `compose()` template output. The tool must never break because AI is unavailable.
- **Bring-your-own-key, stored only in the browser.** The key lives in `localStorage` on the user's machine. It is never committed to the repo and never sent anywhere except the endpoint the user chose.
- **Provider-agnostic — target the OpenAI-compatible API, not one vendor.** One integration then works with a **local Ollama** (`http://localhost:11434/v1`, nothing leaves the machine), **OpenRouter**, **LM Studio**, **Together**, **Groq**, etc. The user picks who they trust. (Notably: for a privacy-minded audience, a local Ollama means the event text never leaves their computer.)
- **Still a static single file.** No backend, no build step, no npm. The browser calls the endpoint directly with `fetch`. Offline still works (templates).
- **The same guards run on AI output.** Whatever the model returns still passes through `enforceXLimit()` (short X ≤ 280) and `stripLinks()` (link-light long X), so the rules hold even if the model overshoots.

---

## 1. Where it hooks in

The engine already exposes the seam you need:

```
compose(ev, style, tone, seed)  →  Post[]   // 6 stages × {x, xlong, nostr}, all templates
renderOutput(ev)                            // DOM layer; currently calls compose() synchronously
```

Add an **async** layer in front of `compose`:

```
generateDrafts(ev, style, tone)  →  Promise<Post[]>
  ├─ if AI configured: call the model, parse JSON, run guards → return
  └─ else / on error:  return compose(ev, style, tone)   // template fallback
```

Then make `renderOutput` await it. Everything downstream (the editable boxes, counts, Copy / Open in X) is unchanged — it just renders whatever `Post[]` it's given.

---

## 2. Settings panel (the only new UI)

Add a small "AI (optional)" panel — e.g. a gear button in the `.topbar` that toggles a card with three fields, persisted to `localStorage`:

```html
<!-- inside a hidden settings card -->
<label>API base URL</label>
<input id="ai_base" placeholder="http://localhost:11434/v1  (Ollama) — or https://openrouter.ai/api/v1">
<label>API key (leave blank for local Ollama)</label>
<input id="ai_key" type="password" placeholder="sk-...">
<label>Model</label>
<input id="ai_model" placeholder="llama3.1  /  anthropic/claude-... /  gpt-4o-mini">
<label><input type="checkbox" id="ai_on"> Use AI to write posts</label>
```

```js
const AI = {
  get on(){ return localStorage.getItem('ep_ai_on') === '1'; },
  get base(){ return (localStorage.getItem('ep_ai_base') || '').replace(/\/+$/,''); },
  get key(){ return localStorage.getItem('ep_ai_key') || ''; },
  get model(){ return localStorage.getItem('ep_ai_model') || ''; },
  configured(){ return this.on && this.base && this.model; }
};
// save handlers: localStorage.setItem('ep_ai_base', document.getElementById('ai_base').value), etc.
```

Show a small badge so the user knows which mode they're in: **✨ AI** when `AI.configured()`, else **Templates**.

> **Never** hardcode a key in the repo. The input writes to `localStorage` only.

---

## 3. The API call (OpenAI-compatible, JSON mode)

One request returns all 18 drafts as JSON — cheap (pennies) and fast.

```js
async function aiGenerate(ev, style, tone){
  const sys = AI_SYSTEM_PROMPT;                 // §4
  const user = JSON.stringify({                 // the engine's own inputs, as data
    style, tone,
    event: {
      title: ev.title, date_display: ev.date_display, tz: ev.tz || '',
      speaker: ev.speaker, speaker_x: ev.speaker_x, speaker_nostr: ev.speaker_nostr,
      hook: ev.hook, venue: ev.venue || 'Denver Bitcoin meetup',
      luma_url: ev.luma_url, youtube_url: ev.youtube_url || '', hashtags: ev.hashtags || '',
      tz_conversions: ev.date_iso ? timezoneConversions(ev.date_iso, ev.tz) : ''  // pass the computed local·ET·PT string
    }
  });
  const res = await fetch(`${AI.base}/chat/completions`, {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      AI.key ? { 'Authorization': `Bearer ${AI.key}` } : {}
    ),
    body: JSON.stringify({
      model: AI.model,
      temperature: 0.7,
      response_format: { type: 'json_object' },   // honored by most OpenAI-compatible servers
      messages: [ { role:'system', content: sys }, { role:'user', content: user } ]
    })
  });
  if(!res.ok) throw new Error('AI endpoint ' + res.status);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);   // { stages: [...] }
  return parsed.stages;
}
```

Notes:
- **Ollama**: run `ollama serve`, set base `http://localhost:11434/v1`, key blank, model e.g. `llama3.1`. Ollama speaks the OpenAI API. Fully local.
- **OpenRouter / Groq / Together / LM Studio**: set their base URL + key + a model id. All OpenAI-compatible.
- **Privacy-respecting hosted inference**: if you'd rather not run your own hardware, prefer a provider that does *confidential computing* — e.g. **Maple AI**, which runs inference inside secure enclaves so even the provider can't read your prompts. Where it exposes an OpenAI-compatible endpoint, it's a drop-in: set the base URL + key like any other. This keeps the privacy posture without self-hosting.
- **Anthropic direct** is possible but is *not* OpenAI-shaped — it needs `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version`, and `anthropic-dangerous-direct-browser-access: true` (to bypass CORS from a browser). Prefer routing Claude through OpenRouter to keep one code path.

---

## 4. The system prompt

Encode the same rules the templates follow (see `BUILD_SPEC.md` §4). Keep it strict about JSON and limits:

```text
You write social-media campaigns for in-person events. Return ONLY JSON.

Produce a campaign of exactly 6 stages in this order:
1 Announcement, 2 7-day reminder, 3 24-hr reminder, 4 Live update,
5 Follow-up, 6 YouTube recap.

For each stage produce three variants:
- "x":     a short X/Twitter post, HARD LIMIT 280 characters.
- "xlong": a longer X post, link-light — DO NOT put any URL in the body;
           end with "RSVP's in the reply 👇" (or "Link in the reply").
- "nostr": a Nostr post; URLs are fine here; can be longer.

STYLE = "{style}":
- "structured"   → label-led, scannable, one fact per line.
- "conversational" → open with the event's hook/question, read like a person.

TONE = "{tone}" (educational | welcoming | cypherpunk | punchy): match that voice.

Rules:
- Use the event's real title, speaker, date_display, venue, hook, hashtags.
- Pre-event stages (1–4) must be fully written with NO placeholder blanks.
- Follow-up & YouTube recap may contain ONE bracketed blank for the key
  takeaway the host fills in (it isn't known yet).
- Live update MUST include the timezone conversions string provided as
  "tz_conversions" (local · ET · PT) so remote viewers know when it is.
- YouTube recap: the "x" variant says the link is in the reply (no URL);
  the "nostr" variant includes youtube_url inline.
- Separate logical blocks (hook / details / CTA / hashtags) with a blank line.
- Never invent facts. Keep hashtags to those provided.

Return: {"stages":[{"stage":"Announcement","x":"...","xlong":"...","nostr":"..."}, ... 6 total]}
```

Interpolate `{style}` / `{tone}` (or pass them in the user JSON — both work).

---

## 5. Wire it into render (with fallback + guards)

```js
async function generateDrafts(ev, style, tone){
  if(AI.configured()){
    try{
      const stages = await aiGenerate(ev, style, tone);
      // normalize + re-apply the same guards the templates use:
      return stages.slice(0, 6).map(s => ({
        stage: s.stage, when: '', 
        x: enforceXLimit(String(s.x || '')),
        xlong: stripLinks(String(s.xlong || '')),
        nostr: String(s.nostr || '').trim()
      }));
    }catch(e){
      console.warn('AI generation failed, using templates:', e);
      // fall through to templates
    }
  }
  return compose(ev, style, tone, Date.now() % 997);
}
```

Then change `renderOutput(ev)` to be `async` and `const posts = await generateDrafts(ev, currentStyle(), currentTone());` instead of the current synchronous `compose(...)`. Show a tiny "Writing with AI…" state on the Generate button while it awaits. Everything else in `renderOutput` stays the same.

> Carry the stage `when` labels from the local `STAGES` array (match by index/label) since the model needn't return them.

---

## 6. Privacy & cost

- The key is in `localStorage` on the user's device, sent only to the endpoint they configured. With **local Ollama, the event text never leaves their machine.**
- On a hosted copy (GitHub Pages), **each visitor brings their own key and pays their own usage** — the repo owner pays nothing.
- One campaign ≈ one request ≈ a few cents on a hosted model, $0 on local Ollama.
- Keep the **Templates** mode as the zero-config default so the tool is useful with no setup and no account.

---

## 7. Constraints to preserve

- Single `index.html`, no build step, no bundler, no npm, no CDN `<script>`.
- Offline still works in Templates mode; AI mode simply requires the user's chosen endpoint to be reachable.
- `index.html` should stay near/under the 50 KB budget — the settings panel + `aiGenerate` + prompt add roughly 2–3 KB.
- AI is **purely additive and opt-in**; removing the panel must leave the template tool fully working.

---

## Appendix — Prompt for Claude Code / Codex

> Add an optional, provider-agnostic AI layer to `index.html` per `AI_INTEGRATION.md`. Keep the template engine (`compose`) as the default and the fallback. Add a Settings panel that stores an OpenAI-compatible base URL + optional key + model in `localStorage` only. Implement `aiGenerate(ev, style, tone)` (one JSON request → 6 stages × {x,xlong,nostr}) and `generateDrafts(ev, style, tone)` that uses AI when configured and falls back to `compose` otherwise, re-running `enforceXLimit` and `stripLinks` on AI output. Make `renderOutput` await it with a "Writing with AI…" button state. No backend, no build step, no dependencies; do not hardcode any key. Default endpoint hint: local Ollama (`http://localhost:11434/v1`). Verify the tool still works with AI off.
