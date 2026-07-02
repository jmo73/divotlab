# Templates — Divot Lab Autopilot

## Overview

All post images are generated from SVG templates with dynamic data injected at runtime, then converted to 1080×1080px PNG via Sharp. No headless browser.

---

## Design Tokens

Use these exact values across all templates. Never hardcode inline — reference by comment.

```
Background:       #0A0A0A
Surface:          #141414   (card/panel backgrounds within templates)
Border:           #1F1F1F   (dividers, subtle separators)
Green dark:       #1B4D3E   (Lab Green — badges, accents)
Green light:      #5BBF85   (Lab Green light — highlights, positive numbers, hero stats)
Gold:             #C9A84C   (special callouts, dark horse picks, notable moments)
Blue:             #5A8FA8   (secondary data, model prediction context)
White:            #FAFAFA   (primary text)
Muted:            #6B6B6B   (labels, secondary text, metadata)

Display font:     Cormorant Garamond
Body font:        DM Sans
Mono font:        JetBrains Mono  (ALL numbers, scores, stats — no exceptions)
```

**Font loading in SVG:** Embed `<defs><style>@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap')</style></defs>` at the top of every template. Sharp resolves Google Fonts at render time when network is available.

**Score colors:**
- Under par: `#5BBF85` (green-light)
- Even par: `#FAFAFA` (white)
- Over par: `#C9A84C` (gold — never red)

---

## Canvas Specification

```
Width:   1080px
Height:  1080px
Format:  PNG → converted to JPEG for Instagram via Sharp
DPI:     72
```

**Layout grid (consistent across all templates):**
- Outer padding: 64px all sides
- Content width: 952px
- Logo zone: top-left, 28px icon + wordmark
- Footer zone: bottom 60px — divider + "DIVOT LAB · divotlab.com"

---

## Logo Block (Embedded in Every Template)

Use this SVG group at top-left of every template. Never use an external `<image>` tag.

```svg
<g transform="translate(64, 52)">
  <line x1="0" y1="14" x2="28" y2="14" stroke="#FAFAFA" stroke-width="1.4"/>
  <path d="M2 14 C6 14,10 24,14 24 S22 14,26 14" fill="rgba(250,250,250,0.15)"/>
  <path d="M2 14 C6 14,10 24,14 24 S22 14,26 14" stroke="#FAFAFA" stroke-width="1.2" fill="none"/>
  <circle cx="14" cy="7" r="4" fill="#FAFAFA"/>
  <text x="36" y="10" font-family="DM Sans" font-size="11" font-weight="600"
        letter-spacing="2" fill="#FAFAFA">DIVOT</text>
  <text x="36" y="22" font-family="DM Sans" font-size="11" font-weight="300"
        letter-spacing="2" fill="rgba(250,250,250,0.5)">LAB</text>
</g>
```

---

## Footer Block (Embedded in Every Template)

```svg
<g transform="translate(64, 1004)">
  <line x1="0" y1="0" x2="952" y2="0" stroke="#1F1F1F" stroke-width="1"/>
  <text x="0" y="20" font-family="DM Sans" font-size="14" font-weight="500"
        letter-spacing="1.5" fill="#6B6B6B">DIVOT LAB</text>
  <text x="106" y="20" font-family="DM Sans" font-size="14" fill="#3A3A3A"> · </text>
  <text x="122" y="20" font-family="DM Sans" font-size="14" fill="#6B6B6B">divotlab.com</text>
</g>
```

---

## Template 1: `leaderboard.svg`

**Used by:** live_leaderboard_r1_end, r2_end, r3_end, final

