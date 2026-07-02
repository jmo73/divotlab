# Content Quality — Divot Lab Autopilot

## Purpose

This document defines what separates a good Divot Lab post from a generic golf bot post. Every component of the pipeline — data fetching, context enrichment, caption generation, template selection — should be evaluated against the standard defined here.

The system must produce content that a knowledgeable golf analyst would be comfortable putting their name on. Not just accurate, but genuinely interesting.

---

## The Core Standard

A post passes quality if it answers at least one of these questions with real data:

1. **Why does this matter?** — Not just "Player X leads" but why their position is significant given their DataGolf rating, course history, or conditions
2. **What's surprising here?** — A stat that cuts against expectations. A high-rated player struggling. A low-rated player overperforming. Conditions that explain an anomaly.
3. **What should I watch?** — A forward-looking angle. Who has the course fit to make a move. What the model thinks happens next.
4. **What does this mean relative to something?** — A number in isolation is weak. A number relative to field average, historical tournament average, or the player's own baseline is interesting.

A post fails quality if it only states what happened without analytical context. "Player X shot 65 and leads at -8" is a scoreboard, not a Divot Lab post.

---

## Context Enrichment Layer

Before any caption is generated, the system assembles a **context object** — a structured set of enriched data that goes to the Claude API alongside the raw trigger data. This is what makes captions analytical rather than descriptive.

### Context Object Structure

```typescript
interface PostContext {
  // Tournament context
  tournament: {
    name: string
    course: string
    tier: 'major' | 'signature' | 'standard'  // affects caption tone
    historicalScoringAvg: number               // course avg score, last 5 years
    fieldStrengthRank: number                  // 1-50, where 1 = strongest field
    isFirstRound: boolean
  }
  
  // Weather context (from Tomorrow.io)
  weather: {
    windSpeedMph: number
    windDirection: string           // "off the lake", "into the par 5s" etc — derived
    conditionsFlag: 'calm' | 'moderate' | 'difficult' | 'severe'
    tempF: number
    precipChance: number
    conditionsSummary: string       // Claude-friendly one-liner: "20mph wind, soft greens"
  }
  
  // Field context
  field: {
    avgDgRating: number             // average DataGolf rating of the field
    topRatedInField: string         // name of highest DG-rated player in field
    fieldStrengthLabel: string      // "one of the strongest fields of the year" etc
  }
  
  // Player context (for player-specific triggers)
  player?: {
    name: string
    dgRating: number
    dgRatingPercentile: number      // where they rank among active tour players
    courseHistory: {
      timesPlayed: number
      avgFinish: number
      bestFinish: number
      sgAppAvg: number              // historical SG: Approach at this course
    }
    recentForm: {
      last5EventsAvgSg: number      // SG Total average, last 5 events
      trend: 'improving' | 'declining' | 'stable'
    }
    vsFieldAvg: {
      sgTotal: number               // player's SG vs field average this round/event
      sgApp: number
      sgPutt: number
    }
  }
  
  // Insight flag — pre-computed by the enrichment layer
  insightFlags: {
    playerOverperforming: boolean   // scoring significantly better than DG rating predicts
    playerUnderperforming: boolean
    conditionsAdvantage: boolean    // player historically performs well in these conditions
    courseSpecialist: boolean       // player has strong historical record here
    modelAligned: boolean           // result matches what model predicted
    modelSurprise: boolean          // result contradicts model prediction
    fieldBeatingCourse: boolean     // field scoring significantly below course avg
  }
}
```

### How the Enrichment Layer Works

In `autopilot/lib/enrichment.ts`:

```typescript
async function buildPostContext(
  triggerType: TriggerType,
  rawData: TriggerData
): Promise<PostContext> {
  // Run these fetches in parallel
  const [weather, courseHistory, fieldStrength, playerHistory] = await Promise.all([
    getWeatherContext(rawData.courseLat, rawData.courseLng, rawData.roundDate),
    getCourseHistoricalContext(rawData.eventName),
    getFieldStrengthContext(rawData.eventId),
    rawData.playerName ? getPlayerHistoricalContext(rawData.playerName, rawData.eventName) : null
  ])
  
  // Compute insight flags from the assembled data
  const insightFlags = computeInsightFlags(rawData, weather, courseHistory, playerHistory)
  
  return {
    tournament: buildTournamentContext(rawData, courseHistory),
    weather,
    field: fieldStrength,
    player: playerHistory ?? undefined,
    insightFlags
  }
}
```

