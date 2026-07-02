# Divot Lab — Social Card Style Guide

This is the design spec for all Puppeteer-rendered HTML templates. Every template starts here. Deviate intentionally, not accidentally.

---

## Why this exists

All 9+ templates should feel like they came from the same brand, but look different enough that a grid of them on Instagram or Twitter has visual variety — in color, layout, content density, and typographic emphasis. This guide defines what stays fixed across all cards and what varies per template.

---

## Canvas & Format

| Property | Value |
|---|---|
| Width | 1080px |
| Height | 1350px (4:5 Instagram) |
| Side padding | 64px |
| Top padding | 60px |
| Bottom padding | 52px |
| Renderer | Puppeteer `page.screenshot()`, `deviceScaleFactor: 1` |
| Output | PNG → JPEG 92% for posting |

All templates are 4:5. The square (1080×1080) format is not used — 4:5 fills more feed real estate and forces better use of vertical space.

---

## Typography System

Three font families. Each has a purpose. Don't swap them.

| Family | Role | When to use |
|---|---|---|
| **Cormorant Garamond** | Display / editorial | Tournament names, hero quotes, large single numbers that should feel prestigious |
| **DM Sans** | Brand / UI | Player names, labels, body text, logo, insight copy, badges |
| **JetBrains Mono** | Data | All numbers, scores, stats, ranks, percentages, SG values |

### Font Size Scale (from leaderboard, use as baseline)

| Element | Font | Size | Weight | Color |
|---|---|---|---|---|
| Logo wordmark | DM Sans | 24px | 700 | rgba(245,245,243,0.95) · "LAB" at 300/55% |
| Logo SVG mark | — | 40×40px | — | #5BBF85 |
| Round/badge label | DM Sans | 20px | 500 | rgba(91,191,133,0.9) |
| Event name / display title | Cormorant Garamond Italic | 52px | 600 | Gradient: white→green (see below) |
| Column headers | DM Sans | 16px | 600 | rgba(245,245,243,0.4) · uppercase · 0.14em tracking |
| Hero number (score, stat) | JetBrains Mono | 62px | 400 | Color-coded (green/white/gold) |
| Player name | DM Sans | 38px | 600 | rgba(245,245,243,0.95) |
| Rank / position | JetBrains Mono | 22px | 400 | rgba(245,245,243,0.38) |
| Supporting data (DG, SG) | JetBrains Mono | 19px | 400 | rgba(245,245,243,0.45) |
| Insight / body copy | DM Sans | 20px | 400 | rgba(245,245,243,0.65) |
| Footer | DM Sans | 16px | 500 | rgba(245,245,243,0.28) · uppercase · 0.18em tracking |

**Rule:** Never go below 16px for any visible text element. Small text is not dim text — dim text at large size is more readable and feels more premium than normal text at small size.

---

## Color System

### Base Palette

| Token | Hex | Use |
|---|---|---|
| Background | `#0A0A0A` | Card background |
| Card surface | `#161614` | Elevated surfaces (not often used — prefer background) |
| White | `#F5F5F3` | All text base |
| Green dark | `#1B4D3E` | Gradients, deep accents |
| Green light | `#5BBF85` | Primary accent — scores, logo, badges, bars |
| Blue mid | `#5A8FA8` | Weather, conditions, cool-tone templates |
| Gold | `#C9A84C` | Warnings, picks, cut alerts, over-par scores |
| Border dim | `rgba(255,255,255,0.07)` | Most dividers |
| Border mid | `rgba(255,255,255,0.10–0.12)` | Top-of-table rules, stronger dividers |

### Score / Stat Color Coding

| Condition | Color |
|---|---|
| Under par / positive SG | `#5BBF85` (green) |
| Even par | `rgba(245,245,243,0.95)` (white) |
| Over par / negative SG | `#C9A84C` (gold) |

### Gradient Treatments

**Event name gradient (white → green):**
```css
background: linear-gradient(100deg, rgba(245,245,243,0.92) 55%, rgba(91,191,133,0.65) 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
background-clip: text;
```

**Background radial glow (green, leaderboard default):**
```css
background:
  radial-gradient(ellipse 80% 50% at 15% -5%, rgba(27,77,62,0.18) 0%, transparent 60%),
  #0A0A0A;
```

Each template can shift the glow color, position, and intensity to create variety. See Template Variety Matrix below.

---

## Fixed Elements (Every Template)

These do not change. They define the brand across all cards.

### Logo Header
```html
<svg width="40" height="40" viewBox="0 0 72 72" fill="none" style="color:#5BBF85">
  <line x1="4" y1="36.5" x2="68" y2="36.5" stroke="currentColor" stroke-width="3.2"/>
  <path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="currentColor" fill-opacity=".18"/>
  <path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="currentColor" stroke-width="2.8" fill="none"/>
  <circle cx="36" cy="20.5" r="9" fill="currentColor"/>
</svg>
<span class="logo-wordmark">DIVOT <span>LAB</span></span>
```

Logo always top-left. Badge/label always top-right.

### Footer
```html
<div class="footer">Divot Lab &middot; divotlab.com</div>
```

Always present. 16px, 0.28 opacity, centered, uppercase, 0.18em tracking.

### Background Watermark
The actual logo mark SVG at 680px, `opacity: 0.028`, absolutely centered. Position can shift per template (`translate(-50%, -46%)` default). Opacity can vary between 0.02–0.04.