```
┌─────────────────────────────────────────────┐
│ [LOGO]                      [ROUND BADGE]   │  ← 64px top
│                                             │
│ [EVENT NAME — Cormorant 52px white]         │  ← y:160
│ [COURSE · CONDITIONS — DM Sans 18px muted]  │  ← y:200
│                                             │
│ ┌─────────────────────────────────────┐     │  ← y:240
│ │  1  PLAYER NAME    -18   ████████   │     │  Row height: 90px
│ │  2  PLAYER NAME    -15   ██████     │     │  Score: JetBrains Mono 36px
│ │  3  PLAYER NAME    -14   ██████     │     │  Bar: DG rating viz 0–180px wide
│ │  4  PLAYER NAME    -12   █████      │     │  Position: DM Sans 24px muted
│ │  5  PLAYER NAME    -11   █████      │     │  Name: DM Sans 24px white
│ └─────────────────────────────────────┘     │  ← y:690
│                                             │
│ [INSIGHT LINE — DM Sans 18px green-light]   │  ← y:740
│ [FIELD AVG / CONDITIONS LINE — 15px muted]  │  ← y:768
│                                             │
│ ─────────────────────────────────────────   │  ← y:940
│ DIVOT LAB · divotlab.com                    │  ← y:964
└─────────────────────────────────────────────┘
```

**Dynamic tokens:**
```
{{EVENT_NAME}}
{{COURSE_CONDITIONS}}     → "Augusta National · 18mph wind, 62°F"
{{ROUND_BADGE}}           → "R1 FINAL" | "R2 FINAL" | "R3 FINAL" | "FINAL RESULT"
{{P1_NAME}} through {{P5_NAME}}
{{P1_SCORE}} through {{P5_SCORE}}    → "-18" | "E" | "+2"
{{P1_SCORE_COLOR}} through {{P5_SCORE_COLOR}}   → hex color per score rules
{{P1_DG_BAR_WIDTH}} through {{P5_DG_BAR_WIDTH}} → calculated 0–180px
{{INSIGHT}}               → max 72 chars
{{FIELD_CONTEXT}}         → "Field avg: +1.2 today · Hist. course avg: -8.4"
```

---

## Template 2: `player-stat.svg`

**Used by:** mid_round_mover, post_round_sleeper, evergreen_player_spotlight

```
┌─────────────────────────────────────────────┐
│ [LOGO]                         [BADGE]      │
│                                             │
│ [PLAYER NAME — Cormorant 68px white]        │  ← y:180
│ [CONTEXT — DM Sans 20px muted]              │  ← y:248  e.g. "T7 · Round 2"
│                                             │
│ ┌──────────────────┐ ┌──────────────────┐   │  ← y:310
│ │   SG TOTAL       │ │   DG RATING      │   │  Stat block: 440px wide each
│ │   +2.4           │ │   91.2           │   │  Value: JetBrains Mono 60px green-light
│ │   this round     │ │   world rank 4   │   │  Label: DM Sans 14px muted
│ └──────────────────┘ └──────────────────┘   │
│                                             │
│ ┌──────────────────┐ ┌──────────────────┐   │  ← y:530 (optional 3rd/4th stat)
│ │   SG APPROACH    │ │   VS FIELD AVG   │   │
│ │   +1.8           │ │   +0.9           │   │
│ │   this round     │ │   above avg      │   │
│ └──────────────────┘ └──────────────────┘   │
│                                             │
│ [INSIGHT — DM Sans 20px white, 2 lines]     │  ← y:720
│                                             │
│ ─────────────────────────────────────────   │
│ DIVOT LAB · divotlab.com                    │
└─────────────────────────────────────────────┘
```

**Dynamic tokens:**
```
{{PLAYER_NAME}}
{{CONTEXT_LINE}}          → "T7 · Round 2" or "Season Overview"
{{BADGE}}                 → "MOVER" | "SLEEPER" | "SPOTLIGHT"
{{BADGE_COLOR}}           → "#5BBF85" for mover/spotlight | "#C9A84C" for sleeper
{{STAT1_VALUE}} {{STAT1_LABEL}}
{{STAT2_VALUE}} {{STAT2_LABEL}}
{{STAT3_VALUE}} {{STAT3_LABEL}}   (optional)
{{STAT4_VALUE}} {{STAT4_LABEL}}   (optional)
{{INSIGHT}}               → 2 lines max, ~90 chars total
```

---

## Template 3: `model-pick.svg`