The context object is stored as JSONB in `autopilot_queue.context` so it's available for caption regeneration during edits without re-fetching.

---

## What Good Content Looks Like Per Trigger

### Live Leaderboard

**Bad:** "Scottie Scheffler leads Augusta after R1 at -8. Full breakdown at divotlab.com"

**Good:** "Scheffler sits two clear at Augusta after R1. His DG rating coming in was the highest in the field. What's notable: he's doing it in 18mph wind that's pushed the field average to +1.2 for the day. The model likes him to be here."

The difference: weather context explains why -8 is more impressive than it looks. Field average comparison shows what par actually means today. Model alignment gives the analytical angle.

### Player Mover

**Bad:** "Rory McIlroy just moved from T18 to T5 in Round 2."

**Good:** "McIlroy just went from T18 to T5 on the back nine. His SG: Approach this round is +3.1 — well above his season average of +1.4. Augusta rewards that category more than any other on tour. He's done this here before."

The difference: SG category breakdown explains the mechanism. Comparison to his own baseline shows this is genuinely elevated. Course context (Augusta rewards approach) is the analytical hook.

### Pre-Tournament Model Picks

**Bad:** "Our model likes Scheffler, Rory, and Morikawa this week."

**Good:** "The model's top three for Augusta: Scheffler (course fit 94), Rory (course fit 89), Morikawa (course fit 85). Forecast is 20mph sustained wind Thursday — historically that favors ball-strikers over putters. All three rank top 10 in SG: Approach on tour."

The difference: course fit scores are original derived metrics. Weather creates an analytical framing. Strokes gained category connection earns the recommendation.

### Evergreen

**Bad:** "Strokes Gained is the best way to measure golf performance."

**Good:** "The average PGA Tour winner gains +1.8 strokes on approach per round. The average missed cut player loses 0.4. That 2.2-stroke gap is larger than any other SG category. Iron play wins on tour more than driving, more than putting."

The difference: specific numbers, comparison across categories, a conclusion that challenges conventional wisdom (most people think putting matters most).

---

## Weather Integration Standards

Weather context from Tomorrow.io must be interpreted, not just reported. Raw numbers alone are not useful.

### Wind Interpretation Rules

```typescript
function interpretWind(speedMph: number, direction: string, course: string): string {
  if (speedMph < 8) return 'calm conditions — expect low scoring'
  if (speedMph < 15) return 'light wind — minimal scoring impact'
  if (speedMph < 22) return `moderate wind (${speedMph}mph) — approach accuracy becomes premium`
  if (speedMph < 30) return `significant wind (${speedMph}mph) — scoring average typically rises 2-3 shots`
  return `severe wind (${speedMph}mph) — field-wide scoring disruption expected`
}
```

### Conditions Flag Rules

```typescript
function getConditionsFlag(windMph: number, precipChance: number): ConditionsFlag {
  if (windMph < 10 && precipChance < 20) return 'calm'
  if (windMph < 18 && precipChance < 40) return 'moderate'
  if (windMph < 28 || precipChance > 50) return 'difficult'
  return 'severe'
}
```

### When Weather Becomes the Main Angle

If `conditionsFlag` is `difficult` or `severe`, weather becomes the lead of the post rather than supporting context. A 30mph wind day at Augusta is more interesting than who's leading.

Trigger: `weather_angle` — fires pre-tournament when forecast shows difficult or severe conditions for any round. This is a standalone post, not an add-on to another trigger.

---

## DataGolf Data Quality Rules

### Never Post Unverified Superlatives

Before any caption claims a player is "best in field" or "leads the field in X":

