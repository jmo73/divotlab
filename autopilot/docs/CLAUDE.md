# Divot Lab — Autopilot System
## Master Reference for Claude Code

---

## What This System Does

Autopilot is a content automation pipeline built into the existing Divot Lab Next.js monorepo (`divotlab.com`). It:

1. Detects live PGA Tour tournaments and round status via the DataGolf API
2. Fetches weather conditions via Tomorrow.io API
3. Enriches raw data with context — field averages, course history, player trends, conditions analysis
4. Selects content triggers on a defined schedule
5. Generates stat card and graphic images using static SVG templates with dynamic data overlay
6. Writes captions using the Claude API tuned to Divot Lab brand voice
7. Sends a Telegram message to Jake with image preview, full captions, and Approve / Edit / Skip buttons
8. Supports inline caption editing via Telegram — Jake types a correction, Claude regenerates, new preview sent
9. On approval, posts simultaneously to X (Twitter) and Instagram
10. Logs every post attempt, approval, edit, and result to Postgres

**Target cadence:** 2–3 Instagram posts per week, ~10 X posts per week. Mix of tournament-timed and evergreen content.

---

## Monorepo Structure

All new code lives in `autopilot/`. Nothing modifies existing pages or APIs unless explicitly noted.

```
divotlab.com/
├── app/                          # Existing Next.js app router
├── components/                   # Existing components
├── lib/                          # Existing lib utilities
│
├── autopilot/                    # ← ALL NEW CODE LIVES HERE
│   ├── docs/                     # All planning docs (this file + 9 others)
│   ├── templates/
│   │   ├── leaderboard.svg
│   │   ├── player-stat.svg
│   │   ├── model-pick.svg
│   │   ├── cut-line.svg
│   │   ├── evergreen-fact.svg
│   │   ├── quote-insight.svg     # Bold text-forward insight graphic
│   │   ├── comparison.svg        # Head-to-head two player graphic
│   │   ├── course-breakdown.svg  # Course profile graphic
│   │   └── weather-card.svg      # Pre-tournament conditions graphic
│   ├── lib/
│   │   ├── types.ts              # All TypeScript types and enums
│   │   ├── config.ts             # Env validation and config object
│   │   ├── db.ts                 # Postgres query functions for autopilot tables
│   │   ├── datagolf.ts           # DataGolf API client (extends server.js logic)
│   │   ├── weather.ts            # Tomorrow.io API client
│   │   ├── enrichment.ts         # Context enrichment layer (combines all data sources)
│   │   ├── claude.ts             # Caption generation and regeneration
│   │   ├── imageGen.ts           # SVG template renderer → PNG via Sharp
│   │   ├── telegram.ts           # Telegram Bot API client
│   │   ├── twitter.ts            # X API v2 posting client
│   │   ├── instagram.ts          # Instagram Graph API posting client
│   │   ├── scheduler.ts          # Trigger selection and schedule logic
│   │   ├── queue.ts              # Post queue manager and posting orchestration
│   │   └── logger.ts             # Structured logging to Postgres
│   └── scripts/
│       ├── test-trigger.ts       # Manually fire a trigger (--dry-run, --queue, --post flags)
│       ├── test-image.ts         # Generate test images for all templates
│       ├── test-telegram.ts      # Send a test approval message to Telegram
│       ├── test-weather.ts       # Test Tomorrow.io for a given course
│       ├── test-enrichment.ts    # Test context enrichment for a given trigger
│       └── seed-evergreen.ts     # Seed and manage the evergreen content bank
│
├── app/api/autopilot/
│   ├── cron/route.ts             # Vercel Cron endpoint
│   ├── telegram/
│   │   └── webhook/route.ts      # Telegram webhook — receives button taps and messages
│   └── status/route.ts           # Dashboard data endpoint (protected)
│
└── app/autopilot/
    └── page.tsx                  # Protected status dashboard
```

---

## Technology Stack

| Concern | Tool | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Existing |
| Hosting | Vercel | Existing |
| Cron | Vercel Cron Jobs | Pro plan for 30-min interval |
| Database | Postgres (existing) | New tables prefixed `autopilot_` only |
| Image generation | Sharp + SVG templates | No headless browser |
| Caption generation | Claude API (claude-sonnet-4-6) | Existing key |
| Caption editing | Claude API (same) | Regeneration with edit instruction |
| Approval interface | Telegram Bot API | Free, no per-message cost |
| Weather data | Tomorrow.io API | Free tier (500 calls/day) |
| X posting | X API v2 | Free tier: 1,500 tweets/month |
| Instagram posting | Instagram Graph API | Requires Facebook Business account |
| Image storage | Vercel Blob | Temporary — deleted after 48hrs |
| DataGolf | Existing API client | Extended in `autopilot/lib/datagolf.ts` |

---

## Critical Rules for Claude Code

Read these before writing any code.

1. **Never modify existing database tables.** Add only new tables prefixed `autopilot_`.
2. **Never modify existing API routes** — add new files only.
3. **Never modify `server.js`** — extend DataGolf logic in `autopilot/lib/datagolf.ts`.
4. **All env vars** must be in `ENVIRONMENT.md` before use.
5. **Every post attempt must be logged** to `autopilot_post_log` before any API call.
6. **No post goes live without an approved Telegram callback.** The approval gate is non-negotiable.
7. **Image generation must not use Playwright or a headless browser.** Sharp + SVG only.
8. **All TypeScript.** No plain JS files in the autopilot directory.
9. **All API clients must handle rate limits gracefully** — catch 429s, log, do not retry immediately.
10. **Never republish raw DataGolf API data verbatim** — always derived/transformed per DataGolf commercial use policy.
11. **Edit flow must store original data and context in the queue** so regeneration never re-fetches.
12. **Telegram webhook must always return 200** — Telegram disables webhooks that return errors repeatedly.
13. **Read CONTENT_QUALITY.md before writing any caption prompt or enrichment logic.** Content quality is the point of the system.

---

## Read Order for Claude Code

At the start of every session:

1. `CLAUDE.md` (this file) — always first
2. `ARCHITECTURE.md` — full data flow
3. `CONTENT_QUALITY.md` — what makes posts good (read before any caption or enrichment work)
4. `DATABASE.md` — schema before touching any data layer
5. `ENVIRONMENT.md` — confirm all env vars exist
6. `BUILD_ORDER.md` — which phase to work on

Then the specific doc for the component being built.

---

## Brand Voice Summary

Full detail in `CAPTIONS.md`. Short version:

- Data-first, no exclamation points
- Short punchy sentences
- Never hype — let numbers speak
- Every number needs a comparison or interpretation
- Premium analytical tone — Bloomberg for golf, not ESPN
- Always cite DataGolf for derived metrics
- Weather is analytical context, not small talk

---

## Accounts and Keys

- **DataGolf API**: `DATAGOLF_API_KEY` (existing)
- **Anthropic API**: `ANTHROPIC_API_KEY` (existing)
- **Instagram**: @divotlab — must be Professional account connected to Facebook Page
- **X**: @divotlabgolf — must have Developer account with Read/Write permissions
- **Telegram**: Bot created via @BotFather — see `APPROVAL.md` for setup
- **Tomorrow.io**: Free account at tomorrow.io — see `ENVIRONMENT.md`
- **Vercel Blob**: Enable in Vercel dashboard under Storage
