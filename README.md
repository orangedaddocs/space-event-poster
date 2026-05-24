# Event Poster

A free, single-file, self-hosted post generator for Luma events.
Paste a Luma event URL, get a ready-to-copy X + Nostr campaign.

> **What it does:** You give it one event. It gives you back a full campaign: short X posts, longer link-light X posts, Nostr posts, and a YouTube recap follow-up. No scheduler required, no API keys, nothing leaves the browser.

---

## Features

- **Luma-first import**: paste a Luma URL and the tool races multiple CORS proxies in parallel; if all are blocked, paste the Luma page text/source as a fallback (always works)
- **6-stage campaign** per event: Announcement → 7-day reminder → 24-hr reminder → Live update → Follow-up recap → YouTube recap
- **3 post variants per stage**: short X (≤ 280 chars), long link-light X (no URL in body; link goes in the reply), and Nostr — with live character counts
- **Style selector**: Structured (label-led, scannable) or Conversational (hook-first, reads like a person)
- **4 tone presets**: Educational, Welcoming, Cypherpunk, Punchy — switching either knob re-renders all 18 drafts instantly
- **Visible Title field** — type or import the event title and see it live in every draft
- **Timezone-aware**: reads the IANA zone from Luma (e.g. `America/Denver`); labels every time with the correct abbreviation (MDT/EDT/etc.); Live-stage posts show local + ET + PT conversions, deduped and DST-correct
- **Editable drafts** with one-click copy + "Open in X" using your edited text; clipboard fallback for `file://` / non-HTTPS contexts
- **Posting checklist** to keep each event's campaign consistent
- **Seeded events** load from `events.json` so examples are ready to test instantly
- **Zero build, zero backend, zero dependencies** — a single HTML file. Works on GitHub Pages or just `open index.html`; works fully offline for seeded/manual events

---

## Quick start

### Option 1 — Host on GitHub Pages (recommended, free, ~3 min)

1. Create a new GitHub repo (e.g. `event-poster`).
2. Drop these files in the repo root: `index.html`, `events.json`, `README.md`.
3. In repo **Settings → Pages → Source**: `main` branch, `/ (root)` → Save.
4. Wait ~30 seconds. Your tool is live at `https://<your-username>.github.io/event-poster/`.

### Option 2 — Use locally

Just open `index.html` in any browser. Done. Copy buttons work on `file://` via the `execCommand` fallback.

---

## Usage

1. Paste a **Luma event URL** and click **Import from Luma**.
2. If import is blocked, click **Paste text/HTML**, paste the Luma page source or copied event text, then parse it.
3. Review the filled fields. Edit anything that needs fixing (Title, date, speaker, hook, RSVP URL, hashtags).
4. Pick a **Style** (Structured / Conversational) and a **Tone** — posts re-render instantly.
5. Click **Generate posts** if you made manual edits.
6. Walk down the 6 stages. For each stage:
   - **Short X**: click Copy → paste into X / schedule in your calendar app.
   - **Long X**: use when you want the main post to carry more context; put the RSVP or YouTube link in a reply.
   - **Nostr**: click Copy → paste into [Primal](https://primal.net), [Damus](https://damus.io), or [Amethyst](https://github.com/vitorpamplona/amethyst).
7. Use the **Posting checklist** at the bottom to confirm nothing was missed.

---

## Customize for your meetup

### 1. Update venue info

Edit `events.json`:

```json
{
  "venue": {
    "name": "Your Meetup",
    "city": "Your City",
    "website": "https://example.com",
    "x_handle": "@yourmeetup",
    "nostr_npub": "npub1...",
    "default_hashtags": ["#Bitcoin", "#YourCity"]
  },
  "events": [ ... ]
}
```

### 2. Seed your own events

Add objects to the `events` array. Each event:

```json
{
  "id": "unique-slug",
  "title": "Event title",
  "date_iso": "2026-06-01T18:00:00-06:00",
  "tz": "America/Denver",
  "date_display": "Mon, Jun 1 · 6:00 PM MDT",
  "host": "Your Meetup",
  "speaker": "Speaker Name",
  "speaker_org": "Their company",
  "speaker_x": "@speaker",
  "speaker_nostr": "npub1...",
  "description": "One-line hook that explains why this event matters.",
  "hashtags": ["#Bitcoin", "#YourTopic"],
  "luma_url": "https://luma.com/xxxx",
  "tone": "educational"
}
```

The `tz` field accepts any IANA zone string (e.g. `America/New_York`, `America/Chicago`, `Europe/London`). It lets the Live-stage post show correct timezone abbreviations and cross-zone conversions. If omitted, the tool falls back to the UTC offset in `date_iso`.

### 3. Rebrand the colors

In `index.html`, change the `:root` CSS variables:

```css
--accent:   #f7931a;   /* Bitcoin orange — change to your brand color */
--navy-950: #0f1129;   /* Header band background */
--bg:       #f8f9fc;   /* Page background */
```

### 4. Edit the tone presets

Open `index.html`, find `const TONES = {...}` in the `<script>` block, and edit the openers / ctas / signoffs phrases for each tone. Add phrases to any array; the engine rotates through them via a seed so successive generations differ.

### 5. (Optional) Have an AI write the posts instead of templates

The default engine fills templates — fast, free, fully local, but the wording follows fixed patterns. To wire up a real LLM for genuinely custom copy (bring-your-own-key, works with a local Ollama or OpenRouter — never locked to one vendor, templates stay the fallback), follow **[`AI_INTEGRATION.md`](AI_INTEGRATION.md)**.

---

## Why this exists

Great event content disappears fast if nobody has time to turn the event page into posts, reminders, and recaps. This tool fixes that — one import, six stages, three variants each, done.

---

## License

MIT. Use it. Fork it. Ship it.