### Dividers
1px rules. Use `rgba(255,255,255,0.10)` for structural rules (top of table), `rgba(255,255,255,0.07)` for row dividers, `rgba(255,255,255,0.055)` for subtle section breaks.

### Round/Badge Label (no border boxes)
```html
<div class="round-label">
  <div class="round-dot"></div>
  AFTER R2
</div>
```

Dot is 9px, `#5BBF85`, 0.8 opacity. Label text 20px, green. **No border boxes.** The old bordered badge style is retired.

---

## Template Variety Matrix

Each template picks a color tone and background treatment. When multiple cards appear in a feed grid, this creates the visual variety.

| Template | Accent color | BG gradient | Watermark position | Typographic emphasis |
|---|---|---|---|---|
| **Leaderboard** | Green | Green glow, top-left | Center | Table · Cormorant event name |
| **Player spotlight** | Green | Green glow, top-right | Bottom-right, larger, 0.035 opacity | Name as hero · 4 stats in 2×2 |
| **Course profile** | Blue | Blue glow, bottom-right | Top-left, rotated | Course name in Cormorant · stat grid |
| **Weather card** | Blue | Blue glow, full-center | Bottom, large, 0.02 opacity | Giant Cormorant number (wind speed) |
| **Model picks** | Green + Gold | Green glow, top-left | Center, standard | Pick hierarchy · dark horse in gold |
| **Cut alert** | Gold | Gold glow, top-right | Center, large, 0.025 opacity | Giant Cormorant cut number in gold |
| **Comparison** | Green (leader) | Neutral, no glow | Split — one side each | Two-column split layout |
| **Evergreen fact** | Blue or Gold | Varies by topic | Large, center | Massive stat number · minimal text |
| **Quote/insight** | Green | Very subtle, no glow | Large, high opacity, decorative | All Cormorant italic · text-dominant |
| **Pick result (WIN)** | Green | Strong green glow | Large, 0.04 opacity | RESULT bold · pick details below |
| **Pick result (LOSS)** | Gold | Subtle gold glow | Standard | RESULT bold · pick details below |
| **Player hero** | Green | Photo composite top | N/A (photo fills top zone) | Stats in bottom strip · photo-first |

### Background Glow Variants

```css
/* Green — leaderboard, model picks, player spotlight */
radial-gradient(ellipse 80% 50% at 15% -5%, rgba(27,77,62,0.18) 0%, transparent 60%)

/* Green strong — pick WIN result */
radial-gradient(ellipse 70% 60% at 20% 10%, rgba(27,77,62,0.28) 0%, transparent 55%)

/* Blue — weather, course profile */
radial-gradient(ellipse 80% 55% at 85% 5%, rgba(90,143,168,0.16) 0%, transparent 60%)

/* Gold — cut alert, pick LOSS */
radial-gradient(ellipse 75% 50% at 10% 0%, rgba(201,168,76,0.14) 0%, transparent 55%)

/* Neutral — comparison, quote */
#0A0A0A  /* no gradient */
```

---

## Design Principles (from iteration)

These came from real feedback — follow them.

1. **No text below 16px.** Small text is invisible on a phone screen. Dim opacity creates subtlety, not small size.

2. **Three font families, three purposes.** Cormorant = editorial prestige. DM Sans = brand/UI. JetBrains Mono = data/numbers. Don't use Cormorant for data. Don't use Mono for body copy.

3. **No border boxes on badges.** The bordered rectangle badge looked elementary. Use: dot + text, or colored text alone, or a pill with `rgba` fill only (no border).

4. **Watermark adds depth, not distraction.** Keep opacity 0.02–0.04. The ball (circle element) tends to be the most visible part of the logo — can reduce its `fill-opacity` inside the watermark SVG if it reads too heavy.

5. **Cormorant for the event name changes the register.** Mixing a serif display font into a data card signals "editorial analytics" not "spreadsheet screenshot." All templates with a tournament name or headline use Cormorant Garamond Italic at 48–56px.

6. **Leader / top item always gets an accent.** On leaderboard: 3px inset left green shadow. On picks: a more prominent treatment. On comparison: winner side. The eye needs a place to start.

7. **The gradient on display text is premium.** `background-clip: text` with a white→green gradient on the Cormorant event name is a signature element. Can vary direction (right-to-left, top-to-bottom) per template.

8. **4:5 always.** Never render square cards. The vertical format gets more feed real estate and the extra height means information breathes instead of cramming.

9. **Vary the thing that changes, not the structure.** The grid structure (logo top-left, label top-right, content middle, footer bottom) stays fixed. What varies: colors, background glow, watermark position, whether the layout is a table vs. two-column vs. single-hero vs. text-dominant.

10. **The insight bar is the editorial voice.** The 3px green left accent bar + body copy at the bottom is where Divot Lab's analytical perspective lives. Keep it on every tournament template. The copy there is the differentiator from a generic ESPN stats card.

---

## Google Fonts Import (all templates)

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Always use `waitUntil: 'networkidle0'` in Puppeteer to ensure fonts are loaded before screenshotting.

---

## Production Notes

- **Local**: `puppeteer` (full, bundles Chromium)
- **Vercel**: Switch to `puppeteer-core` + `@sparticuz/chromium-min` (~50MB, fits 250MB function limit)
- **Cold starts**: ~3–5s on Vercel. Acceptable for async queue, not for real-time API
- **Font loading**: Google Fonts fetch adds ~500ms. Acceptable with `networkidle0`
- **JPEG quality**: 92% on final output for posting (PNG for storage/blob)