**Used by:** pre_tournament_model_picks

```
┌─────────────────────────────────────────────┐
│ [LOGO]                   [MODEL PICKS BADGE]│
│                                             │
│ [EVENT NAME — Cormorant 48px]               │  ← y:160
│ THE MODEL'S VIEW                            │  ← y:210 DM Sans 18px muted
│ [CONDITIONS SUMMARY — 16px muted]           │  ← y:234
│                                             │
│ ┌─────────────────────────────────────┐     │  ← y:280
│ │ #1 PLAYER NAME           32% WIN   │     │  Name: DM Sans 26px
│ │    Course Fit ████████░░            │     │  Pct: JetBrains Mono 26px green-light
│ │    [KEY STRENGTH — 15px muted]      │     │  Bar: 0–280px
│ ├─────────────────────────────────────┤     │  Row height: 110px
│ │ #2 PLAYER NAME           18% WIN   │     │
│ │    Course Fit ██████░░░░            │     │
│ │    [KEY STRENGTH]                   │     │
│ ├─────────────────────────────────────┤     │
│ │ #3 PLAYER NAME           14% WIN   │     │
│ │    Course Fit █████░░░░░            │     │
│ │    [KEY STRENGTH]                   │     │
│ └─────────────────────────────────────┘     │  ← y:610
│                                             │
│ DARK HORSE                                  │  ← y:660 DM Sans 12px muted label
│ [PLAYER NAME — DM Sans 22px gold]           │  ← y:684
│ [ONE LINE REASON — 16px muted]              │  ← y:710
│                                             │
│ ─────────────────────────────────────────   │
│ DIVOT LAB · divotlab.com                    │
└─────────────────────────────────────────────┘
```

**Dynamic tokens:**
```
{{EVENT_NAME}}
{{CONDITIONS_SUMMARY}}      → "Forecast: 20mph wind Thursday · Soft greens expected"
{{P1_NAME}} {{P1_WIN_PCT}} {{P1_FIT_WIDTH}} {{P1_KEY_STRENGTH}}
{{P2_NAME}} {{P2_WIN_PCT}} {{P2_FIT_WIDTH}} {{P2_KEY_STRENGTH}}
{{P3_NAME}} {{P3_WIN_PCT}} {{P3_FIT_WIDTH}} {{P3_KEY_STRENGTH}}
{{DH_NAME}}
{{DH_REASON}}               → max 60 chars
```

---

## Template 4: `cut-line.svg`

**Used by:** cut_bubble_alert

```
┌─────────────────────────────────────────────┐
│ [LOGO]                    [CUT ALERT BADGE] │
│                                             │
│ THE BUBBLE                                  │  ← Cormorant 80px white
│ [EVENT] · R2                                │  ← DM Sans 20px muted
│                                             │
│ Cut line: [-X]                              │  ← JetBrains Mono 44px green-light
│                                             │
│ ┌─────────────────────────────────────┐     │
│ │ PLAYER NAME    [SCORE]   [HOLES] ▌  │     │  4 rows max
│ │ PLAYER NAME    [SCORE]   [HOLES] ▌  │     │  Score: JetBrains Mono green-light/gold
│ │ PLAYER NAME    [SCORE]   [HOLES] ▌  │     │  Holes bar: remaining holes viz
│ │ PLAYER NAME    [SCORE]   [HOLES] ▌  │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ ─────────────────────────────────────────   │
│ DIVOT LAB · divotlab.com                    │
└─────────────────────────────────────────────┘
```

---

## Template 5: `evergreen-fact.svg`

**Used by:** evergreen_sg_explainer, evergreen_course_profile, evergreen_player_spotlight

