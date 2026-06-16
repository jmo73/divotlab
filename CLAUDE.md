# Divot Lab — Project Reference

This file is the source of truth for project context, conventions, and recurring tasks.
Claude should read this at the start of every session and update it whenever new recurring tasks, key decisions, or important patterns are introduced.

**RULE: Any time Claude creates something that requires future manual updates (JSON files, weekly tasks, new data sources), it must add an entry to the WEEKLY TASKS or MAINTENANCE section below before finishing.**

---

## What Divot Lab Is

Data-driven golf analytics brand. Two products:
- **Lab Notes** — weekly golf analytics newsletter (free + $9.99/mo Pro tier), delivered via Beehiiv
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
  pro-picks.json            ← THIS WEEK'S PRO PICKS (all 4–5) — update every Wednesday
  pro.html                  ← email-gated Pro analytics hub (Course Fit, Value Finder, H2H, Live)
  leaderboard.html          ← public course-fit rankings (top 10 free, rest paywalled)
  picks.html                ← free pick public landing page
  

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
   - **New Pick tab**: fill free pick → Download `current-pick.json` → replace → deploy
   - **Pro Picks tab**: fill all 4–5 picks → Download `pro-picks.json` → replace → deploy
     - Click "Pull from New Pick tab" to auto-fill tournament info
     - Click "Generate Newsletter HTML" → Copy → paste into Beehiiv as HTML Snippet
   - Fields: `tournament`, `week_of`, `published`, `pick.player`, `pick.bet_type`, `pick.bet_detail`, `pick.odds`, `pick.book`, `pick.reasoning`, `pick.confidence`
   - Set `pick.result` to `null` (pending)
   - `current-pick.json` drives `picks.html` (public free pick landing page)
   - `pro-picks.json` drives the "This Week's Card" section on `/pro`
2. **Create `lab-notes/lab-picks/YYYY-MM-DD-[tournament]-picks.html`** from the picks template for Beehiiv

### Tuesday (newsletter day)
1. **Create `lab-notes/issues/YYYY-MM-DD-[tournament].html`** from the Lab Notes template for Beehiiv
   - Run `node scripts/pull-data.js` then `node scripts/process-data.js` first
   - See `lab-notes/CLAUDE.md` for the full newsletter generation workflow

### Sunday evening / Monday
1. **Update `current-pick.json`** (Mark Result tab in admin.html):
   - Set `pick.result` to `"win"` or `"loss"`
   - Set `pick.result_detail` to a short result note (e.g. "Finished T4")
2. **Update `pro-picks.json`** (Pro Picks tab in admin.html — Load Current Values → update results → regenerate → download)
   - Each pick has `result` (win/loss/push/null) and `result_detail` fields
   - Results auto-show as WIN/LOSS badges on the Pro page picks card
3. **Update `lab-notes/lab-picks/season-tracker.json`**:
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

### `pro-picks.json`
```json
{
  "tournament": "Tournament Name",
  "week_of": "May 7–11, 2026",
  "published": "2026-05-07",
  "picks": [
    {
      "player": "Player Name",
      "bet_type": "Top 10 / H2H / Top 5 / Top 20 / Outright Win",
      "bet_detail": "over [opponent] OR null",
      "odds": "+350",
      "book": "DraftKings",
      "reasoning": "1–2 sentences backing the pick.",
      "confidence": "High / Medium / Low",
      "result": null,
      "result_detail": null
    }
  ]
}
```
Up to 5 picks. Empty player name = slot skipped. Generated via admin.html Pro Picks tab.

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
| `pro.html` | `pro-picks.json` | "This Week's Card" section above tabs — all Pro picks with status badges |

**Deploy after updating any JSON file** — Vercel auto-deploys on push to main.

---

## Authentication — /pro page

Pro subscribers access `/pro` by entering the email they subscribed with. The API checks Beehiiv's Pro publication for an active subscription and grants 7-day browser access via localStorage.

**Required Vercel env var**: `BEEHIIV_PRO_PUB_ID` — the publication ID of the separate Lab Notes Pro Beehiiv publication (not the same as `BEEHIIV_PUB_ID` which is the free newsletter).

