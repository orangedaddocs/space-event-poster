# BUILD_SPEC.md — Event Poster

Hand this file to **Claude Code**, **Codex**, **Cursor**, or any AI coding agent to rebuild, extend, or fork this project.

---

## 0. Mission

Build a **single-file, self-contained HTML tool** that turns Luma events into full X + Nostr post campaigns in ~15 minutes per event. **No backend. No build step. No API keys required for the core flow.**

The tool must run by:
1. Opening `index.html` in a browser, OR
2. Hosting the folder on GitHub Pages / any static host.

---

## 1. Hard constraints

| Constraint | Rule |
|---|---|
| Files | `index.html`, `events.json`, `README.md`, `BUILD_SPEC.md` — that's it. Optional `LICENSE`. |
| Backend | None. Everything client-side. |
| Build step | None. No npm, no bundler, no transpiler. |
| Dependencies | None. No CDN scripts. No Tailwind. No React. Vanilla HTML/CSS/JS only. |
| Browser support | Modern evergreen (Chrome, Safari, Firefox, Edge — last 2 years). |
| Offline | Must work offline once loaded for seeded/manual events. `fetch('events.json')` and optional Luma URL imports should fail gracefully. |
| File size | `index.html` < 50 KB uncompressed. |
| Accessibility | Keyboard-navigable form, semantic HTML, contrast AA. Lighthouse a11y ≥ 90, perf ≥ 95 desktop. |
| Neutrality | No venue-specific branding in repo text or generated copy (see §10). |

**Font note:** the design calls for Inter, but loading it from a CDN breaks the offline + no-dependency constraints and embedding it blows the 50 KB budget. Resolution: `font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` — Inter is used if locally installed, otherwise the system font (visually close). No network cost.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────┐
│  index.html  (single file, inline CSS + inline JS)   │
│                                                      │
│   ┌──────────┐    ┌──────────────────────────┐       │
│   │  Form    │ →  │  Post Engine             │       │
│   │  inputs  │    │  (STYLES × TONES ×       │       │
│   └──────────┘    │   STAGES → 18 strings)   │       │
│        ↑          └──────────────────────────┘       │
│        │                       ↓                     │
│   ┌──────────┐        ┌──────────────────┐           │
│   │ events   │ ──→    │  Render          │           │
│   │ .json    │        │  (6 stages ×     │           │
│   └──────────┘        │   3 copy cards)  │           │
│                       └──────────────────┘           │
└──────────────────────────────────────────────────────┘
```

### Data flow
1. On load, `fetch('events.json')` populates `VENUE` and `EVENTS` globals.
2. User either:
   - Pastes a Luma event URL → browser races multiple CORS proxies in parallel + Jina reader; if all fail, user can paste Luma page source/text → parsed into the form.
   - Clicks a seeded event button → `applyEvent(ev)` fills the form + immediately renders posts.
   - Manually fills the form → clicks **Generate posts** → `readForm()` → `renderOutput(ev)`.
3. `buildPosts(ev)` produces a `Post[]` of **length 6**. Each `Post = { stage, when, x, xlong, nostr }`.
4. `renderOutput(ev)` paints 6 stage cards. Each card has three copy panels (short X / long X / Nostr) with copy buttons and char counts.

---

## 3. Data schema

### `events.json`

```ts
type EventsFile = {
  venue: {
    name: string;
    city: string;
    website: string;
    x_handle?: string;        // include @
    nostr_npub?: string;      // npub1...
    default_hashtags: string[];
  };
  events: Event[];
};