```
┌─────────────────────────────────────────────┐
│ [LOGO]                      [TOPIC BADGE]   │
│                                             │
│ [HEADLINE — Cormorant 54px white]           │  ← y:180  max 36 chars
│ [SUBHEAD — DM Sans 22px muted]              │  ← y:244  max 52 chars
│                                             │
│ ┌─────────────────────────────────────┐     │  ← y:300
│ │                                     │     │  Surface: #141414, rounded 12px
│ │   [MAIN STAT]                       │     │  Stat: JetBrains Mono 88px green-light
│ │   [UNIT/LABEL]                      │     │  Unit: DM Sans 20px muted
│ │                                     │     │
│ │   [LINE 1 SUPPORTING TEXT]          │     │  DM Sans 19px white
│ │   [LINE 2 SUPPORTING TEXT]          │     │  max 52 chars per line
│ │   [LINE 3 SUPPORTING TEXT]          │     │  max 3 lines
│ │                                     │     │
│ └─────────────────────────────────────┘     │  ← y:780
│                                             │
│ ─────────────────────────────────────────   │
│ DIVOT LAB · divotlab.com                    │
└─────────────────────────────────────────────┘
```

**Dynamic tokens:**
```
{{TOPIC_BADGE}}           → "STROKES GAINED" | "COURSE PROFILE" | "PLAYER SPOTLIGHT"
{{HEADLINE}}              → max 36 chars
{{SUBHEAD}}               → max 52 chars
{{MAIN_STAT}}             → hero number or short phrase, max 10 chars
{{UNIT_LABEL}}            → unit below the stat, max 20 chars
{{SUPPORT_LINE_1}}        → max 52 chars
{{SUPPORT_LINE_2}}        → max 52 chars (optional)
{{SUPPORT_LINE_3}}        → max 52 chars (optional)
```

---

## Template 6: `quote-insight.svg` ← NEW

**Used by:** evergreen_myth_bust, live_leaderboard_final (when model surprise), any trigger where insight flag overrides default template

**Design philosophy:** Text is the visual. One bold claim. No data clutter. The most Instagram-native template — designed for saves and shares.

```
┌─────────────────────────────────────────────┐
│ [LOGO]                         [BADGE]      │
│                                             │
│                                             │
│                                             │
│   [LINE 1 — Cormorant 58px white italic]    │  ← Centered vertically
│   [LINE 2 — Cormorant 58px white italic]    │  ← 3 lines max
│   [LINE 3 — Cormorant 58px white italic]    │  ← Total: max 120 chars
│                                             │
│   [SOURCE LINE — JetBrains Mono 16px muted] │  ← "via DataGolf · 2024 season data"
│                                             │
│                                             │
│                                             │
│ ─────────────────────────────────────────   │
│ DIVOT LAB · divotlab.com                    │
└─────────────────────────────────────────────┘
```

**Accent detail:** A 3px vertical green-light bar on the left edge of the text block. Signature visual element for this template.

**Dynamic tokens:**
```
{{BADGE}}                 → "DATA MYTH" | "THE NUMBERS SAY" | "MODEL INSIGHT"
{{QUOTE_LINE_1}}          → max 40 chars
{{QUOTE_LINE_2}}          → max 40 chars
{{QUOTE_LINE_3}}          → max 40 chars (optional)
{{SOURCE_LINE}}           → max 48 chars — always cite data source
```

---

## Template 7: `comparison.svg` ← NEW

**Used by:** comparison_spotlight

**Design philosophy:** Two columns, clean split down the middle. Each side is one player. The contrast between them is the story.

```
┌─────────────────────────────────────────────┐
│ [LOGO]                  [COMPARISON BADGE]  │
│                                             │
│ [EVENT · ROUND — DM Sans 18px muted]        │
│                                             │
│ ┌────────────────┬────────────────────┐     │  ← y:200
│ │  PLAYER A      │      PLAYER B      │     │  Column split at x:540
│ │  [NAME 28px]   │   [NAME 28px]      │     │
│ │                │                    │     │
│ │  [SCORE]       │   [SCORE]          │     │  JetBrains Mono 52px
│ │  [POSITION]    │   [POSITION]       │     │  DM Sans 18px muted
│ │                │                    │     │
│ ├────────────────┼────────────────────┤     │  Divider at y:400
│ │  SG TOTAL      │   SG TOTAL         │     │  Stat rows: 80px each
│ │  [VALUE]       │   [VALUE]          │     │  JetBrains Mono 32px
│ ├────────────────┼────────────────────┤     │
│ │  SG APPROACH   │   SG APPROACH      │     │
│ │  [VALUE]       │   [VALUE]          │     │
│ ├────────────────┼────────────────────┤     │
│ │  DG RATING     │   DG RATING        │     │
│ │  [VALUE]       │   [VALUE]          │     │
│ └────────────────┴────────────────────┘     │  ← y:720
│                                             │
│ [COMPARISON ANGLE — DM Sans 18px muted]     │  ← y:770 "Same DG rating. 6-shot gap."
│                                             │
│ ─────────────────────────────────────────   │
│ DIVOT LAB · divotlab.com                    │
└─────────────────────────────────────────────┘
```

