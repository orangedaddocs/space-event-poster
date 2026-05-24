# Event Poster

A free, single-file, self-hosted post generator for Luma events.
Paste a Luma event URL, get a ready-to-copy X + Nostr campaign.

**▶ Use it now → https://orangedaddocs.github.io/event-poster/** — click and start. Or download the single `index.html` and open it; it works exactly the same, fully offline.

🔒 **No AI. No accounts. No tracking.** The tool has no analytics, no pixels, and loads no external scripts or fonts — it's one HTML file you can read end to end. It makes **zero network requests until *you* click "Import from Luma."** Want nothing in the middle at all? Download `index.html` and run it locally — then not even a web host sees you.

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
- **Zero build, zero backend, zero dependencies** — a single HTML file. Works on GitHub Pages or just `open index.html`; works fully offline (manual entry + paste fallback)

---

## Quick start

### Run it locally — most private

Open `index.html` in any browser. Done — it works offline for manual entry, and copy works via the `execCommand` fallback. For full clipboard support on every browser, serve it from your own machine:

```
python3 -m http.server 8787      →  http://localhost:8787
```

Nothing leaves your machine except the optional Luma import.

### Self-host — sovereign + shareable

It's one static file. Put `index.html` behind any web server you control — your own box or your own domain — so your community can use a URL *you* own.

### GitHub Pages — easiest, but centralized

Free ~3-minute hosting if you don't mind the platform:

1. Push the repo (it's just `index.html`).
2. In repo **Settings → Pages → Source**: `main` branch, `/ (root)` → Save.
3. Live at `https://<your-username>.github.io/event-poster/`.

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

### 1. Rebrand the colors

In `index.html`, change the `:root` CSS variables:

```css
--accent:   #f7931a;   /* Bitcoin orange — change to your brand color */
--navy-950: #0f1129;   /* Header band background */
--bg:       #f8f9fc;   /* Page background */
```

### 2. Edit the tone presets

Open `index.html`, find `const TONES = {...}` in the `<script>` block, and edit the openers / ctas / signoffs phrases for each tone. Add phrases to any array; the engine rotates through them via a seed so successive generations differ.

### 3. (Optional) Have an AI write the posts instead of templates

The default engine fills templates — fast, free, fully local, but the wording follows fixed patterns. To wire up a real LLM for genuinely custom copy (bring-your-own-key, works with a local Ollama or OpenRouter — never locked to one vendor, templates stay the fallback), follow **[`AI_INTEGRATION.md`](AI_INTEGRATION.md)**.

---

## Why this exists

Great event content disappears fast if nobody has time to turn the event page into posts, reminders, and recaps. This tool fixes that — one import, six stages, three variants each, done.

---

## License

MIT. Use it. Fork it. Ship it.
