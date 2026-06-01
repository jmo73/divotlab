# Divot Lab Intelligence Report — Plan

## What This Is

A professional-grade analytical research brief — not a newsletter, not a blog post. Structured like a consulting deliverable. Sold as a standalone product and used as a portfolio piece for strategy/AI/analyst roles.

**Why it works:**
- You have DataGolf API (annual tier) — historical SG, course data, odds. Most people don't have this.
- Combined with build skills + design quality + analytical framework = hard to replicate
- Creates a verifiable, public track record of predictions and outcomes
- Positions Divot Lab as a research operation, not just a picks account

---

## First Report — Topic

**"10 Events In: How Well Does Our Course-Fit Model Actually Predict Results?"**

A mid-season model audit. Honest, transparent, methodologically rigorous.

**Why this topic first:**
- Data already exists (your own picks + outcomes for 10 events)
- Shows intellectual honesty — you're auditing your own model
- Creates a credibility foundation before going bigger
- Answerable in one focused week

---

## Format

**Delivery:** Web page first (no download friction, shareable URL, better SEO). CSS print styles for PDF savability.

**Page structure:**
1. Masthead — Divot Lab branding, report title, date, "Vol. 1"
2. Executive Summary — 3 bullet findings, ~100 words
3. Methodology — 150 words. What data was used, how the model works. This is what makes it credible.
4. Findings — 3–4 sections, each with a headline stating the finding plainly, a chart, and 200–300 words
5. Where the Model Missed — honest section on failures and why
6. Implications — what this means for the rest of the season
7. About the Model — brief explainer, link to Pro dashboard

**Design:** Existing Divot Lab tokens. Dark background, JetBrains Mono for data, Cormorant Garamond for headers. Looks like a Bloomberg brief, not a blog. 2–3 charts total — scatter plot of fit rank vs. actual finish, table of over/underperformance by course type.

**Gate:** First report is FREE with email capture. No Stripe friction. Goal is list-building and format validation. Subsequent reports and the Annual State of the Game (January) are paid ($9.99–$19.99).

---

## Production Workflow

### Step 1 — Pull and Structure Data (Day 1)
- Export all 10 events: your course-fit scores for relevant players + actual finishes
- Add DataGolf historical data for those players at those course types
- Output: a clean facts document — every number you'll use, verified before writing

### Step 2 — Find the Findings (Days 1–2)
Look for what's genuinely surprising:
- What did the model get right that nobody expected?
- Where did it consistently fail, and is there a pattern?
- Example: "Players ranked 1–5 for course fit finished top 20 at 60% rate — but only when field was 120+ players"
- Example: "Model consistently overrates ball-strikers at bermuda courses"

Target: 3–4 genuine findings, not just "the model is pretty good."

### Step 3 — Write With the Facts-First Claude Workflow (Days 3–4)
Never let Claude generate facts. Feed it verified data, then ask for prose.

**Prompt template:**
```
You are writing a golf analytics research brief for Divot Lab.
Voice: precise, confident, analytical — like a sports statistician 
writing for a sophisticated audience. No hype. No hedging. 
State what the data shows.

Here are the verified facts for this section: [paste data]

Write 200 words analyzing what this data shows. 
Use only the numbers I've provided. Do not invent statistics.
```

Edit output for accuracy and voice. Claude handles the prose. You own the facts.

### Step 4 — Charts (Day 5)
- Scatter plot: course-fit rank vs. actual finish position
- Table: model performance by course type (over/underperform)
- Optional: hit rate by confidence tier (High/Medium/Low picks)
Use existing DataGolf data + JS charting already in the stack.

### Step 5 — Build the Page (Day 6)
Reuse Divot Lab design system. New page type in the root. Email gate via existing Beehiiv subscribe endpoint.

### Step 6 — Write Distribution Assets (Day 7)
- 6-tweet Twitter thread (lead with the finding, not the link)
- LinkedIn post (career/portfolio framing)
- Reddit post for r/golf and r/pga (write actual content, mention report at end)
- 5 direct outreach emails

### Step 7 — Launch (Day 8)
Post everything same day for momentum.

---

## Distribution Plan

**The principle:** Lead with the finding, not the link. Nobody clicks "check out my report." They engage with interesting data.

### Twitter/X Thread (highest priority)
- 6 tweets giving away the most interesting finding in full
- Charts included in the thread
- Final tweet links to full report
- If the finding is genuinely surprising, DataGolf/No Laying Up/golf analytics accounts share it and you get reach you couldn't buy

### Reddit
- Post on r/golf and r/pga as text content — not a link post
- 3 paragraphs + key chart, mention full report at end
- Golf subreddits respond well to data if you don't lead with self-promotion

### Direct Outreach (5 specific people)
Not mass email. Five targeted messages:
- 2–3 golf coaches with Twitter/Instagram followings
- 1 golf media writer (No Laying Up contact form, The Fried Egg)
- 1 person at DataGolf

Template: "I published original research using DataGolf data analyzing model accuracy across 10 events. Here's the most interesting finding. Full brief is here. Thought it might be interesting to you."

### LinkedIn Post
Frame from the career angle: "I've been building a golf analytics brand as a side project. Published the first research brief this week analyzing how well a course-fit model actually predicts tournament results. Here's what I found."

Reaches hiring managers directly. More career traction than 10 resume line items.

### Email Existing Subscribers
Send as a special edition — not the regular newsletter. "Something different this week."

---

## Timeline

| Day | Task |
|-----|------|
| 1   | Pull and structure all data, build facts document |
| 2–3 | Find 3–4 key findings, sketch the narrative |
| 4–5 | Write each section using Claude workflow, edit |
| 6   | Build the page, create charts |
| 7   | Write Twitter thread, LinkedIn post, Reddit post |
| 8   | Launch — post everything same day |

---

## The Bigger Picture

This first brief validates the format. If it gets traction:
- Subsequent briefs are paid ($9.99 each)
- **January 2026/2027: Annual State of the Game Report** — 30–40 page data breakdown of the full season. $14.99–$19.99 one-time. The crown jewel portfolio piece.
- **B2B tier**: The Lab Report for coaches/content creators. Same content, different framing. $29–49/mo.

The career portfolio angle: a published research operation with paying subscribers, a methodology page, and a public prediction track record is what gets you noticed by sports analytics firms, consulting firms, and strategy roles. "I built a golf analytics brand" is a resume line. An actual published research brief with an audience is evidence.

---

## Notes
- First report: free with email gate
- Style guide for Claude editorial sessions lives in `lab-notes/CLAUDE.md`
- Annual report target: January 2027
- B2B outreach can start after first report publishes