**API endpoint**: `POST /api/verify-pro` — body: `{email}`, returns `{verified: true/false}`

## Navigation — Final Structure (all pages)

```
[Logo] · Lab Picks (/picks) · The Lab (/the-lab) · Articles · Lab Notes · [Pro →] (/pro)
```

The Lab is free and public. Pro → is the gold CTA button linking to the gated premium hub.

## Growth — Free Trials & Account Improvements

Priority: get real users before optimizing revenue. Free trials → retention → word of mouth.

### Current auth model (limitation)
Email entered at gate → checked against Beehiiv Pro publication → 7-day localStorage token. No trial state, no referral tracking, no upgrade flow.

### Phase 1 — Free Trial (build next)
Goal: let anyone start a 14-day free trial without paying upfront.

1. **Add `POST /api/start-trial` endpoint** in `api/server.js`
   - Body: `{email}`
   - Store trial in a lightweight KV store (Vercel KV / Upstash Redis) — key: email, value: `{started, expires, converted}`
   - Return a trial token (7-day, same localStorage pattern as current auth)
   - Rate limit: 1 trial per email, ever

2. **Update gate on `/pro`** — add "Start Free Trial" button below the subscriber verify form
   - Flow: enter email → if no active sub → offer 14-day trial → API creates trial → access granted
   - Show trial expiry date in the user chip: "Trial · 11 days left"
   - At expiry: gate re-appears with "Your trial ended" + Stripe subscribe link

3. **Trial-to-paid email** (Beehiiv automation or manual for now)
   - Day 7 of trial: send "You're halfway through your trial" + what you've accessed
   - Day 13: "Trial ends tomorrow" + one-click subscribe

