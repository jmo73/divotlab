# Divot Lab — Project Reference

This file is the source of truth for project context, conventions, and recurring tasks.
Claude should read this at the start of every session and update it whenever new recurring tasks, key decisions, or important patterns are introduced.

**RULE: Any time Claude creates something that requires future manual updates (JSON files, weekly tasks, new data sources), it must add an entry to the WEEKLY TASKS or MAINTENANCE section below before finishing.**

---

## What Divot Lab Is

Data-driven golf analytics brand. Two products:
- **Lab Notes** — weekly golf analytics newsletter (free + $4.99/mo + $9.99/mo Pro tiers), delivered via Beehiiv
- **Lab Picks** — golf betting picks inside Lab Notes Pro. Course-fit model + odds comparison across 6 sportsbooks. Public track record.

Current metrics (as of May 2026): 13 free subscribers, 1 paying ($9.99 Pro), ~20 visitors/week, 320 Instagram followers. 2026 picks record: 55% hit rate, +30% ROI, 7 events.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | Static HTML/CSS/JS — no framework |
| Hosting | Vercel (static) |
| API | Node.js/Express in `/api/`, deployed at `https://divotlab-api.vercel.app` |
| Newsletter | Beehiiv (HTML snippets pasted manually) |
| Payments | Stripe |
| Analytics | Google Analytics (G-PEX1MKH2LP) |
| Golf data | DataGolf API (via the Vercel API proxy) |

---

## File Structure — Key Files

```
/                           ← root: all public website pages
  index.html                ← homepage
  picks.html                ← free pick landing page (NEW — drives Twitter funnel)
  lab-notes.html            ← newsletter pricing/signup page
  lab-picks.html            ← password-protected picks dashboard (The Lab)
  the-lab.html              ← same as above (nav CTA destination)
  practice.html             ← practice plan quiz + upsell
  practice-library.html     ← drill library
  articles.html             ← article index
  about.html

  current-pick.json         ← THIS WEEK'S FREE PICK — update every Wednesday
  
/lab-notes/
  CLAUDE.md                 ← newsletter generation instructions (separate)
  /lab-picks/
    season-tracker.json     ← MASTER PICKS RECORD — update every Monday
    picks-template.html     ← Beehiiv template (keep tracked)
    20*.html                ← weekly picks issues (gitignored — paste into Beehiiv)
  /issues/
    20*.html                ← weekly newsletter issues (gitignored — paste into Beehiiv)
  /segments/                ← reusable newsletter segments (keep tracked)

/api/                       ← Vercel serverless API
  server.js                 ← main API — DataGolf proxy, subscribe endpoint, auth

/assets/                    ← images, fonts, JS

[gitignored tool files]
  instagram-library.html    ← 145 Instagram card generator
  twitter-templates.html    ← tweet template library
  twitter-evergreen.html    ← 100 ready-to-post evergreen tweets
  twitter-cards.html        ← Twitter result/record card generator
  twitter-header.html       ← Twitter profile header generator
  partnership-guide.html    ← partnership outreach guide + DM templates
```

---

## Weekly Tasks — Must Be Done Every Tournament Week

### Wednesday (pick day)
1. **Open `admin.html`** in browser (gitignored local tool, password: `divotlab2026`)
   - Fill in the pick form → Download `current-pick.json` → replace file → deploy
   - Use "Newsletter Output" tab to generate pre-filled Beehiiv Season Tracker HTML
   - Alternatively: edit `current-pick.json` directly
   - Fields: `tournament`, `week_of`, `published`, `pick.player`, `pick.bet_type`, `pick.bet_detail`, `pick.odds`, `pick.book`, `pick.reasoning`, `pick.confidence`
   - Set `pick.result` to `null` (pending)
   - This file drives `picks.html` — the public free pick landing page
2. **Create `lab-notes/lab-picks/YYYY-MM-DD-[tournament]-picks.html`** from the picks template for Beehiiv

### Tuesday (newsletter day)
1. **Create `lab-notes/issues/YYYY-MM-DD-[tournament].html`** from the Lab Notes template for Beehiiv
   - Run `node scripts/pull-data.js` then `node scripts/process-data.js` first
   - See `lab-notes/CLAUDE.md` for the full newsletter generation workflow

### Sunday evening / Monday
1. **Update `current-pick.json`**:
   - Set `pick.result` to `"win"` or `"loss"`
   - Set `pick.result_detail` to a short result note (e.g. "Finished T4")
2. **Update `lab-notes/lab-picks/season-tracker.json`**:
   - Update `totals` block: `total_picks`, `total_hits`, `hit_rate_pct`, `units.*`, `events_tracked`
   - Add the week's picks to `weekly_picks` array
   - This file drives: homepage tracker, lab-notes page tracker, picks.html record bar — all auto-update on deploy

---

## Data Files — Schema Reference

### `current-pick.json`
```json
{
  "tournament": "Tournament Name",
  "tour": "PGA Tour",
  "week_of": "May 7–11, 2026",
  "published": "2026-05-07",
  "pick": {
    "player": "Player Name",
    "bet_type": "Top 10 / H2H / Top 5 / Top 20",
    "bet_detail": "over [opponent] OR null",
    "odds": "+350",
    "book": "DraftKings",
    "reasoning": "1–2 sentences backing the pick with model data.",
    "confidence": "High / Medium / Low",
    "result": null,
    "result_detail": null
  },
  "teaser": "X more picks in Lab Notes Pro this week."
}
```