**Dynamic tokens:**
```
{{EVENT_ROUND}}             → "The Masters · Round 1"
{{A_NAME}} {{A_SCORE}} {{A_POSITION}}
{{A_SG_TOTAL}} {{A_SG_APPROACH}} {{A_DG_RATING}}
{{A_SCORE_COLOR}}
{{B_NAME}} {{B_SCORE}} {{B_POSITION}}
{{B_SG_TOTAL}} {{B_SG_APPROACH}} {{B_DG_RATING}}
{{B_SCORE_COLOR}}
{{COMPARISON_ANGLE}}        → max 52 chars — the insight that makes the comparison worth showing
```

**Color logic:** The better-performing player's side gets a subtle green-light left border. The other side gets nothing — let the numbers speak.

---

## Template 8: `course-breakdown.svg` ← NEW

**Used by:** evergreen_course_profile

```
┌─────────────────────────────────────────────┐
│ [LOGO]                  [COURSE PROFILE]    │
│                                             │
│ [COURSE NAME — Cormorant 56px white]        │  ← y:160
│ [LOCATION · PAR · YARDS — DM Sans 18px muted]│  ← y:220
│                                             │
│ ┌─────────────────────────────────────┐     │  ← y:270  Surface #141414
│ │ REWARDS        [PRIMARY SG CAT]     │     │  Row: 72px
│ ├─────────────────────────────────────┤     │
│ │ HIST. SCORING  [AVG SCORE VS PAR]   │     │  Value: JetBrains Mono 28px green-light
│ ├─────────────────────────────────────┤     │  Label: DM Sans 14px muted
│ │ FIELD AVG      [TYPICAL WINNER]     │     │
│ ├─────────────────────────────────────┤     │
│ │ KEY STAT       [DISTINCTIVE FACT]   │     │
│ └─────────────────────────────────────┘     │  ← y:558
│                                             │
│ [INSIGHT — DM Sans 20px white, 2 lines]     │  ← y:610
│ [HISTORICAL HOOK — 16px muted, 1 line]      │  ← y:644
│                                             │
│ ─────────────────────────────────────────   │
│ DIVOT LAB · divotlab.com                    │
└─────────────────────────────────────────────┘
```

**Dynamic tokens:**
```
{{COURSE_NAME}}
{{COURSE_META}}           → "Augusta, Georgia · Par 72 · 7,510 yards"
{{REWARDS_LABEL}}         → "SG: Approach" or "SG: Around the Green"
{{HIST_SCORING}}          → "-12.4 avg winning score (last 10 years)"
{{FIELD_AVG}}             → "+0.8 avg score vs par for the field"
{{KEY_STAT}}              → one surprising course-specific stat
{{INSIGHT_LINE_1}}        → max 52 chars
{{INSIGHT_LINE_2}}        → max 52 chars
{{HISTORICAL_HOOK}}       → max 60 chars — e.g. "Tiger won here 5 times averaging -13.2"
```

---

## Template 9: `weather-card.svg` ← NEW

**Used by:** weather_angle