### Phase 2 — Referral Tracking
Currently: manual (subscribers reply with referral's name).

1. **Add `referral_code` to Beehiiv subscriber custom fields** (or use a simple JSON file)
2. **Stripe webhook** → on new Pro sub, check if referral code used → credit referring subscriber
3. **Referral dashboard** in admin.html — shows who referred whom, credits earned

### Phase 3 — Upgrade Flow
1. Replace Stripe buy link with a proper upgrade page that:
   - Pre-fills email from the trial session
   - Shows "You've been using Pro for X days" with usage highlights
   - One-click subscribe (Stripe Checkout)
2. Post-payment webhook → auto-add to Beehiiv Pro publication → access continues seamlessly

### What to build in what order
1. **Trial system** (highest impact — removes the friction of asking for $9.99 upfront)
2. **Referral code tracking** (the ask is in the launch email; need the infrastructure)
3. **Trial expiry email** (manual first, then automate)
4. **Upgrade flow** (after trials are converting)

### Referral incentive (current)
Free month per referral. Subscriber mentions referrer's name on signup → manual credit tracked in admin.html (to build). For now, handled by email reply.

---

## Active Projects / In Progress

- **Pro page (/pro)** — BUILT. Email-gated hub for Pro subscribers. Tabs: Course Fit (full field 0-100), Value Finder (sortable, edge + fit signal), H2H Tool (model insight), Live (live SG + Win%/Top5/10/20, auto-refresh 90s). "This Week's Card" above tabs from pro-picks.json.
- **Course-fit leaderboard** — BUILT. `leaderboard.html` + `/api/course-fit`. Top 10 free, full field paywalled. Next: course history component.
- **Course-fit model** — IMPROVED. 40+ course profiles, form blending (65% L24 + 35% L12), 0-100 normalized score. Next: derive weights from historical data via /api/derive-course-weights.
- **Between the Ears app partnership** — collaboration in early discussion. They integrate Divot Lab analytics, display "Powered by Divot Lab."
- **Twitter/X account** — just launched. Templates and evergreen tweet library built. Focus: pick reveals, data takes, reply engagement during tournament rounds.

---

## Pro Dashboard Build Roadmap

Full plan for expanding /pro with all available DataGolf data. Build in priority order.

### DataGolf Endpoint Status

| Endpoint | Status | Notes |
|---|---|---|
| `preds/live-tournament-stats` | ✅ Live tab | Live SG per round, event avg |
| `preds/in-play` | ✅ Live tab | Win%/Top5/10/20 updated live |
| `preds/pre-tournament` | ✅ Value Finder | Pre-round finish probabilities |
| `betting-tools/outrights` | ✅ Value Finder | 4 markets, 6 books, model edge |
| `betting-tools/matchups` | ⚡ partial | API built, H2H tool manual only — needs Matchup Market tab |
| `preds/approach-skill` | ❌ not in UI | SG: App by distance bucket (100–125, 125–150, 150–175, 175–200, 200+) |
| `preds/player-decompositions` | ❌ not in UI | Skill components: driving, irons, wedges, short game |
| `preds/fantasy-projection-defaults` | ❌ not in UI | DFS salary + projected points |
| `historical-raw/rounds` | ❌ not in UI | Round-level SG + scoring, 22 tours |
| `historical-raw/event-results` | ❌ not in UI | Actual finishes, earnings, FedExCup pts |
| `historical-odds/outrights` | ❌ not in UI | Opening/closing lines 2019–2025 |
| `historical-odds/matchups` | ❌ not in UI | Historical H2H lines for backtesting |
| `historical-dfs` | ❌ not in UI | DK/FD points vs SG correlation |
| `preds/pre-tournament-archive` | ❌ not in UI | Historical pre-tournament predictions |

### Build Priority

**1. Matchup Market tab** — BUILT (2026-05-08)
- New tab on /pro showing the full live H2H + 3-ball board from `betting-tools/matchups`
- Three sub-views: Tournament Matchups, Round Matchups, 3-Balls
- Model edge column: DataGolf implied probability vs sportsbook line
- Value flag: highlight matchups where model disagrees with the market
- Picks highlighted (any player in pro-picks.json)
- Most actionable for bettors — replaces the manual H2H tool for pre-bet decisions

**2. Approach Skill distance panel**
- Click-to-expand row inside Course Fit table (or player hover card)
- Fetches `preds/approach-skill` — shows SG: App broken into distance buckets
- Genuine differentiator: shows if a player is elite from 150 but weak from 175
- Relevant when a course has a specific "scoring hole" distance

**3. Historical Backtesting dashboard**
- New section or tab: "Model Accuracy"
- Uses `historical-odds/outrights` + `historical-raw/event-results`
- For each course: when model ranked a player top-5 probability, how often did they finish top 5?
- Calibration chart: model probability bins vs actual hit rate
- This is the verification product — makes the track record scientific

**4. Player Trajectory indicators**
- Rising/Falling badge in Course Fit + Value Finder rows
- Compare L12 SG vs L24 SG per category — already computing both for blending
- "Rising" = L12 meaningfully above L24 in the categories this course rewards
- "Falling" = opposite
- No new API calls needed — data already fetched

**5. Historical Model Accuracy tracker**
- `preds/pre-tournament-archive` + `historical-raw/event-results`
- Show: at each venue, how has the top-ranked course-fit player finished historically?
- Validates the course-fit model with real outcomes
- Good Pro explainer content + credibility for subscriber retention

**6. FedExCup + Earnings vs SG analysis**
- `historical-raw/event-results` — earnings + FedExCup pts per player per event
- Correlate with historical SG categories to show which skills drive earnings
- Good article content + Pro educational section
- Example insight: "SG: Approach explains 62% of earnings variance on PGA Tour"

**7. DFS correlation section**
- `historical-dfs` — DK/FD fantasy points per player per slate
- Correlate with SG categories — which stats best predict DFS production
- Useful if adding a DFS angle to Lab Notes Pro

**8. Full Matchup backtesting**
- `historical-odds/matchups` — historical H2H lines
- Compare DataGolf model picks in H2H markets to closing lines and actual results
- Builds the scientific case for H2H picks as the highest-edge bet type

---

## Course-Fit Model — Priority Improvements

The course-fit model is the core differentiator of Divot Lab. Build these in order:

### 1. Historical course-fit accuracy (the proof of concept)
- Does our top fit pick outperform a random pick at each venue over time?
- Use `prediction_archive` + `historical-event-results` to compute: for each completed event, where did our #1 course-fit pick finish? What % finished top 10? top 20?
- Compare against field average finish and DataGolf model #1 pick
- Display as a per-venue accuracy table on the Track Record tab
- This is the scientific validation that justifies the model — critical for influencer/creator marketing

### 2. Custom course weights for all PGA Tour stops
- Currently 40+ venues have custom weights, rest use `_default` (balanced 0.25 each)
- Goal: all 50 PGA Tour regular stops should have custom weights
- Derive weights from `historical-raw/rounds` SG data using `/api/derive-course-weights`
- Add a warning in the UI when default weights are used (already partially done in UI)
- Priority venues without weights: all remaining regular tour stops

### 3. Divot Lab Score — single composite number
- One number per player per week combining: course fit (0-100) + model edge vs market + value score
- Weighted: fit (50%) + edge (30%) + value (20%)
- Show prominently in Course Fit tab, Value Finder, and DFS tab
- Becomes the shareable "marketing number" — "Scheffler has a 94 Divot Lab Score this week"
- Makes the product explainable in one sentence for creators/influencers

### 4. DFS lineup builder elite UX (in progress)
- Click-to-add player flow (not lock/exclude button flow)
- Persistent sidebar lineup panel with salary bar
- Auto-fill, clear, copy functionality
- Wave balance and budget indicators

### 5. DFS historical venue performance
- Use `/api/historical-dfs` to show past DFS scoring at this specific venue
- Average DK/FD points at this course over last 2-3 years
- Differentiates from other DFS tools — nobody shows venue-specific DFS history

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
- **pro-picks.json is the single source of truth** for all Pro picks this week. Drives the "This Week's Card" on /pro and the newsletter HTML. Generated via admin.html Pro Picks tab — never edit manually
- **Admin tool Pro Picks tab workflow**: Wednesday → fill picks → generate pro-picks.json → deploy. Monday → Load Current Values → update result dropdowns → regenerate → deploy

---

## MAINTENANCE LOG

| Date | Task added | Why |
|---|---|---|
| 2026-05-07 | Weekly update of `current-pick.json` | Created picks.html which fetches this file for the free pick landing page |
| 2026-05-07 | Weekly update of `season-tracker.json` | Drives 3 pages (homepage, lab-notes, picks) auto-updating record displays |
| 2026-05-07 | `admin.html` password is `divotlab2026` | Change directly in the file if needed (line ~175, ADMIN_PASSWORD variable) |
| 2026-05-08 | Weekly update of `pro-picks.json` | Drives "This Week's Card" on /pro page; also used to generate Pro newsletter HTML via admin.html Pro Picks tab |
| 2026-05-09 | Free trial system live | Upstash Redis (divotlab-trials) via Vercel KV integration. Env vars: KV_REST_API_URL, KV_REST_API_TOKEN. `POST /api/start-trial` creates 14-day trial (1 per email). `POST /api/verify-pro` now also checks trial status. Trial stored as `trial:{email}` key with 14-day TTL. |
| 2026-05-11 | Truist Championship results updated | Jake Knapp voided (WD sprained thumb, 2nd consecutive sig event WD). Kim LOSS (T65), Spaun WIN (T5), Schauffele LOSS (T60), Lee LOSS (T14). Season: 33 picks, 17 hits, 51.5%, +7.50u, 22.7% ROI, 8 events. |
| 2026-05-18 | PGA Championship results updated | Gotterup WIN (T10 +660 DK), Kitayama WIN (T10 +800 Bet365), Spaun LOSS (CUT), Scott LOSS (CUT). Week net: +12.60u. Season: 37 picks, 19 hits, 51.4%, +20.10u, 54.3% ROI, 9 events. |
| 2026-05-18 | CJ Cup Byron Nelson picks published | Free pick: Blanchet Top 10 +1500 Caesars (+21.5% EV). Pro card: Blanchet Top 10, Hisatsune Top 5, Bauchou Top 5, Peterson Top 10. |
| 2026-05-25 | CJ Cup results updated + Schwab newsletters written | CJ Cup: Kim WIN (T2 +1.45u), Hisatsune/McGreevy/Blanchet LOSS. Net -1.55u. Season: 41 picks, 20 hits, 48.8%, +18.55u, 45.2% ROI, 10 events. Schwab: free pick Putnam T10 FD +850. Pro card (4 picks): Åberg T10 B365 +500 (model #1 fit), Putnam T10 FD +850 (+36.8% EV), Cole T10 FD +1000 (+24.2% EV), Svensson T20 FD +1000 (+40.3% EV). Fade: Clark T10 -22.6% EV. Sleeper: Svensson Win FD +35000 (+24% EV). Colonial weights: App 35%, Putt 24%, ARG 23%, OTT 18%. |
| 2026-06-03 | Memorial Tournament picks published | Free pick: Henley Top 5 FD +430 (+3.4% EV). Pro card (4 picks): Matsuyama H2H over Burns B365 +105 (model -109), Henley H2H over Lee B365 -143 (model -155), Henley Top 5 FD +430, Spaun Top 5 B365 +800 (+4.7% EV). Sleeper (not tracked): Noren Top 10 FD +750 (+10.1% EV). Muirfield weights: App 30%, OTT 25%, ARG 22%, Putt 23%. |
| 2026-06-01 | Charles Schwab Challenge results + Lab Notes recap written | Henley WIN (playoff vs Cole, birdie hole 1). Cole WIN (T2 -12, Top 10 hit +1000 +10.00u). Åberg LOSS (T17), Putnam LOSS (T17, near-zero approach avg), Svensson LOSS (CUT). Week net: +7.00u. Season: 45 picks, 21 hits, 46.7%, +25.55u, 56.8% ROI, 11 events. Lab Notes recap: 2026-06-02-charles-schwab-recap.html. Memorial Tournament preview included (starts June 5). |
| 2026-06-06 | Research brief published | `research/datagolf-model-calibration-audit.html` — Study 01: DataGolf calibration audit. 292 events, 36,656 records, 2020–2026. Email-gated (free via /api/subscribe → localStorage). Figures: `assets/research/calibration_win.png`, `assets/research/calibration_top10.png`. Companion repo: `c:/Users/jmory/Downloads/divotlab-research`. New research briefs follow same pattern: build in research repo, copy HTML + figures, publish at `/research/`. |
| 2026-06-07 | Research index + Study 02 published | `research/index.html` (served at `/research`) — dark-mode card grid linking all studies; Study 03 shown as "Coming Soon". `research/does-datagolf-beat-the-market.html` — Study 02: DataGolf vs. Pinnacle market efficiency. 284 events (win), 75 events (top-10), 2019–2026. Gate key: `divotlab-research-02-unlocked`. Figures: `assets/research/dg_vs_pinnacle_scatter.png`, `market_edge_analysis.png`, `market_movement.png`. All site nav "Research" links + homepage FREE TOOLS card now point to `/research` (index) instead of a specific study. Sitemap updated with all 3 URLs. |
| 2026-06-07 | Study 03 published — series finale | `research/same-number-higher-price.html` — Study 03: "Same Number, Higher Price." Tested 8 sportsbooks (DraftKings, FanDuel, BetMGM, Caesars, PointsBet, Bet365, Unibet, William Hill) vs. Pinnacle/DataGolf. Findings: all books price as accurately as Pinnacle (97%+ agreement) but charge 1.7–2.3x the vig (40–53% vs. Pinnacle's 23%); popularity premium hypothesis runs backwards — star players carry the smallest markup (8–15 ppts below field avg) at every book. Gate key: `divotlab-research-03-unlocked`. Figures: `assets/research/edge_distribution_by_book.png`, `disagreement_accuracy_by_book.png`, `popularity_premium.png`. Closes the 3-part research arc. `research/index.html` Study 03 card promoted from "Coming Soon" to live; Study 02's series-nav "Next" link now points here. Sitemap updated. |
| 2026-06-10 | RBC Canadian Open Lab Picks Pro published | `lab-notes/lab-picks/2026-06-10-rbc-canadian-open-picks.html` — 5 picks, all capped at ≤+1000 odds per standing user directive: Aaron Rai Top 10 DraftKings +430 (DG fair +385, +9.3% EV — positive EV in 3 markets simultaneously), Fitzpatrick over Burns H2H FanDuel -111 (DG implied -120, +3.7% EV), Fleetwood Top 5 FanDuel +340 (+6.1% EV), Bauchou Top 20 DraftKings +490 (+5.3% EV), Cauley Top 5 DraftKings/Bet365 +1000 (DG fair +931, +6.7% EV). Sleeper: Taylor Moore Top 20 FanDuel +500 (+2.9% EV, not tracked in totals). Issue includes 2 bonus non-betting sections (Tournament Preview + Course-Fit Deep Dive) covering TPC Toronto North's debut course-fit weights (ott 0.28/app 0.28/arg 0.20/putt 0.24 — 56% combined OTT+App, highest in the model). `pro-picks.json` updated with the 5 main picks (sleeper excluded, matches schema convention). `current-pick.json` free pick: Rai Top 10 +430 DraftKings, teaser references 4 more picks. |
| 2026-06-14 | /pro Value Finder + Matchups live-data fixes (Phase 1A) | `/api/betting-odds` and `/api/matchup-odds` cache TTL `1800s → 600s`, with corrected comments — books keep live odds during play, but `datagolf.baseline_history_fit` is a pre-tournament baseline, not live. DataGolf's own refresh cadence for these feeds is unknown, so the TTL cut was kept modest (not 180s) to protect the 45 req/min budget. The actual "live" feel for Value Finder comes from merging `/preds/in-play` (`/api/live-tournament`, 60s cache) for in-round model probabilities via `isLiveRound()` + `liveProbMap` — not from hammering the odds endpoint. pro.html now runs two independent poll loops: ~90s (live in-play probs only, re-renders Value Finder with a "live" tag + `dgProbPct`) and ~10min (full odds refetch, matches new cache TTL, drives "Odds updated Xm ago" + line-movement badges). Matchups tab gets its own ~10min `pollMatchupRefresh()` while active. |
| 2026-06-14 | /pro referral attribution system added (Phase 1B) | Tracking-only infrastructure for creator partner payouts (manual monthly review, not automated). `/pro?ref=CODE` is captured first-touch into `localStorage['divotlab-referral-code']` via `captureReferralCode()`, sent as `referral_code` on `/api/start-trial`. Server stores `referredBy` on the trial record and appends `{email, started}` to KV list `referrals:{code}` via new `kvListAppend`/`kvListRange` helpers (Upstash `RPUSH`/`LRANGE`). New admin-only `GET /api/referral-stats?code=X` (via existing `requireAdmin`/`ADMIN_SECRET`) returns signups for a code. admin.html has a new "Referrals" nav section/tab to look these up for monthly payout decisions. |
| 2026-06-14 | /pro Phase 2/3 roadmap noted | Phase 1 (this entry + the two above) was backend + targeted pro.html data/freshness changes only — no visual or IA redesign. Next roadmap items: **Phase 2** — full `/pro` structure/layout/UI/UX redesign, to be planned and prototyped separately in `pro-sandbox.html`. **Phase 3** — creator partner outreach materials (pitch deck/DM templates offering free Pro access + referral payouts, building on the Phase 1B tracking). Neither has been started. |
| 2026-06-16 | RBC Canadian Open results updated + Lab Notes published | Cauley WIN (won outright at -17, his first PGA Tour title — Top 5 pick at +1000, +10.00u, biggest single result of the season). Fitzpatrick WIN (H2H over Burns, FanDuel -111, +0.90u). Rai LOSS (CUT), Bauchou LOSS (CUT), Fleetwood LOSS (T11). Sleeper Taylor Moore (Top 20 +500) LOSS (T40, not counted). Week net +7.90u. Season: 54 picks, 24 hits, 44.4%, +31.15u, 57.7% ROI, 13 events. `current-pick.json` and `pro-picks.json` results filled in; `season-tracker.json` totals updated and RBC weekly_picks entry appended. Lab Notes issue `lab-notes/issues/2026-06-16-rbc-recap-us-open-preview.html` published — first-ever use of `rotating/season-storyline.html` (Scheffler's 2026 DG Points race / win drought) and `rotating/course-history.html` (Shinnecock Hills 2004 vs. 2018, sourced from a user-provided DataGolf newsletter) alongside `seasonal/major-preview.html` for the U.S. Open at Shinnecock Hills (Jun 18–21). Note: Shinnecock has no entry in `COURSE_WEIGHTS` (US Open rotates venues yearly) — major preview deliberately omits course-fit scores/contenders table and uses DataGolf's historical course-difficulty stats instead. |
| 2026-06-15 | /pro Phase 2 cutover — live (Phase 2.1/2.2/2.5) | `pro-sandbox.html` content (5-tab IA: Overview/Analysis/Betting/DFS/Track Record, `.dl-card` design system, Course Fit mobile cards + Player Detail Drawer with Compare/Recent Results/Course History, redesigned Track Record with Lab Picks season record + model calibration cards) replaced `pro.html` directly (commit `a849027`). Before the swap, Phase 1A/1B (live-data freshness: `vf-freshness`, `liveProbMap`, `isLiveRound`, `pollLiveProbsRefresh`/`pollMatchupRefresh`, `computeEdgeFields`; referral attribution: `captureReferralCode`/`referral_code`) — shipped to production `pro.html` in commit `6a755de` but absent from `pro-sandbox.html` — was ported in via a 3-way `git merge-file` (base = pre-Phase-1 `pro.html`, ours = `pro-sandbox.html`, theirs = Phase-1 `pro.html`) so nothing regressed. Standalone H2H tab (`#tab-h2h`/`runH2H`) removed; logic now lives in `buildH2HComparison()` used by the drawer's Compare picker. `pro-sandbox.html` updated to match (stays gitignored, in sync for future work). **Remaining roadmap**: Phase 2.3 (Betting/Value Finder + Matchups redesign) and Phase 2.4 (DFS redesign) — not started, to be done directly in `pro.html` going forward. |
| 2026-06-15 | /pro Phase 2.3 + 2.4 — Betting & DFS mobile card redesign | Value Finder (`.vf-row`), Matchups (`.mu-row`/`.mu3-row`), and DFS (`.dfs-row`) now use the same CSS-only `grid-template-areas` stacked-card mobile reflow as Course Fit (Phase 2.2) instead of dropping 4-6 of 7-9 columns on mobile — all data points now visible on phone, just rearranged via `nth-child` grid-area mapping (no JS duplication). Added `[data-label]::before` mini column-labels (mono/8px/uppercase/dim, + light-theme variant) on previously self-explanatory-only cells. `renderValueFinder()`'s `vfDynStyle` injection scoped to `@media(min-width:901px)` only (was fighting the static mobile CSS with its own `!important` override). `playerCell()` now sets `data-player` on `.mu-player` (+ `cursor:pointer`) and the global drawer click-delegation gained a `.mu-player[data-player]` branch — clicking either player name in a Matchup row (desktop or mobile) now opens the Player Detail Drawer, same as Course Fit/Value Finder. DFS row click (`clickDfsRow`, lineup add/remove, salary cap, `in-lineup`/`over-budget` styling) untouched — `.dfs-sel-circle` just hidden on mobile. All changes confined to `pro.html`; `pro-sandbox.html` not updated (Phase 2.3/2.4 work happens directly in `pro.html` per the prior entry). |
| 2026-06-18 | U.S. Open Lab Picks Pro published | `lab-notes/lab-picks/2026-06-18-us-open-picks.html` — 5 picks built on course-fit first, then form, then EV. Course model has Shinnecock weights (App 38%, ARG 26%, OTT 18%, Putt 18%). All 5 picks rank top-25 in the field on course fit. No H2H picks (no clean EV at accessible US books). Picks: Fleetwood Top 5 DK +500 (+1.5% EV, fit 76, free pick), Kim Si Woo Top 5 DK +740 (+0.7% EV, fit 77, T2 CJ Cup), Hovland Top 10 DK +530 (+2.3% EV, fit 67), Cantlay Top 10 FD +470 (-2.5% EV, fit 73, conviction play), Lee Min Woo Top 10 DK +630 (+2.3% EV, fit 64). Sleeper (not tracked): Cauley Top 5 DK +1800 (+4.3% EV, just won RBC). `pro-picks.json` and `current-pick.json` updated. Season tracker going in: 54 picks, 24 hits, 44.4%, +31.15u, 57.7% ROI, 13 events. |