type Event = {
  id: string;                 // unique slug
  title: string;
  date_iso?: string;          // ISO 8601 with TZ offset
  tz?: string;                // IANA timezone, e.g. "America/Denver" (preferred over offset)
  date_display: string;       // human label e.g. "Thu, May 28 · 6:30 PM MDT"
  host?: string;
  speaker?: string;
  speaker_org?: string;
  speaker_x?: string;         // include @ (the engine will normalize)
  speaker_nostr?: string;     // npub1...
  description: string;        // 1-2 sentence hook
  topic_tags?: string[];      // internal-only categorization
  hashtags: string[];         // user-visible #tags
  luma_url?: string;
  youtube_url?: string;
  tone: 'punchy' | 'educational' | 'cypherpunk' | 'welcoming';
};
```

### Post shape

```ts
type Post = {
  stage:  string;   // e.g. "Announcement"
  when:   string;   // human send-time hint, e.g. "When event is first posted"
  x:      string;   // short X variant, ≤ 280 chars
  xlong:  string;   // long link-light X variant, ≤ ~2,000 chars (no URL in body)
  nostr:  string;   // Nostr variant, aim ≤ 500 chars (long-form OK)
};
```

### Tone preset shape

```ts
type Tone = {
  intro:    string[];   // for Announcement openers
  cta:      string[];   // for "RSVP" lines
  reminder: string[];   // 7-day reminders, may contain {days} and {title_short}
  day:      string[];   // 24-hour reminders
  live:     string[];   // day-of "live now" lines
  followup: string[];   // post-event recap openers
};
```

---

## 4. Post generation rules

The engine produces exactly **6 stages**, each with an `x`, `xlong`, and `nostr` string (18 total strings per event).

| # | Stage | Send when | Short X goal | Long X goal | Nostr goal |
|---|---|---|---|---|---|
| 1 | Announcement | When event is first posted | ≤ 280 chars | link-light, ≤ 2,000 chars | unlimited; aim ≤ 500 |
| 2 | 7-day reminder | 1 week before | ≤ 280 | link-light, ≤ 2,000 | ≤ 500 |
| 3 | 24-hr reminder | 1 day before | ≤ 280 | link-light, ≤ 2,000 | ≤ 500 |
| 4 | Live update | At event start | ≤ 280 | link-light, ≤ 2,000 | ≤ 500 |
| 5 | Follow-up | Day after | ≤ 280 | link-light recap | ≤ 800 |
| 6 | YouTube recap | After recording is live | ≤ 280 | link-light recap with YouTube link in reply | ≤ 800 |

### Style knob (structural skeleton)

The engine supports two **Styles** — user-selectable, surfaced in the form alongside Tone:

- **Structured** — label-led, scannable, one fact per line (`New event: … 📅 … 📍 … RSVP →`). The v1 look, cleaned up.
- **Conversational** — opens with a hook/question, reads like a person wrote it.

Default: Conversational. Changing Style re-renders all drafts instantly (no extra click).

### Tone knob (voice)

Four tones, each with its own intro/cta/reminder/day/live/followup phrase banks. Changing Tone also re-renders instantly.

### Building blocks each post must include
- **Announcement**: tone intro + title + date_display + venue + speaker (with @handle if available) + hook + CTA + Luma URL + hashtags
- **7-day**: tone reminder line (with day count substituted) + title + date + RSVP URL + hashtags
- **24-hr**: tone day line + title + date + speaker_x or speaker name + RSVP URL + hashtags
- **Live**: tone live line + speaker tag + 1-line hook + venue + **timezone conversions** (local + ET + PT, deduped) + hashtags
- **Follow-up**: tone followup line + title + speaker tag + one clearly-marked blank for the key takeaway + "Recording soon" + hashtags
- **YouTube recap**: recording-is-live opener + takeaway placeholder + YouTube URL for Nostr + "YouTube link in reply" for X

### Timezone handling

- **Read the real zone from Luma, never hardcode.** Prefer the IANA zone (`America/Denver`) from the page JSON; fall back to the UTC offset on the JSON-LD `startDate`.
- **Label every time with its zone** (`6:30 PM MDT`), derived via `Intl.DateTimeFormat(..., { timeZone, timeZoneName: 'short' })` — always DST-correct.
- **Live-stage conversions**: render the event start instant in the event's local zone + `America/New_York` + `America/Los_Angeles`, deduped if any equal the local zone. Example: `7:00 PM MDT · 9:00 PM EDT · 6:00 PM PDT`.
- The `tz` field in each event object accepts an IANA zone string (e.g. `"America/Denver"`). When absent, falls back to the UTC offset embedded in `date_iso`.

### Variation
- Use `pick(array)` to randomly select intro/cta/etc lines so successive generations don't look identical.
- Substitute `{days}` and `{title_short}` tokens in reminder strings before rendering.

### Character counting
- For short X posts, display `length / 280` and flash `.warn` if over.
- For long X posts, display `length chars`; keep the main post link-light (no URLs in the body); use "link in reply" language for RSVP or YouTube URLs.
- For Nostr posts, display `length chars` and a soft hint if > 500 (suggest [Highlighter.com](https://highlighter.com) for long-form).
- All generated post bodies are editable in the app. Copy buttons and X compose buttons must use the **edited** text, not the original generated string.

### Differences between X and Nostr variants
- **Nostr variants** should:
  - Be more verbose / less compressed (no character pressure).
  - Use `nostr:` URI prefix for npubs (e.g. `nostr:npub1abc...`).
  - Skip @-handles that don't map to Nostr; use full name instead.
- **X variants** should:
  - Use `@handle` for the speaker if `speaker_x` exists.
  - Tighter, fewer line breaks.
  - Prefer 1 emoji per line as visual anchor.
  - Keep the long X variant free of external URLs in the main post; put links in replies.

---

## 5. UI requirements

### Layout
- Two-column grid on desktop, stacked on mobile (`@media (max-width:900px)`).
- Left column: import card + event-details form + seeded events card.
- Right column: generated posts + **Posting checklist** panel.
- Sticky header (navy band): logo left; **`Clear form`** and **`View on GitHub`** buttons right. No "Open Luma" link.

### Form fields (left column, in order)
1. **Luma import card** — URL input, `Import from Luma`, `Paste text/HTML` toggle + paste fallback.
2. **Event details card:**
   - **Title** — visible, typeable field (not hidden).
   - Date / time
   - Speaker(s)
   - Speaker X handle (optional)
   - Speaker Nostr npub (optional)
   - Hook / one-liner
   - Luma / RSVP URL
   - YouTube recording URL (optional)
   - Hashtags
   - **Style** selector (Structured / Conversational)
   - **Tone** selector (Educational / Welcoming / Cypherpunk / Punchy)
   - **Generate posts** (before any output) / **Regenerate posts ↻** (after output exists)
3. **Seeded events card** — buttons from `events.json`.

### Visual style — "Bitcoin Circle"
- Navy header band (`#0f1129` / `#161837`), light `--bg` page (`#f8f9fc`), white cards.
- **Accent**: Bitcoin orange `#f7931a`. Orange buttons use **near-black text** (`#0f1129`) — AA-compliant.
- **Type**: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. Post draft boxes use the regular sans (not monospace).
- White cards, 16px radius, soft shadows. Pill buttons.
- Mobile: single column, form on top. Copy/Open buttons ≥ 44px touch height. Inputs 16px font (prevents iOS focus-zoom).

