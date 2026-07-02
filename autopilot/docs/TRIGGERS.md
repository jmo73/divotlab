# Triggers — Divot Lab Autopilot

## Overview

A trigger is a defined content moment. Every trigger has a unique `trigger_type`, a firing condition, a data payload, a template, platform targets, and a cadence constraint.

---

## Event Tier System

Every tournament is assigned a tier. Tier affects caption tone and post priority.

```typescript
type EventTier = 'major' | 'signature' | 'standard'

const EVENT_TIERS: Record<string, EventTier> = {
  'masters': 'major',
  'us-open': 'major',
  'the-open': 'major',
  'pga-championship': 'major',
  'players': 'signature',
  'genesis-invitational': 'signature',
  'arnold-palmer-invitational': 'signature',
  // all others default to 'standard'
}
```

Caption prompts receive the tier and adjust accordingly. Majors get more historical weight and gravitas. Standard events are analytical but not elevated.

---

## Category A: Tournament — Live Round Triggers

*Fire during active rounds. Cron checks every 30 min Thu–Sun.*

---

### `live_leaderboard_r1_end`
**When:** Round 1 status flips from `in_progress` → `complete`
**Platforms:** Both
**Template:** `leaderboard.svg` (or `quote-insight.svg` if `modelSurprise` flag is true)
**Cadence:** Once per tournament

**Data payload:**
```typescript
{
  eventName: string
  courseName: string
  eventTier: EventTier
  round: 1
  top5: Array<{
    position: number
    playerName: string
    score: number           // relative to par
    sg_total: number        // DataGolf SG: Total for the round
    dg_rating: number
    dgRatingPercentile: number
  }>
  fieldAvgScore: number     // field average score vs par today
  historicalCourseAvg: number
  modelTopPick: { playerName: string, currentPosition: number }
  weather: WeatherContext
  insightFlags: InsightFlags
}
```

---

### `live_leaderboard_r2_end`
**When:** Round 2 complete
**Platforms:** Both
**Template:** `leaderboard.svg`
**Cadence:** Once per tournament

**Data payload:** R1 payload plus:
```typescript
{
  cutLine: number
  cutBubblePlayers: Array<{ playerName: string, score: number }>
  notableOMC: Array<{ playerName: string, dg_rating: number }>
  weekendContenders: Array<{ playerName: string, score: number, courseFitScore: number }>
}
```

---

### `live_leaderboard_r3_end`
**When:** Round 3 complete
**Platforms:** Both
**Template:** `leaderboard.svg`
**Cadence:** Once per tournament

**Data payload:** Standard leaderboard plus:
```typescript
{
  leader: { playerName: string, score: number, dgPredictedR4: number }
  chaserDeficits: Array<{ playerName: string, deficit: number, courseFitScore: number }>
  weather: WeatherContext    // Sunday forecast, not Saturday's conditions
}
```

---

### `live_leaderboard_final`
**When:** Round 4 complete
**Platforms:** Both
**Template:** `leaderboard.svg` or `quote-insight.svg` (if model was notably right or wrong)
**Cadence:** Once per tournament

**Data payload:**
```typescript
{
  eventName: string
  eventTier: EventTier
  winner: {
    playerName: string
    finalScore: number
    sg_total_tournament: number
    dg_rating: number
  }
  modelTopPick: { playerName: string, finalPosition: number }
  modelCorrect: boolean
  fieldAvgScore: number     // tournament-wide vs course historical avg
}
```

---

### `mid_round_mover`
**When:** A player moves 5+ positions in the current round (checked every 30 min)
**Platforms:** X only
**Template:** `player-stat.svg`
**Cadence:** Max once per player per round, max 2 per round total

**Data payload:**
```typescript
{
  playerName: string
  positionStart: number
  positionNow: number
  roundScore: number
  sg_approach_round: number   // if available from DataGolf live
  sg_putting_round: number    // if available
  dg_rating: number
  dgRatingPercentile: number
  courseHistoryAvgFinish: number
  weather: WeatherContext
}
```