### `season-tracker.json` — key fields to update weekly
```json
{
  "totals": {
    "total_picks": 29,
    "total_hits": 16,
    "hit_rate_pct": 55.2,
    "events_tracked": 7,
    "units": {
      "wagered": 29.0,
      "returned": 37.75,
      "profit_loss": 8.75,
      "roi_pct": 30.2
    }
  },
  "weekly_picks": [ ... ]
}
```

---

## Brand — Design Tokens

| Token | Value |
|---|---|
| Background | `#0A0A0A` |
| Card bg | `#161614` |
| White | `#FAFAFA` |
| Green | `#1B4D3E` |
| Green light | `#5BBF85` |
| Blue mid | `#5A8FA8` |
| Gold | `#C9A84C` |
| Border | `rgba(255,255,255,0.07)` |
| Display font | Cormorant Garamond |
| Body font | DM Sans |
| Mono font | JetBrains Mono |

Dark mode is the default. Light mode toggle exists on most pages via `data-theme` attribute on `<html>`.

---

## DataGolf API — Rate Limits

**45 requests per minute** — applies to ALL requests, not per-endpoint.
Exceeding the limit results in a **5-minute suspension**.

This is why the `/api/lab-data` endpoint fetches in batches of 3 with a 500ms delay between batches, and why caches are set aggressively (6hr pre-tournament, 5min during live play). Never add new parallel fetches without checking total request count against this limit.

## API Endpoints (divotlab-api.vercel.app)

| Endpoint | Purpose |
|---|---|
| `POST /api/subscribe` | Subscribe email to Beehiiv |
| `POST /api/auth/lab-picks` | Password auth for lab-picks.html |
| `GET /api/betting-odds` | DataGolf odds proxy |
| `GET /api/course-fit` | Course-fit leaderboard — normalized 0-100 scores for full field |
| `GET /api/derive-course-weights` | **Annual plan** — derives course weights from historical round SG data. Params: `event_id` (required), `top_n`, `years` |
| `GET /api/historical-rounds` | **Annual plan** — round-level SG data. Params: `tour`, `event_id`, `year` |
| `GET /api/historical-odds-outrights` | **Annual plan** — historical betting lines 2019–2025. Params: `book` (required), `tour`, `event_id`, `year`, `market` |
| `GET /api/historical-odds-matchups` | **Annual plan** — historical H2H/3-ball lines |
| `GET /api/historical-event-results` | **Annual plan** — actual finishes and earnings |
| `GET /api/historical-dfs` | **Annual plan** — DFS salaries and ownership |

---

## Beehiiv HTML Format Rules

All newsletter HTML is pasted as HTML Snippet blocks in Beehiiv:
- **Inline CSS only** — no `<style>` blocks
- **Table-based layout** for all structural elements
- **No `<html>`, `<head>`, `<body>` tags**
- Font stack: `'DM Sans', Helvetica, Arial, sans-serif`
- Max content width: 600px (Beehiiv handles this)
- Background `#0A0A0A` is set by the Beehiiv template
- See `lab-notes/CLAUDE.md` for full format spec

---

## Pages That Auto-Update from JSON

These pages fetch data client-side and update automatically when JSON files are updated and deployed:

| Page | Data source | What updates |
|---|---|---|
| `index.html` | `season-tracker.json` | Season tracker section |
| `lab-notes.html` | `season-tracker.json` | Season tracker section |
| `picks.html` | `current-pick.json` + `season-tracker.json` | Pick card + record bar + recent results |

**Deploy after updating any JSON file** — Vercel auto-deploys on push to main.

---

## Active Projects / In Progress

- **Course-fit leaderboard** — BUILT. `leaderboard.html` + `/api/course-fit` endpoint in `api/server.js`. Top 10 free, full field paywalled. Next: add course history component (how players have historically finished vs. their pre-tournament model rank at this venue).
- **Course-fit model** — IMPROVED. Now: 40+ course profiles, form blending (65% L24 + 35% L12), 0-100 normalized score, server-side computation. Next improvement: derive weights from historical round data rather than editorial judgment.
- **Between the Ears app partnership** — collaboration in early discussion. They integrate Divot Lab analytics, display "Powered by Divot Lab."
- **Twitter/X account** — just launched. Templates and evergreen tweet library built. Focus: pick reveals, data takes, reply engagement during tournament rounds.

---

## Conventions Claude Should Follow

- **No comments in code** unless the WHY is non-obvious
- **No emojis** unless the user explicitly asks
- **Dark mode default** — always test light mode overrides exist when editing pages that have theme toggle
- **Mobile-first fixes** — the main user complaints have been mobile layout issues. Always check mobile breakpoints when editing CSS
- **Nested scroll containers on mobile are bad** — never put `max-height + overflow-y: auto` inside a page that also scrolls on mobile
- **Gitignored files** — instagram-library.html, partnership-guide.html, twitter-*.html, lab-notes/issues/*, lab-notes/lab-picks/20*.html are intentionally not tracked
- **season-tracker.json is the single source of truth** for all pick records. Never hardcode stats in HTML — always fetch from this file
- **current-pick.json is the single source of truth** for the live free pick. Never hardcode pick details in picks.html

---

## MAINTENANCE LOG

| Date | Task added | Why |
|---|---|---|
| 2026-05-07 | Weekly update of `current-pick.json` | Created picks.html which fetches this file for the free pick landing page |
| 2026-05-07 | Weekly update of `season-tracker.json` | Drives 3 pages (homepage, lab-notes, picks) auto-updating record displays |
| 2026-05-07 | `admin.html` password is `divotlab2026` | Change directly in the file if needed (line ~175, ADMIN_PASSWORD variable) |