### Regenerate behavior
- Before any posts exist: button reads **"Generate posts."**
- After posts exist: button reads **"Regenerate posts ↻"**, lives at the bottom of Event details.
- Changing Style or Tone re-renders instantly (no click needed).
- Editing a text field → click Regenerate to refresh all drafts.
- **Regenerate overwrites hand-edited drafts** — show a confirm/heads-up before wiping boxes the user has edited.

### Posting checklist
- Renamed from "15-min posting checklist" to **"Posting checklist"**.
- Same runbook content (6 stages, quick-launch buttons to X compose / Primal / Damus / Highlighter), `aria`-correct checkboxes.

### Components
- `panel` — container with header bar (`h2` uppercase muted) and `panel-body`.
- `btn` (+ `.btn.primary`, `.btn.ghost`, `.btn.small`) — uniform button style.
- `stage` — generated post card with `.stage-head` (title + badge + when) and `.posts` (short X / long X / Nostr tabs or columns).
- `post-body` — auto-grow textarea for the generated text (no scroll inside a box).
- `toast` — bottom-center "Copied" confirmation, announced via `aria-live`.

### Interactions
- Clicking a seeded event button fills the form AND immediately renders posts.
- Style/Tone selectors are keyboard-navigable; selected option gets `.on` class with accent border.
- Copy buttons: `navigator.clipboard.writeText` preferred; **`execCommand('copy')` fallback** for `file://` / non-HTTPS contexts.
- "Open in X" button uses `https://x.com/intent/tweet?text=...` deep link (short X and long X variants; Nostr is copy-only).

---

## 6. Tone preset content

Use the following phrases as the starting library. Add more, but keep the categories.