---

### `cut_bubble_alert`
**When:** R2, within 3 hours of projected round end, 5+ notable players within 1 shot of cut line
**Platforms:** X only
**Template:** `cut-line.svg`
**Cadence:** Once per tournament

---

### `weather_angle`
**When:** Tomorrow.io forecast shows `conditionsFlag: 'difficult'` or `'severe'` for any upcoming round
**Platforms:** Both
**Template:** `weather-card.svg`
**Cadence:** Once per round (only fires if conditions genuinely notable — wind >20mph or precip >60%)
**Timing:** Fires pre-round, not during

**Data payload:**
```typescript
{
  eventName: string
  courseName: string
  roundNumber: number
  roundDate: string
  weather: WeatherContext     // full conditions detail
  historicalAvgScore: number  // what field typically shoots at this course
  expectedScoreImpact: string // Claude-generated: "expect scoring to rise 2-3 shots"
  playersWhoExcelInWind: Array<{ playerName: string, windConditionRecord: string }>
}
```

**Why this trigger matters:** Conditions posts perform well because they're timely, analytical, and unique to Divot Lab — nobody else is doing conditions-adjusted scoring context in golf content.

---

### `comparison_spotlight`
**When:** After R1 or R2, two high-profile players with contrasting performances worth comparing
**Platforms:** Both (Instagram especially — comparison graphic is highly shareable)
**Template:** `comparison.svg`
**Cadence:** Once per tournament (R1 or R2 only — not both)

**Selection logic:** Find two players where:
- Both are in top 30 by DG rating
- Their round scores differ by 4+ strokes
- OR they're in the same DG rating tier but opposite ends of the leaderboard

**Data payload:**
```typescript
{
  eventName: string
  round: number
  playerA: {
    name: string
    score: number
    position: number
    dg_rating: number
    sg_total_round: number
    sg_approach_round: number
    sg_putting_round: number
  }
  playerB: {  // same structure }
  comparisonAngle: string  // enrichment layer generates: "same DG rating, 6-shot gap after R1"
  weather: WeatherContext
}
```

---

## Category B: Tournament — Pre/Post Round Triggers

---

### `pre_tournament_model_picks`
**When:** Wednesday evening or Thursday morning before R1
**Platforms:** Both
**Template:** `model-pick.svg`
**Cadence:** Once per tournament

**Data payload:**
```typescript
{
  eventName: string
  courseName: string
  eventTier: EventTier
  modelTop3: Array<{
    playerName: string
    dg_rating: number
    courseFitScore: number
    winProbability: number
    keyStrength: string      // "elite iron play fits Augusta's long approaches"
  }>
  darkHorse: {
    playerName: string
    dg_rating: number
    courseFitScore: number
    reason: string
  }
  weather: WeatherContext    // tournament week forecast summary
  fieldStrengthRank: number
}
```

---

### `post_round_sleeper`
**When:** After R1 or R2 — player outside top 15 with strong DataGolf metrics
**Platforms:** Both
**Template:** `player-stat.svg`
**Cadence:** Once per round (R1 and R2 only)

**Selection logic:**
- Position 16–40
- DG rating in top 20% of field
- Course fit score above field median
- Rounds remaining give mathematical chance to contend

---

## Category C: Evergreen Triggers

*Fire Mon–Wed. Pre-seeded content bank. Minimum 40 active items.*

---

### `evergreen_sg_explainer`
**8-post series** — one per SG category plus synthesis posts:
1. What is Strokes Gained (intro)
2. SG: Off the Tee — what it measures and why it's overrated
3. SG: Approach — why this wins on tour more than any other category
4. SG: Around the Green — the most underrated category
5. SG: Putting — the most volatile and least predictive
6. SG: Tee to Green — the composite that predicts scoring best
7. How to read a SG stat card without being misled
8. What separates +150 DG ratings from +120 ratings

**Template:** `evergreen-fact.svg`
**Platforms:** Both

---

