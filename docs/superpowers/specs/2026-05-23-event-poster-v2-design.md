# Event Poster v2 — Design Spec

**Date:** 2026-05-23
**Status:** Draft for review
**Scope:** A full second pass on the existing single-file tool — a visual redesign, a rewritten copy engine, hardened Luma import, correct timezone handling, and an accessibility/mobile/bug sweep. Same product, same constraints, dramatically better.

---

## 1. Goals

The tool turns a Luma event URL into a ready-to-post X + Nostr campaign so a meetup organizer can get the word out in ~15 minutes. This pass improves four things the current build does poorly, without losing any v1 functionality:

1. **Look** — replace the all-black/orange theme (described by the owner as "yucky") with a clean "Bitcoin Circle" aesthetic.
2. **Copy** — replace template-y, filler-heavy, placeholder-riddled output with friendlier, more personable writing, and give the user control over *how* it reads.
3. **Import reliability** — make "paste a Luma URL → it works" dependable.
4. **Polish** — accessibility, real mobile support, and a bug sweep.

### Non-goals (explicitly out of scope this build)
- **No live AI.** The tool stays a fully-local, template-based, zero-network generator. Nothing leaves the browser. (Rationale: the audience is privacy-minded Bitcoiners who won't paste cloud keys, and local-only is the most private default.) An optional, provider-agnostic AI panel is documented in §11 as a *future* option only.
- No backend, no build step, no dependencies, no CDN assets. (Unchanged hard constraints.)

---

## 2. Hard constraints (unchanged from v1 BUILD_SPEC)

| Constraint | Rule |
|---|---|
| Files | `index.html`, `events.json`, `README.md`, `BUILD_SPEC.md`, optional `LICENSE`. |
| Backend | None. Fully client-side. |
| Build step | None. |
| Dependencies | None. No CDN scripts, no fonts loaded over network, no frameworks. |
| Offline | Works offline once loaded (templates, seeded events, manual entry). Only the optional Luma *import* makes network calls, and only after the user clicks Import. |
| File size | `index.html` < 50 KB uncompressed. |
| Accessibility | Keyboard-navigable, semantic HTML, contrast AA. Target Lighthouse a11y ≥ 90, perf ≥ 95. |
| Neutrality | No "The Space" / venue-specific branding in repo text or generated copy (see §10). |

**Font note:** the design calls for Inter, but loading it from a CDN breaks the offline + no-dependency constraints and embedding it blows the 50 KB budget. Resolution: `font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` — Inter is used if locally installed, otherwise the system font (visually close). No network cost.

---

## 3. Visual system — "Bitcoin Circle"

Circle.so's structural philosophy (deep-navy accents, crisp white content, generous whitespace, pill buttons, Inter type) with **Bitcoin orange as the accent** instead of blue-violet.

### Palette (`:root` CSS variables)

| Role | Token | Value |
|---|---|---|
| Hero / header band | `--navy-950` / `--navy-900` | `#0f1129` / `#161837` |
| Page background | `--bg` | `#f8f9fc` |
| Cards / inputs | `--white` / `--field` | `#ffffff` / `#f0f1f5` |
| Borders (warm-tinted) | `--border` | `#e6e3dd` |
| Headings / body / muted | `--text` / `--text-2` / `--muted` | `#13141f` / `#5c6178` / `#9196a8` |
| Accent | `--accent` / `--accent-deep` | `#f7931a` / `#e07f04` |
| Accent button text | `--on-accent` | `#0f1129` (near-black — see a11y note) |
| Network labels | x / xlong / nostr | `#1d9bf0` / `#7c5cc4` / `#9b59ff` |
| Success / error | `--ok` / `--error` | `#30a46c` / `#e5484d` |

**Accessibility note on the accent:** white text on `#f7931a` fails AA (~2:1). Orange buttons therefore use **near-black/navy text** (`#0f1129`) on the orange fill — AA-compliant and still unmistakably Bitcoin. (This is what v1 actually did; it differs from early mockups that showed white-on-orange.) Small orange text (e.g., section overlines) uses `--accent-deep` only where it passes, or is paired with non-color cues.

### Type
- Family: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- Scale: section overline 12px/600/uppercase/.07em; body 14px; headings 16–20px/600–700.
- **Post-draft boxes use the regular sans, not monospace** (monospace read "code-y" and contributed to the clunky feel). Character counts remain exact.

### Layout — "Bar + Cards"
- Full-width **navy header band**: logo (orange dot + "Event Poster") left; actions right.
- **Header actions: `Clear form` + `View on GitHub` only.** The old "Open Luma" link is removed (it only bounced to luma.com).
- Light `--bg` page; **white cards**, 16px radius, soft shadows (`0 4px 16px rgba(0,0,0,.05)`).
- Two-column grid: left form column (~300–380px), right output column. Collapses to single column on mobile (form on top).
- **Pill buttons** (radius 9999px): primary = orange fill + near-black text; secondary/ghost = transparent + gray border.

---

## 4. UX changes (functionality preserved + targeted improvements)

**Every v1 field stays.** Left column, in order:

- **Luma import card:** Luma URL input, `Import from Luma` (primary), `Paste text/HTML` toggle + textarea fallback + `Use pasted Luma content`, import status line.
- **Event details card:**
  - **Title** — *now a visible field.* (v1 kept it hidden, which silently broke manual entry; the BUILD_SPEC's own test #4 expects a typeable title.)
  - Date / time
  - Speaker(s)
  - **Speaker X handle** (optional) — its own full-width line
  - **Speaker Nostr npub** (optional) — its own full-width line
  - Hook / one-liner
  - Luma / RSVP URL
  - YouTube recording URL (optional)
  - Hashtags
  - **Style** selector (new — see §5)
  - **Tone** selector (4 options)
  - Primary action button (see Regenerate, below)
- **Seeded events card:** the example events from `events.json`.

**Regenerate behavior (new):**
- Before any posts exist, the button reads **"Generate posts."**
- After posts exist, it reads **"Regenerate posts ↻"** and lives at the bottom of Event details.
- **Changing Style or Tone re-runs generation instantly** (no extra click).
- Editing a text field (e.g., adding the speaker's @handle you forgot) → click Regenerate to refresh all drafts.
- **Regenerate overwrites hand-edited drafts.** Show a small confirm/heads-up before wiping boxes the user has edited.

**Posting checklist (renamed):**
- "15-min posting checklist" → **"Posting checklist"** (the "15-min" read as a countdown timer; it isn't one). Same runbook content, friendlier wording, restyled. Keeps the quick-launch buttons (Open X compose, Primal, Damus, Highlighter) and `aria`-correct checkboxes.

**Post-draft boxes:**
- Auto-grow to fit content — **no scrolling inside a box.** Short X stays compact (~3–4 lines); long-X and Nostr grow to ~3–4× that so the whole draft is readable at a glance.

---

## 5. Copy engine

### 5.1 Architecture (also the "code organization" win)

v1's copy lives in one ~150-line `buildPosts()` that glues random fragments together — the reason it reads templated. Replace with a small **data-driven engine**:

```
STAGES  : ordered array of 6 stage descriptors:
          { id, label, when, write: { x, xlong, nostr } }
          where each write.* is (ev, style, tone) => string

STYLES  : { structured, conversational }  // structural skeletons
TONES   : { educational, welcoming, cypherpunk, punchy }  // voice tokens

compose(ev, style, tone):
  → map STAGES → call write.x / write.xlong / write.nostr
  → post-process: enforce 280 (short X), strip links (long X),
    append hashtags, trim, timezone-format dates
  → return 6 stages × 3 variants = 18 strings
```

One stage = one readable unit. Adding a stage or editing a voice is a localized change.

### 5.2 Two knobs

**Style** (structure) — *user-selectable; this is the v1-vs-v2 choice surfaced as a control:*
- **Structured** — label-led, scannable, one fact per line (`New event: … 📅 … 📍 … RSVP →`). The v1 look, cleaned up.
- **Conversational** — opens with a hook/question, reads like a person wrote it.

**Tone** (voice) — 4 options, all rewritten to sound human:
- **Educational** — curious, clear, "here's why it matters."
- **Welcoming** — warm, newcomer-first, "come as you are."
- **Cypherpunk** — signal-over-noise, sovereignty, a little edge, still inviting.
- **Punchy** — short, confident, high-energy, lots of line breaks.

### 5.3 Copy rules

1. **Specific, not templated.** Every post opens from *this* event — the hook, a real question, the speaker's angle. Never a bare "New event:" (except deliberately in Structured style).
2. **Fewer blanks.** Announcement, 7-day, 24-hr, Live = fully written, **zero blanks** (all data known). Only post-event stages keep **one** clearly-marked blank where info is genuinely unknowable: Follow-up = `[the one thing worth taking away]`; YouTube recap = same + the recording URL. No more empty `1. 2. 3.` scaffolds.
3. **Long-X is link-light by construction** — the body never contains a URL; it ends with "RSVP's in the reply 👇". (Not just post-hoc trimmed.)
4. **YouTube recap** — X says "full recording's up — link in the reply"; Nostr embeds the URL inline (no link penalty on Nostr).
5. **Variation** — rotate among 2–3 hand-written openers/CTAs per (stage, style, tone) so successive generations differ, without devolving into fragment salad.

### 5.4 Tone voice banks (actual phrasing — tweak freely)

**Educational**
- openers: "Ever wonder…", "Here's a good one:", "Worth knowing about:", "New on the calendar — and worth your time:"
- ctas: "Free to RSVP →", "Save your seat →", "Details + RSVP →"
- signoffs (long): "Bring your questions.", "Come curious."

**Welcoming**
- openers: "You're invited 👋", "Come hang with us:", "New to Bitcoin? Start here:", "All welcome —"
- ctas: "First time? Just show up →", "RSVP and say hi →", "Bring a friend →"
- signoffs: "Newcomers genuinely welcome.", "No experience needed — just curiosity."

**Cypherpunk**
- openers: "Signal:", "For the orange-pilled:", "Sound money, in person:", "Tune out the noise —"
- ctas: "RSVP. No KYC.", "Show up. Stay sovereign.", "Lock it in →"
- signoffs: "Be there.", "Bring cash, bring questions."

**Punchy**
- openers: "Mark it. 📅", "This one's big.", "Don't sleep on this:", "Lock it in."
- ctas: "RSVP now →", "Grab a spot →", "Go. →"
- signoffs: "See you there.", "Pull up."

### 5.5 Stage templates (skeletons; `{slots}` filled by tone bank + event data)

> Short X auto-trimmed to ≤ 280. Long X ≤ ~2000, **no URL in body**. Nostr ≤ ~500 soft.

| Stage | Structured skeleton (short X) | Conversational skeleton (short X) |
|---|---|---|
| Announcement | `{opener} {title}` / `📅 {date+tz}` / `📍 {venue}` / `🎤 {speaker/@handle}` / `{cta} {rsvp}` / `{hashtags}` | `{hook-as-question} {speaker} {is showing us}. 📅 {date+tz}. {cta} {rsvp}  {hashtags}` |
| 7-day | `{reminder: 7 days} — {title}` / `{date+tz}` / `RSVP: {rsvp}` / `{hashtags}` | `One week out: {title}. {one-line why}. RSVP {rsvp}  {hashtags}` |
| 24-hr | `Tomorrow — {title}` / `{date+tz} · {venue}` / `{@handle/speaker}` / `{rsvp}  {hashtags}` | `Tomorrow. {title} with {speaker}. {date+tz}. Last call to RSVP {rsvp}` |
| Live | `{live} — {title}` / `🔴 {tz-conversions}` / `📍 {venue}` / `{hashtags}` | `We're live 🔴 {title}. {tz-conversions}. {come through / stream note}  {hashtags}` |
| Follow-up | `{followup} {title}` / `Big takeaway: [the one thing worth taking away]` / `Recording soon.` / `{hashtags}` | `{followup} {title}. The thing that stuck with me: [the one thing worth taking away]. Recording soon 👇` |
| YouTube recap | `Recording's up: {title}` / `Watch for: [one moment worth watching]` / `Link in the reply.` / `{hashtags}` | `The recording from {title} is up. If you missed it, here's the one bit worth your time: [one moment]. Link in reply 👇` |

Long-X and Nostr variants follow the same skeletons, expanded (more room), link-light per §5.3 rules. The full rendered set (every Style × Tone × Stage) is generated by the engine; representative rendered examples are in §6 so wording can be judged before coding.

---

## 6. Rendered examples (so you can read & tweak real output)

**Announcement — short X, all 8 Style × Tone combos** (event: "Bitcoin in Healthcare w/ Dr. Noah Kaufman," Thu May 28 6:30 PM MDT, Denver):

*Structured × Educational*
```
New event: Bitcoin in Healthcare w/ Dr. Noah Kaufman
📅 Thu May 28, 6:30 PM MDT · 📍 Denver
🎤 Dr. Noah Kaufman
Free to RSVP → luma.com/…   #Bitcoin #Healthcare
```
*Conversational × Educational*
```
Ever wonder what a medical practice run on a Bitcoin standard
actually looks like? Dr. Noah Kaufman built one.
📅 Thu May 28, 6:30 PM MDT · Denver
RSVP → luma.com/…   #Bitcoin #Healthcare
```
*Conversational × Welcoming*
```
New one on the calendar 👋 Dr. Noah Kaufman on running a real
medical practice on a Bitcoin standard. Thu May 28, 6:30 PM MDT,
Denver. Newcomers genuinely welcome — RSVP → luma.com/…  #Bitcoin
```
*Conversational × Cypherpunk*
```
Signal: a doctor who rebuilt his practice on sound money.
Dr. Noah Kaufman, live in Denver. Thu May 28, 6:30 PM MDT.
RSVP. No KYC → luma.com/…   #Bitcoin
```
*Punchy × any*
```
This one's big. 🩺⚡
Bitcoin in Healthcare — Dr. Noah Kaufman.
Thu May 28, 6:30 PM MDT · Denver.
RSVP now → luma.com/…   #Bitcoin
```
*(Structured × Welcoming / Cypherpunk / Punchy follow the Structured skeleton with that tone's opener + CTA.)*

**Live update — Conversational × Punchy (shows the timezone conversions):**
```
We're live 🔴 Bitcoin in Healthcare
7:00 PM MDT · 9:00 PM EDT · 6:00 PM PDT
📍 Denver — or catch the stream.
#Bitcoin
```

**Long-X — Announcement, Conversational × Educational (link-light):**
```
Most of us never stop to think about how money actually moves
through a doctor's office.

Dr. Noah Kaufman did — and he rebuilt his practice around Bitcoin.

On May 28 he's walking us through how it really works: the
operations, the tradeoffs, and where this is all heading.

Bring your questions. Drinks and good people either way.

RSVP's in the reply 👇   #Bitcoin #Healthcare
```

**YouTube recap — Nostr (URL inline):**
```
The recording from Bitcoin in Healthcare is up ⚡

If you couldn't make it, here's the one bit worth your time:
[one moment worth watching]

Watch: https://youtube.com/watch?v=…

#Bitcoin #Healthcare
```

---

## 7. Timezone handling (required)

A streamed event must tell remote viewers when it is in *their* time, or a "live now" post is useless to them.

- **Read the real zone from Luma, never hardcode.** Prefer the IANA zone in the page JSON (`__NEXT_DATA__` event `timezone`, e.g. `America/Denver`); fall back to the UTC offset on the JSON-LD `startDate`.
- **Label every time with its zone** (`6:30 PM MDT`), derived from the actual zone via `Intl.DateTimeFormat(..., { timeZone, timeZoneName: 'short' })` (DST-correct).
- **Conversions on the Live stage** (and on Announcement when a stream/recording URL is present): render the start instant in the event's local zone + `America/New_York` + `America/Los_Angeles`, **deduped** (skip any equal to local). Example: `7:00 PM MDT · 9:00 PM EDT · 6:00 PM PDT`.
- Remove the v1 hardcoded `timeZone:'America/Denver'` in `formatLumaDate`.

---

## 8. Import reliability

1. **Fix the dead Jina fallback:** `https://r.jina.ai/http://r.jina.ai/http://${url}` → `https://r.jina.ai/${url}`.
2. **Race multiple no-key proxies in parallel**, take the first returning *valid event data*: codetabs, allorigins (`/get` → `.contents`), corsproxy.io, Jina reader. (Free proxies are flaky; redundancy is the fix.)
3. **Parse defensively:** prioritize the JSON-LD `Event` block (stable schema.org: name, startDate, description, location, url, image, **timezone via offset**). Deep-search `__NEXT_DATA__` for an event-shaped object instead of trusting v1's fixed path (`props.pageProps.initialData.data`), which breaks on Luma changes.
4. **Validate, don't trust a marker:** success only if a title + (date or description) was extracted; otherwise try the next attempt or fall back to paste.
5. **Paste fallback is the guarantee:** when auto-import fails, surface a clear "paste the Luma page text or source here" path (parses copied visible text or page source). This is the always-eventually-works backstop.
6. **Keep `sanitizeVenueText`** — strips forbidden "The Space"-type references from imported copy (neutrality safeguard, §10).

---

## 9. Accessibility, mobile, bug sweep

**Accessibility (Lighthouse a11y ≥ 90):**
- Orange buttons use near-black text (AA) — see §3.
- Style/Tone selectors are keyboard-navigable radio groups with visible focus rings (orange, 2px offset). All controls keyboard-operable.
- Real `<label>`s on every field; `aria-label`s on generated Copy/Open buttons ("Copy X post — Announcement"); "Copied" toast announced via `aria-live`.
- Over-limit state keeps its "⚠️ trim required" text (not color-only).

**Mobile (open → generate → share to a friend):**
- Single column below breakpoint; each stage's three variants stack full-width.
- Copy/Open buttons ≥ 44px touch height on mobile.
- Inputs 16px on mobile (prevents iOS focus-zoom).

**Bug sweep:**
- **Clipboard fallback** — `navigator.clipboard` is blocked on `file://`/some non-HTTPS; add a select-and-`execCommand('copy')` fallback so Copy always works.
- **Nostr "(long — consider Highlighter)" hint** is set only at render; wire it into the live count update.
- **Add "Open in X" to the long-X variant** (currently short X only). Nostr stays copy-only (no universal compose URL — correct).
- Visible Title field (§4) and Jina fix (§8) resolve the manual-entry and dead-fallback issues.

---

## 10. Neutrality constraint

No "The Space" / venue-specific branding anywhere in repo text or generated copy. Allowed neutral terms: "Event Poster," "Denver Bitcoin meetup," "Luma events," "X + Nostr campaigns." `sanitizeVenueText` enforces this on imported content. The repo must pass:
```
rg -n "The Space|SpaceDenver|TheSpace|denver\.space|Space member|Space Event|space-event-poster|\bSpace\b" README.md BUILD_SPEC.md events.json LICENSE index.html
```
→ expected: no matches.

---

## 10b. Documentation updates

`README.md` and `BUILD_SPEC.md` must be updated to match v2: 6 stages, the new **Style** knob, the visible Title field, timezone handling, the renamed "Posting checklist," and the removed "Open Luma" link. Both must stay neutrality-clean (§10). `BUILD_SPEC.md`'s stale "length 5 / `Post = {stage, when, x, nostr}`" references are corrected to 6 stages and `{ stage, when, x, xlong, nostr }`.

---

## 11. Future options (NOT in this build)

- **Optional, provider-agnostic AI panel.** A Settings panel (off by default) that points at any **OpenAI-compatible endpoint** — a local Ollama (`localhost`, nothing leaves the machine), OpenRouter, or other privacy provider — with the key stored in `localStorage` only. When configured, Generate/Regenerate calls it for bespoke copy; otherwise templates. One request → all 18 drafts as JSON; output still passes the 280/link-light guards. Provider-agnostic, never Anthropic-locked.
- v1 BUILD_SPEC §8 items: flyer image export, Luma calendar import, Postiz integration, Highlighter NIP-23 export, multi-venue, recurring-event templates.

---

## 12. Acceptance criteria

1. Cold load (no server / `file://`): form renders, Style defaults to Conversational, Tone to Educational, seeded events appear if `events.json` is fetchable; works if it 404s. **Copy works on `file://`** (clipboard fallback).
2. Seeded click fills the form and renders 6 stages × 3 variants; short X ≤ 280 with date+zone and RSVP URL.
3. Switching Style or Tone re-renders instantly.
4. Manual entry: type a Title (+ fields), Generate → 6 stages, no console errors.
5. Import the known test URL (`https://luma.com/mrxb609z?lm_source=embed`): succeeds (or cleanly offers paste fallback); title, date **with correct zone**, description extracted; 18 boxes; short X ≤ 280; long X has no in-post link; YouTube recap present.
6. Edit a draft → counts update live (incl. Nostr Highlighter hint); Copy and Open in X use the **edited** text.
7. Live-stage post shows local + ET + PT conversions, deduped, DST-correct.
8. Regenerate after editing a field rebuilds all drafts (with heads-up before overwriting edited boxes).
9. Mobile 375px: single column, ≥44px tap targets, no iOS focus-zoom.
10. Lighthouse a11y ≥ 90, perf ≥ 95 desktop. `index.html` < 50 KB. Neutrality grep: no matches.