### Punchy
- intro: "Mark your calendar.", "Lock it in.", "This one's huge.", "Don't sleep on this."
- cta: "RSVP now →", "Grab a spot →", "Get on the list →", "We'll see you there →"
- reminder: "{days} days.", "{days} days out.", "We're close.", "Almost time."
- day: "Tomorrow.", "24 hours.", "1 sleep.", "It's happening tomorrow."
- live: "LIVE NOW.", "Doors open. Pull up.", "It's go time.", "Started. Come through."
- followup: "What a night.", "That was 🔥.", "Recap drop.", "If you missed it —"

### Educational
- intro: "New event:", "Up next:", "Join us for:", "Coming up:"
- cta: "Free RSVP →", "Save your seat →", "More details + RSVP →", "Sign up to attend →"
- reminder: "{days} days until {title_short}.", "Reminder: {title_short} in {days} days.", "Coming up in {days} days:"
- day: "Tomorrow:", "24 hours out:", "We're 1 day away:"
- live: "Happening now:", "Live now:", "We're live with"
- followup: "Thanks to everyone who came out for", "Recap:", "Here's what we covered:"

### Cypherpunk
- intro: "Signal:", "Sovereignty drop:", "From the underground:", "For the orange-pilled:"
- cta: "RSVP. No KYC.", "Show up. Stay sovereign.", "Lock in →", "Reserve your seat. Cash welcome."
- reminder: "{days} blocks-ish until we meet.", "T-minus {days} days.", "{days} days. Be there."
- day: "Tomorrow. Be there.", "24h. No excuses.", "1 sleep until signal."
- live: "We're live. No retreat.", "LIVE now.", "On-chain in spirit. Live in person."
- followup: "That's a wrap.", "If you weren't there — fix that next time.", "Notes from the front lines:"

### Welcoming
- intro: "You're invited:", "Come hang with us:", "All welcome:", "New to Bitcoin? Start here:"
- cta: "Free + open to everyone →", "First time? Just show up →", "RSVP and say hi →", "Bring a friend →"
- reminder: "Just {days} days until we hang out again.", "{days} days out. Hope to see you.", "Counting down — {days} days."
- day: "See you tomorrow.", "We're 1 day out — looking forward to it.", "Tomorrow we hang."
- live: "We're live. Door's open — come on in.", "Started, but pull up anytime.", "Hanging out now."
- followup: "Thanks for hanging with us.", "What a fun crowd.", "Loved having everyone."

---

## 7. Acceptance tests (manual QA the AI should run)

When rebuilding, the agent must verify all of these by running through them in a headless browser or by tracing logic:

1. **Cold load**: Open `index.html` directly with no server. The form renders; Style defaults to "Conversational"; Tone defaults to "Educational"; seeded event buttons appear (3 of them) if `events.json` is fetchable. Works offline (seeded/manual mode). Copy works on `file://` (clipboard fallback).
2. **Seeded click**: Click the "Bitcoin in Healthcare" seeded button. Form fills with title, date, speaker, hook, Luma URL. **6 stages** render on the right. The Announcement short X post is ≤ 280 chars and includes the date (with timezone label) and Luma URL.
3. **Style switch**: Switching Style re-renders instantly. Structured posts open with label-led format; Conversational opens with a hook/question.
4. **Tone switch**: Switch to "Cypherpunk". Generated posts now begin with "Signal:", "Sovereignty drop:", etc.
5. **Manual form**: Clear form. Type "Test Event" as the **Title** (visible field), "Sat, Jul 4 · 7pm MDT" as date, "Alice" as speaker. Click Generate. 6 stages render. No errors in console.
6. **Copy**: Click Copy on any X post. Clipboard contains the exact post text including emojis and newlines. Toast appears.
7. **Edit drafts**: Edit a generated post body. Character counts update live, Copy uses the edited text, and Open in X uses the edited text.
8. **Char count warn**: Enter a 500-char hook. The Announcement X post char counter shows red `> 280`.
9. **Live timezone**: The Live-stage post shows local + ET + PT conversions, deduped, DST-correct (e.g. `7:00 PM MDT · 9:00 PM EDT · 6:00 PM PDT`).
10. **Mobile**: Resize to 375px width. Form stacks above output. Buttons remain tappable (≥ 44px hit target). Inputs at 16px font (no iOS focus-zoom).
11. **Network**: Cold load has no analytics, fonts, or CDN assets. Luma import races proxy endpoints only after the user clicks **Import from Luma**.

---

## 8. Future enhancements