### `evergreen_course_profile`
**8 courses minimum:**
Augusta National, Pebble Beach, TPC Sawgrass, St Andrews (Old Course), Riviera CC, Muirfield Village, Bethpage Black, Torrey Pines South

**Each profile includes:**
- Par and yardage
- What SG category the course most rewards
- Historical scoring average vs tour average
- One surprising historical data point
- Key stat that defines the venue

**Template:** `course-breakdown.svg`
**Platforms:** Both

---

### `evergreen_player_spotlight`
**8 players minimum** — top 8 by current DG rating at seed time

**Each spotlight includes:**
- Current DG rating and world rank
- Their strongest and weakest SG category
- Best and worst course types for their game
- One surprising stat about their profile

**Template:** `player-stat.svg`
**Platforms:** Both

---

### `evergreen_myth_bust`
**8 topics:**
1. Driving distance matters less than you think (SG: OTT data)
2. Putting is the most overrated discussion in golf media (volatility data)
3. The best ball strikers don't always win (why approach + putting matters)
4. Equipment changes rarely explain performance shifts (SG before/after data)
5. Course difficulty is mostly about approach distance, not length
6. Momentum streaks in golf are statistically noise
7. The rough penalty at majors is overstated (data from US Opens)
8. Amateur golfers lose more strokes than they think on approach, not driving

**Template:** `quote-insight.svg` (text-forward, bold claim)
**Platforms:** Both

---

### `evergreen_stat_of_week`
**8 standalone stats** — short format, X only, no image:
1. Tour average SG: Approach for winners vs missed cuts
2. The score correlation between R1 and R2 (lower than people think)
3. How often the 54-hole leader wins (lower than people think)
4. Average driving distance on tour vs 10 years ago
5. What percentage of tour players gain strokes putting (lower than expected)
6. The make percentage from 10 feet on tour (lower than expected)
7. How many tour events are won by wire-to-wire leaders
8. Average strokes gained by world ranking tier

**Template:** None — text-only post on X
**Platforms:** X only

---

## Trigger Priority Order

When multiple triggers are eligible in one cron run, pick the highest priority:

```
1. live_leaderboard_final
2. live_leaderboard_r3_end
3. live_leaderboard_r2_end
4. live_leaderboard_r1_end
5. weather_angle                  ← elevated above pre-tournament picks if conditions severe
6. pre_tournament_model_picks
7. post_round_sleeper
8. comparison_spotlight
9. cut_bubble_alert
10. mid_round_mover
11. evergreen_*                   ← only if no tournament trigger fires
```

One trigger per cron run. Scheduler exits after selecting and queuing one post.

---

## Weekly Cadence Target

| Day | Trigger source | Expected posts |
|---|---|---|
| Monday | Evergreen | 1–2 X (stat_of_week) |
| Tuesday | Evergreen | 1 IG + 1–2 X (course profile or player spotlight) |
| Wednesday | Evergreen + pre-tournament | 1–2 X (myth bust) + model picks if tourney starts Thu |
| Thursday | Tournament R1 | 1 IG + 2–3 X (R1 end + mid-round movers) |
| Friday | Tournament R2 | 1 IG + 2–3 X (R2 end + cut bubble + sleeper) |
| Saturday | Tournament R3 | 1 IG + 1–2 X (R3 end + comparison or weather) |
| Sunday | Tournament Final | 1 IG + 1–2 X (final result + model accountability) |

**Weekly total:** ~3 Instagram, 10–12 X.

---

## Adding New Triggers

1. Define in this file with full data payload spec
2. Add `trigger_type` to `TriggerType` union in `autopilot/lib/types.ts`
3. Add DataGolf fetch logic in `autopilot/lib/datagolf.ts`
4. Add enrichment logic in `autopilot/lib/enrichment.ts`
5. Add template mapping in `autopilot/lib/imageGen.ts`
6. Add caption prompt in `autopilot/lib/claude.ts`
7. Add to priority order above
8. Test: `npx tsx autopilot/scripts/test-trigger.ts --trigger=new_trigger --dry-run`