```typescript
// Always verify against complete dataset, not just top players fetched
async function verifySuperlative(
  playerName: string,
  metric: string,
  value: number,
  eventId: string
): Promise<'verified' | 'directional_only'> {
  const fieldData = await getFullFieldMetric(eventId, metric)
  const rank = fieldData.filter(p => p.value > value).length + 1
  return rank === 1 ? 'verified' : 'directional_only'
}
```

If not verified as #1: use "among the best in the field" not "best in the field."

### Derived Metrics vs Raw Data

Per DataGolf commercial use policy, always transform raw data into derived metrics before using in posts. Never republish raw API responses verbatim.

Acceptable transformations:
- Rounding SG values to 1 decimal
- Converting to percentile rankings
- Computing field averages and deltas
- Generating course fit scores from multiple inputs
- Labeling conditions categories from raw numbers

### Stat Freshness

Tournament stats must be from the current event. Never mix current-event stats with season averages without clearly labeling both. Format:

- Current event: "shooting +2.4 SG: Approach **this week**"
- Season average: "against his season average of +1.4"
- Historical course: "historically +1.1 at this venue"

---

## Graphic Type Selection Logic

Not every trigger uses the same template. The enrichment layer also selects the appropriate template based on content type:

```typescript
function selectTemplate(triggerType: TriggerType, context: PostContext): TemplateId {
  // Comparison graphic when two players are the story
  if (triggerType === 'comparison_spotlight') return 'comparison'
  
  // Quote/insight graphic when the insight is more important than the numbers
  if (context.insightFlags.modelSurprise || context.insightFlags.conditionsAdvantage) {
    return 'quote-insight'  // bold text forward, fewer numbers
  }
  
  // Weather card when conditions are the lead
  if (triggerType === 'weather_angle') return 'weather-card'
  
  // Course breakdown for course profile evergreen
  if (triggerType === 'evergreen_course_profile') return 'course-breakdown'
  
  // Default: stat card
  return triggerTypeToTemplate[triggerType] ?? 'player-stat'
}
```

This means the feed naturally varies — not every post looks the same — without requiring manual template selection.

---

## Evergreen Content Quality Standard

Evergreen posts must meet a higher bar than tournament posts because they have no timeliness hook. They live or die on whether the insight is genuinely interesting.

Before seeding any evergreen item, it must pass this checklist:

- [ ] Contains at least one specific number (not vague claims)
- [ ] That number is compared to something (average, another player, another category)
- [ ] The conclusion would surprise a casual golf fan
- [ ] It could not have been written without data (pure opinion pieces are rejected)
- [ ] The insight is true year-round, not tied to a specific event or player's current form

**Minimum evergreen bank: 40 active items before going live.**
- 8 SG explainer series (one per SG category + 2 synthesis posts)
- 8 course profiles (Augusta, Pebble, TPC Sawgrass, St Andrews, Riviera, Muirfield Village, Bethpage Black, Torrey Pines)
- 8 player spotlights (top 8 players by current DG rating)
- 8 myth busts (driver distance, putting importance, equipment myths, etc.)
- 8 stat of the week (standalone X-only short posts, text only)

---

## Content Failure Modes to Avoid

These are the ways the pipeline produces bad content. The system should be designed to prevent all of them.

1. **The scoreboard post** — states what happened, no analytical angle. Fix: insight flags must find at least one non-obvious angle or the caption prompt explicitly fails and falls back to a skip recommendation.

2. **The fake precision post** — cites a decimal place on a stat that isn't meaningful at that precision. Fix: round all SG values to 1 decimal. Never report "SG: +2.341."

3. **The unverified superlative** — claims a player leads the field in something without full field verification. Fix: superlative verification function in enrichment layer.

4. **The context-free number** — "Scheffler gained +2.4 strokes on approach." So what? Fix: every number must be accompanied by a comparison or interpretation.

5. **The weather mention without insight** — "It's windy at Augusta today." Fix: weather is only mentioned if it explains a scoring pattern or creates an analytical angle.

6. **The hype post** — "Rory is ON FIRE right now." Fix: brand voice rules enforced in Claude API system prompt, exclamation point stripping, hype word blacklist.

7. **The stale evergreen** — same post format recycled too often. Fix: series tracking, template rotation, minimum 40-item bank before launch.