### Optional provider-agnostic AI panel (next candidate)
A Settings panel (off by default) that accepts any **OpenAI-compatible endpoint** — a local Ollama (`localhost`, nothing leaves the machine), OpenRouter, or other privacy provider — with the key stored in `localStorage` only. When configured, Generate/Regenerate calls it for bespoke copy; otherwise templates. One request → all 18 drafts as JSON; output still passes the 280/link-light guards. Provider-agnostic (not locked to any vendor).

### v1.1 — Image flyer generator
- Add an "Export flyer" button per stage.
- Use HTML5 `<canvas>` to render a 1080×1350 image with title, date, speaker, venue.
- User downloads as PNG to attach when posting.
- Still no backend.

### v1.2 — Luma calendar import
- Pull the upcoming events list from a Luma calendar, not just single-event pages.
- Let the user select an event from the calendar and generate posts immediately.
- If CORS blocks, support pasted calendar page source as a fallback.

### v1.3 — Optional Postiz integration
- Settings panel where user pastes their self-hosted [Postiz](https://postiz.com) API URL + token.
- Adds a "Schedule via Postiz" button per post.
- Token stored in `localStorage` only. Never bundled in the repo.

### v1.4 — Highlighter.com long-form export
- For the Follow-up stage, add an "Export to Highlighter" button that opens a draft on [Highlighter.com](https://highlighter.com) with a NIP-23 markdown payload.

### v1.5 — Multi-venue support
- Allow `events.json` to ship multiple venues; show a venue switcher.
- Each venue has its own default hashtags and brand color.

### v1.6 — Recurring event templates
- Save form state as a "template" in `localStorage` so weekly recurring events (e.g. "Open Hack Night") can be re-loaded instantly.

---

## 9. Coding conventions

- **Style**: 2-space indent. Semicolons. Double quotes for HTML attrs, single quotes in JS strings.
- **No frameworks**. No transpilers. No Babel.
- **No `var`** — use `const`/`let`.
- **No `eval` / `innerHTML` with user content** — use `textContent` or the provided `escapeHtml()` for any user-supplied string going into the DOM.
- **CSS**: Single `:root` variable block. Avoid `!important`.
- **Comments**: Block headers between major sections (`/* ---------- Section ---------- */`).
- **Functions**: Small, named, hoisted at top of `<script>` block.

---

## 10. Neutrality constraint

No venue-specific branding anywhere in repo text or generated copy. Allowed neutral terms: "Event Poster," "Denver Bitcoin meetup," "Luma events," "X + Nostr campaigns." `sanitizeVenueText` enforces this on imported content.

To verify, run the venue-neutrality `rg` check defined in the design spec (`docs/superpowers/specs/2026-05-23-event-poster-v2-design.md` §10) against `README.md`, `BUILD_SPEC.md`, `events.json`, `LICENSE`, and `index.html`. Expected: no matches. The literal forbidden-term pattern is kept only in that design-spec file (which is outside the checked set), so this build spec stays clean of the very terms it forbids.

---

## 11. Definition of done

- All files render correctly when served from GitHub Pages.
- All acceptance tests in §7 pass.
- The 3 seeded events from `events.json` appear as clickable buttons and produce sensible posts in all 4 tones and both styles.
- Lighthouse Accessibility score ≥ 90, Performance ≥ 95 on desktop.
- `README.md` includes 3-step GitHub Pages deploy instructions.
- `index.html` < 50 KB uncompressed.
- Neutrality grep returns no matches.

---

## Appendix A — Prompt for Claude Code / Codex

> Build a single-file HTML tool per the attached `BUILD_SPEC.md`. The current `index.html` is the v2 baseline — extend, don't replace, unless a section explicitly calls for a rewrite. Match the existing visual style ("Bitcoin Circle": navy header, white cards, Bitcoin-orange accent with near-black button text, Inter-with-system-fallback). Run the §7 acceptance tests after every change. No new dependencies. No build step. No backend.

## Appendix B — Brand & voice references

- Default venue profile lives in `events.json` and can be customized without changing the post engine.
- Accent: Bitcoin orange `#f7931a` on near-black `#0f1129` (navy).
- Cross-post targets:
  - X: `https://x.com/intent/tweet?text=...`
  - Nostr: Primal, Damus, Amethyst clients (manual paste — no client supports a universal compose URL yet)
  - Long-form Nostr: [highlighter.com](https://highlighter.com)