```
┌─────────────────────────────────────────────┐
│ [LOGO]                   [CONDITIONS BADGE] │
│                                             │
│ [EVENT NAME — Cormorant 44px]               │  ← y:160
│ [ROUND · DATE — DM Sans 18px muted]         │  ← y:210
│                                             │
│ ┌─────────────────────────────────────┐     │  ← y:260
│ │                                     │     │
│ │  [WIND SPEED]                       │     │  JetBrains Mono 80px white
│ │  MPH                                │     │  DM Sans 24px muted
│ │                                     │     │
│ │  [WIND DIRECTION — 20px muted]      │     │
│ │  [TEMP · PRECIP — 18px muted]       │     │
│ │                                     │     │
│ └─────────────────────────────────────┘     │  ← y:560
│                                             │
│ [CONDITIONS FLAG LABEL — 24px]              │  ← y:600  "DIFFICULT CONDITIONS"
│                                             │  Color: gold if difficult, muted if moderate
│ [SCORING IMPACT — DM Sans 19px white]       │  ← y:640  "Expect scoring to rise 2–3 shots"
│ [HISTORICAL CONTEXT — 16px muted]           │  ← y:668  "This course avg rises 2.8 in wind"
│                                             │
│ ─────────────────────────────────────────   │
│ DIVOT LAB · divotlab.com                    │
└─────────────────────────────────────────────┘
```

**Dynamic tokens:**
```
{{EVENT_NAME}}
{{ROUND_DATE}}              → "Round 1 · Thursday"
{{WIND_SPEED}}              → "26" (number only — MPH label is static in template)
{{WIND_DIRECTION}}          → "out of the northwest"
{{TEMP_PRECIP}}             → "58°F · 40% chance of rain"
{{CONDITIONS_FLAG}}         → "DIFFICULT CONDITIONS" | "SEVERE CONDITIONS"
{{CONDITIONS_FLAG_COLOR}}   → "#C9A84C" for difficult, "#FAFAFA" for severe
{{SCORING_IMPACT}}          → max 52 chars
{{HISTORICAL_CONTEXT}}      → max 60 chars
```

---

## SVG Injection Implementation

In `autopilot/lib/imageGen.ts`:

```typescript
async function generateImage(
  templateId: TemplateId,
  fields: Record<string, string>
): Promise<Buffer> {
  let svg = await fs.readFile(`autopilot/templates/${templateId}.svg`, 'utf-8')
  
  // Replace all {{TOKEN}} occurrences
  for (const [key, value] of Object.entries(fields)) {
    svg = svg.replaceAll(`{{${key}}}`, escapeXml(value))
  }
  
  // Validate no unreplaced tokens
  const unreplaced = svg.match(/\{\{[A-Z0-9_]+\}\}/g)
  if (unreplaced) throw new Error(`Unreplaced SVG tokens: ${unreplaced.join(', ')}`)
  
  // Sharp: SVG → PNG at 1080×1080
  return await sharp(Buffer.from(svg))
    .resize(1080, 1080)
    .png()
    .toBuffer()
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
```

**Always escape XML before injection.** Player names like "O'Mahony" or "&" in event names will break SVG rendering without escaping.

---

## Template Selection Logic

Template is selected by `enrichment.ts` based on trigger type and insight flags. See `CONTENT_QUALITY.md` for the full selection function. Default mappings:

```typescript
const DEFAULT_TEMPLATE: Record<TriggerType, TemplateId> = {
  live_leaderboard_r1_end:      'leaderboard',
  live_leaderboard_r2_end:      'leaderboard',
  live_leaderboard_r3_end:      'leaderboard',
  live_leaderboard_final:       'leaderboard',
  mid_round_mover:              'player-stat',
  cut_bubble_alert:             'cut-line',
  weather_angle:                'weather-card',
  pre_tournament_model_picks:   'model-pick',
  post_round_sleeper:           'player-stat',
  comparison_spotlight:         'comparison',
  evergreen_sg_explainer:       'evergreen-fact',
  evergreen_course_profile:     'course-breakdown',
  evergreen_player_spotlight:   'player-stat',
  evergreen_stat_of_week:       null,     // text-only post, no image
  evergreen_myth_bust:          'quote-insight',
}
```
