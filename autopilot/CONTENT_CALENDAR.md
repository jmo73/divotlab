# Divot Lab Autopilot — Content Calendar

Every post goes through Telegram approval before publishing.

**Auto** = cron fires it, no action needed from you.
**Manual trigger** = run the script after you update the JSON file. These depend on data you enter manually (picks, results) so they can't be scheduled blindly. The script fails fast with a clear error if the data is stale.

---

## How Approval Works (All Posts)

Regardless of whether a script runs automatically (cron) or you trigger it manually:
1. Telegram sends you a message with the card preview + approve/skip buttons
2. You tap **approve from your phone** (no laptop needed — Vercel handles the posting)
3. It posts to X and/or Instagram via the `/api/autopilot/telegram/webhook` Vercel endpoint

**Manual trigger** = you need to run the script first (after updating a JSON file).
**Auto** = Vercel cron fires the script on schedule. You just wait for the Telegram message.

---

## Weekly Schedule

| Day | UTC cron | Post type | Format | Script | Status |
|-----|----------|-----------|--------|--------|--------|
| Mon | manual | Results recap | Text only, X | `post-monday-recap.ts` | ✅ DONE · **manual trigger** after updating season-tracker.json |
| Tue | 19:00 | Model preview (2 tweets) | Text only, X | `post-tuesday-model.ts` | ✅ DONE · **auto cron** |
| Wed | manual | Free pick reveal | Image + link, X + IG | `post-wednesday-picks.ts` | ✅ DONE · **manual trigger** after updating current-pick.json |
| Thu | 18:00 | Course stat (2 tweets) | Text only, X | `post-thursday-course-stat.ts` | ✅ DONE · **auto cron** |
| Thu | manual | Stat leaders card | Image, X + IG | `test-stat-post.ts` | ✅ DONE · run manually |
| Thu | — | Course profile card | Image, X + IG | `post-course-profile.ts` | 🔴 TODO |
| Fri | auto | R1 leaderboard card | Image, X + IG | cronHandler | 🟡 EXISTS (needs Postgres) |
| Fri | — | Win prob leaders (text) | Text only, X | `post-win-prob-text.ts` | 🔴 TODO |
| Sat | auto | R2 leaderboard | Image, X + IG | cronHandler | 🟡 EXISTS (needs Postgres) |
| Sat | auto | Cut bubble alert | Image, X | cronHandler | 🟡 EXISTS (needs Postgres) |
| Sat | auto | Mid-round mover (text) | Text only, X | cronHandler | 🟡 EXISTS (needs Postgres) |
| Sun | auto | R3 leaderboard | Image, X + IG | cronHandler | 🟡 EXISTS (needs Postgres) |
| Sun | — | Win prob update (text) | Text only, X | `post-win-prob-text.ts` | 🔴 TODO |
| Sun | auto | Tournament winner | Image, X + IG | cronHandler | 🟡 EXISTS (needs Postgres) |

---

## Post Types — Spec

### ✅ Stat Leaders card (`test-stat-post.ts`)
**Template**: `stat-leaders.html`
**Data**: course weights → dominant stat → top 3 field leaders by that SG category
**When**: Thursday before tournament starts
**X format**: With image
**IG**: Yes (JPEG via Blob)

---

### 🔴 Pick Reveal (`post-pick-reveal.ts`)
**Template**: `pick-result.html` (repurposed) or new `pick-reveal.html`
**Data**: `current-pick.json` — player, bet type, odds, book, confidence, reasoning
**When**: Wednesday manual trigger
**X format**: Image + link to divotlab.com/picks
**IG**: Yes
**Tweet example**:
> "Our free pick this week: [Player] Top 10 at +350 DraftKings. Course fit: 88/100. Full card at divotlab.com/picks"

---

### 🔴 Model Preview — Text (`post-model-preview-text.ts`)
**Template**: None (text only)
**Data**: pre-tournament predictions — top player win%, second player win%
**When**: Thursday morning
**X format**: Text only, no image
**Tweet example**:
> "Model has [Player] at 18.4% win probability at the [Event]. Next closest: [Player] at 6.1%. The gap is wider than usual."

---

### 🔴 Course Stat — Text (`post-course-stat-text.ts`)
**Template**: None (text only)
**Data**: course weights from `getCourseFit()`
**When**: Thursday morning (before or after stat leaders card)
**X format**: Text only
**Tweet example**:
> "SG: Putting accounts for 32% of our TPC River Highlands course-fit model — highest of any category. The best putters here win. That's not an opinion, it's the last 10 years of data."

---

### 🔴 Live Win Prob — Text (`post-win-prob-text.ts`)
**Template**: None (text only)
**Data**: `getInPlayProbabilities()` — top 3 by win%
**When**: Sunday R4 (live), manual trigger or cron
**X format**: Text only
**Tweet example**:
> "[Player] at 67.3% win probability through 54 holes. [Player] is still alive at 14.2%. Model is locked in."

---

### 🔴 Results Recap — Text (`post-results-recap.ts`)
**Template**: None (text only)
**Data**: `pro-picks.json` + `season-tracker.json`
**When**: Monday after tournament
**X format**: Text only
**Tweet example**:
> "2-for-5 last week. [Player] Top 10 WIN (+350), [Player] H2H WIN (-111). Season: 44% hit rate, +21.1u, 8 events."

---

### 🔴 Course Profile card (`post-course-profile.ts`)
**Template**: `course-profile.html`
**Data**: course weights + event name
**When**: Thursday morning
**X + IG**: Yes (image)

---

## Templates — Status

| Template | Script exists | publisher.ts wired | IG support |
|----------|--------------|-------------------|------------|
| `stat-leaders.html` | ✅ test-stat-post.ts | ✅ | ✅ |
| `model-picks.html` | 🔴 need script | 🔴 | 🔴 |
| `leaderboard.html` | 🟡 test-post-real.ts | 🔴 | 🔴 |
| `cut-alert.html` | 🟡 test-post-real.ts | 🔴 | 🔴 |
| `course-profile.html` | 🔴 need script | 🔴 | 🔴 |
| `pick-result.html` | 🔴 need script | 🔴 | 🔴 |
| `player-spotlight.html` | 🔴 need script | 🔴 | 🔴 |
| `weather-card.html` | 🔴 need script | 🔴 | 🔴 |

---

## Next Build Order (suggested)

1. **`post-pick-reveal.ts`** — highest weekly impact, runs every Wednesday
2. **`post-model-preview-text.ts`** — text-only Thursday tweet, zero infrastructure needed
3. **`post-course-stat-text.ts`** — text-only, fast to write, great Twitter content
4. **`post-course-profile.ts`** — wires `course-profile.html` with real data
5. **`post-results-recap.ts`** — Monday text post from pro-picks.json results
6. Wire `publisher.ts` into `cronHandler.ts` so auto triggers post to both X + IG
7. New templates: `pick-reveal.html`, `model-picks-v2.html`

---

## Twitter Post Rules (per CONTENT_STRATEGY.md)

- **With image**: Lead with the card, tweet is 1–2 sentences, factual, understated
- **Text only**: Can be longer (2–3 sentences), still specific + numbered
- **With link**: Links go at end, on their own line. Never mid-sentence.
  - Pick reveal → `divotlab.com/picks`
  - Pro preview → `divotlab.com/pro`
  - Research → `divotlab.com/research`
- **Never**: hype language, question hooks, engagement bait
- **Always**: specific numbers, The Athletic tone
