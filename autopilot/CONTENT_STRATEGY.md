# Divot Lab — Content Strategy & Caption Guide

This is the playbook for every piece of content the autopilot generates. Claude reads this when writing captions. Humans use this to evaluate draft posts before approving.

---

## The Voice

**Who we are:** A serious golf analytics operation. Not a picks service. Not a betting tipster. A data company that happens to publish picks. The difference matters in every sentence.

**Tone:** Confident, specific, and understated. The Athletic, not ESPN. Cite numbers, let them speak. Never hype, never hedge without reason.

**What this sounds like:**
- ✅ "Hovland's gained 2.3 strokes on approach through 36 holes. The model had him at 12% to win before the round — he's now 31%."
- ✅ "Colonial rewards approach and putting. Clark is top-5 in both over the last 24 rounds."
- ❌ "He is ON FIRE this week 🔥🔥🔥"
- ❌ "Could this be his week?? 👀"
- ❌ "Our model LOVES this pick"

**What we never say:**
- "Lock" / "can't miss" / "guaranteed"
- "He's due" (recency fallacy)
- "Field is wide open this week" (lazy take)
- Anything we can't back with a number

---

## Post-Worthiness: When to Trigger a Post

Not every data point deserves a card. Before generating, score the moment:

### During a tournament round (leaderboard card or text tweet)
Post if ANY of the following is true:
- A **Divot Lab pick is in the top 10** (always post)
- The leader is **3+ under par ahead** of the field (dominant round developing)
- A player just **moved 5+ positions** in the last 9 holes
- A player is posting a **historic SG round** (top 3 in field, +3.5 SG or higher)
- A 54-hole leader is **pulling away or collapsing** on Sunday

Skip if:
- The leaderboard is bunched with 12 players within 2 shots and nothing is happening
- We have no picks in contention and no data story
- It's a Tuesday/Wednesday practice round

### Pre-tournament (course profile, weather card)
- Course profile: once per event, Wednesday morning or after field is announced
- Weather card: only if forecast shows 20+ mph winds OR significant rain during a round

### Post-result (pick result card or recap text)
- Post pick result cards on Sunday evening after the tournament ends
- If a pick wins, post **within 2 hours** — recency matters for engagement
- If a brutal miss (0-for-5 week), post a brief honest recap — accountability builds trust

### Evergreen / off-week (text tweet)
- Mon–Wed: 1 tweet/day from the queue or data take from recent events
- Off-weeks (no PGA Tour): drop to 3–4/week from evergreen queue

---

## Caption Structure

Every caption follows this pattern. Don't deviate.

```
[Data hook — the most surprising/interesting number, NOT tournament name]
[1-2 sentences of context or implication]
[CTA]
```

**Data hook examples (lead with this):**
- "+4.1 SG: Total through 36 holes. That's the best two-round ball-striking performance at River Highlands since 2019."
- "The model had Burns at -22% EV this week at Colonial. Fade in full effect."
- "28 mph winds forecast for round 2. These conditions typically add 2–3 shots to the field average."

**CTA options (pick the most relevant):**
- When a pick is in play: "Full card in Lab Notes Pro — link in bio."
- When sharing a data stat: "More in Lab Notes this week — link in bio."
- On a win: "Track record updated. 55% hit rate, +30% ROI this season — link in bio."
- On a course profile: "Course-fit rankings now live — link in bio."

**Length:**
- Instagram: 2–4 sentences + hashtags (keep caption to ~150 chars before tags)
- X/Twitter: 1–2 sentences MAX. If it needs more, it's two tweets.

---

## Platform Rules

### Instagram
- Lead with the strongest visual stat — the caption supports the image, not the other way around
- Hashtags go at the end, separated by a line break
- Don't repeat information already obvious in the card
- Stories > Feed for in-round updates; Feed for polished cards

### X / Twitter
- The tweet IS the content — no image means the text has to carry everything
- Be specific enough that a golf fan learns something in one read
- Engage with tournament hashtags during rounds (#TravelersChampionship etc.)
- First sentence must work as a standalone if the rest gets cut

---

## Platform Constraints (hard limits)

### X / Twitter
- **280 character hard limit** — target 240 to leave room for a link added at post time
- **URLs count as 23 characters** regardless of actual length — do not include URLs in caption text
- **0 hashtags in tweet body** — hashtags suppress organic reach on X; never include them in the main tweet
- 1–2 sentences maximum
- Images: JPEG/PNG, max 5MB, up to 4 per tweet (we post 1)

### Instagram
- **2,200 character caption limit** — keep under 300 words in practice
- **3–5 hashtags maximum** — Instagram's algorithm penalizes 10+ hashtags; 3–5 targeted ones outperform 20 generic ones
- Hashtags go at the very end on their own line, after the CTA
- Images: JPEG only (PNG is converted), max 8MB, 1080×1350 (4:5) is our format
- Stories are separate from feed — not automated

### Hashtag List (pick 3–5 per post)

**Always available:**
`#Golf` `#PGATour` `#GolfTwitter` `#GolfAnalytics` `#DataDrivenGolf`

**Situation-dependent:**
`#GolfBetting` `#GolfPicks` — only on picks/result cards
`#GolfDFS` — only on DFS content
`#DivotLab` — on milestone or brand posts

**Always add:**
Tournament-specific tag: `#TravelersChampionship`, `#TheOpen`, `#PGAChampionship` etc.

---

## Claude Captioner System Prompt

Use this as the system prompt when calling the Claude API to generate captions:

```
You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Your job is to write social media captions for data cards (leaderboard, player spotlight, course profile, weather, pick results). 

Rules:
1. Lead with the most surprising or data-rich observation — never with the tournament name
2. Every claim must be supported by a number already in the card data
3. Do not invent statistics, percentages, or comparisons not in the provided data
4. Tone: confident, specific, understated. Think "The Athletic" not "ESPN Bottom Line"
5. Never use: "lock", "can't miss", "fire", "huge", "massive", "on fire", hype language, or question-mark hooks ("could this be his week??")
6. Instagram caption: 2–4 sentences + hashtags. Twitter: 1–2 sentences, no hashtags.
7. End Instagram captions with one of these CTAs: "Full card in Lab Notes Pro — link in bio." / "More in this week's Lab Notes — link in bio." / "Track record + picks at divotlab.com"

Return JSON: { "instagram_caption": "...", "twitter_tweet": "...", "hashtags": ["#Golf", ...] }

Card data: {{CARD_DATA_JSON}}
```

---

## Post Quality Checklist

Before approving in Telegram, verify:
- [ ] Every number in the caption matches the card
- [ ] No hollow phrases ("playing well", "in great form", "exciting week")
- [ ] The post would teach a golf fan something they didn't already know
- [ ] If a pick is mentioned, result/status is accurate
- [ ] CTA is present and correct for the content type
- [ ] Hashtags include tournament name if tournament is live

---

## What Makes Divot Lab Posts Different

Most golf social content is either (a) score updates anyone could get from ESPN or (b) vague pick hype. We win by being the third option: **quantified insight, published fast, with accountability**.

The goal of every post is that a serious golf fan reads it and thinks: *I didn't know that, and it makes me want to know more.*
