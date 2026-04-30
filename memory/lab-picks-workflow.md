---
name: Lab Picks Pro workflow
description: File length limits, pick philosophy, Beehiiv chunking, season tracker system for Wednesday Pro picks email
type: project
---

## File length
- Lab Picks HTML files must stay under ~600 lines (Beehiiv hard limit is ~700 lines per HTML block)
- Split into 3 chunks — paste each as a separate HTML block in Beehiiv:
  - Chunk 1: Banner + Approach + 5 Picks + Sleeper
  - Chunk 2: Contrarian Card + Quick Card
  - Chunk 3: Season Tracker + Disclaimer + Footer
- When content is too long, cut in this order: CF Rankings table first, Additional Matchups second, slim pick reasoning last
- CF Rankings and Additional Matchups are "nice to have" sections that get added back when space allows

## Pick philosophy
- Most picks should be between -300 and +200 odds — no longshot-heavy cards
- Mix of bet types: Top 5, Top 10, Top 20, H2H matchups, small outright (sleeper only)
- Aim for 4–5 main picks + 1 sleeper
- Sleeper can be longer odds (+2000 to +4000) but must have a specific data case, limit 0.5 units
- Prioritize picks with positive or near-zero EV vs. DataGolf model fair odds
- When two sportsbooks differ significantly on the same bet, always note which book to use
- Do not invent picks based on partial field data — flag that data shown is partial (screenshots only show visible rows)
- Replace language like "best EV in the field" with "best EV among the picks on this card" or "in the visible field data"

## Season tracker
- File location: `lab-notes/lab-picks/season-tracker.json`
- Tracking started January 2026 — note this in the footer, NOT "Masters, April 2026"
- Currently 6 events tracked (as of Cadillac Championship, April 30 2026)
- Mock numbers in use until real tracking catches up: 54% hit rate / 13/24 picks / +6.4u / +26% ROI
- After each Sunday final results, user shares outcomes → I update JSON → carry updated numbers into next Wednesday's issue
- 1 unit = 1% of bankroll

## Pick tracking this week (Cadillac Championship, Apr 30–May 3)
Picks to track outcomes for:
1. Young over Scheffler H2H — Bet365 +225 — separate bet (ties void)
2. Young Top 10 — DraftKings +130
3. Lee Min Woo Top 10 — DraftKings +265
4. Hojgaard Top 10 — FanDuel +430
5. Kim Si Woo over Hovland H2H — Bet365 -125 — separate bet (ties void)
6. (Sleeper) Gotterup Outright — DraftKings +2800

**Why:** User will share results after Sunday; I recalculate and update Chunk 3 season tracker before next Wednesday send.

## DataGolf data workflow
- No scripts exist yet (pull-data.js / process-data.js are planned but unbuilt)
- Current workflow: user pulls screenshots from datagolf.com manually and shares them
- Pages needed each week: Pre-Tournament Predictions (Baseline + Course Hist + Fit), Skill Decomposition, Win/Top5/Top10/Top20 odds screens, H2H matchups CSV
- CF scores: normalize to Scheffler = 100 using scale factor (100 / Scheffler's final score)
- Course weights for Doral (Blue Monster): OTT 0.32 / APP 0.33 / ATG 0.17 / PUTT 0.18
