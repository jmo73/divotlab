/**
 * Caption generation and regeneration via Claude API.
 * Read CAPTIONS.md before modifying any prompt here.
 *
 * Two-level prompt system:
 *   1. System prompt — brand voice, never changes
 *   2. User prompt  — trigger-specific, injects real data + context summary
 *
 * On Claude API failure: retry once, then return FALLBACK_CAPTIONS.
 * Fallback captions are flagged in the Telegram message.
 */

import Anthropic from '@anthropic-ai/sdk'
import { config } from './config'
import { buildContextSummary, type PostContext } from './enrichment'
import type { TriggerType, LiveLeaderboardData, EditPlatform } from './types'

const client = new Anthropic({ apiKey: config.anthropic.apiKey })

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 512

// ─── System prompts ───────────────────────────────────────────────────────────

const BRAND_VOICE_SYSTEM = `You are the voice of Divot Lab — a data-driven golf analytics brand.

Tone: analytical, precise, premium. Bloomberg for golf, not ESPN.

Rules you never break:
- No exclamation points. Ever.
- Lead with the data point or finding, not narrative setup
- Short punchy sentences — max 2 clauses each
- Every number needs a comparison, baseline, or interpretation alongside it
- Never claim field-wide superlatives ("best in the field") unless explicitly marked as verified
- Always credit DataGolf for derived metrics
- No hype words: incredible, unbelievable, stunning, amazing, on fire, dominant
- No filler: "it's worth noting that", "interestingly", "at the end of the day"
- No rhetorical questions as openers
- Sound like a knowledgeable analyst, not a fan account

Weather context: only mention conditions if they explain a scoring pattern or create an analytical angle. Never mention weather as small talk.

For major tournaments (The Masters, US Open, The Open, PGA Championship): add weight and historical context. These posts should feel slightly more significant than standard event posts.

Output ONLY the caption text. No preamble, no quotes around output, no explanation.`

const EDIT_REGEN_SYSTEM = `You are editing a social media caption for Divot Lab, a data-driven golf analytics brand.

You will receive:
- The current caption
- The original data that informed it
- The original context object
- An edit instruction from the operator

Rules:
- Apply the edit instruction precisely
- Do not change anything not mentioned in the instruction
- If the instruction corrects a specific number, use the corrected number — do not re-derive it from the data
- If the instruction asks to remove something, remove only that
- If the instruction asks to shorten, cut the least informative content first
- Maintain brand voice: data-first, no exclamation points, short punchy sentences
- Maintain all DataGolf attribution

Output ONLY the revised caption. No preamble, no explanation.`

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatScore(score: number): string {
  if (score === 0) return 'E'
  return score > 0 ? `+${score}` : `${score}`
}

function formatSG(sg: number): string {
  return `${sg >= 0 ? '+' : ''}${sg.toFixed(1)}`
}

function getEventHashtag(eventName: string): string {
  return eventName.replace(/[^a-zA-Z0-9]/g, '')
}

function xHashtags(eventName: string): string {
  return `#PGATour #${getEventHashtag(eventName)} #GolfAnalytics`
}

function igHashtags(eventName: string): string {
  return `#PGATour #${getEventHashtag(eventName)} #GolfAnalytics #DivotLab #DataGolf #GolfBetting #GolfStats #SGTotal #FantasyGolf #GolfTwitter`
}

// ─── Core generation ──────────────────────────────────────────────────────────

async function generate(userPrompt: string): Promise<string> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: BRAND_VOICE_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })
  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('Unexpected Claude response type')
  return block.text.trim()
}

async function generateWithRetry(userPrompt: string): Promise<{ caption: string; usedFallback: boolean }> {
  try {
    return { caption: await generate(userPrompt), usedFallback: false }
  } catch {
    try {
      return { caption: await generate(userPrompt), usedFallback: false }
    } catch {
      return { caption: '', usedFallback: true }
    }
  }
}

// ─── Trigger-specific user prompts ───────────────────────────────────────────

type Platform = 'twitter' | 'instagram'

interface CaptionRequest {
  triggerType: TriggerType
  platform: Platform
  context: PostContext
  data: Record<string, unknown>
}

function buildUserPrompt(req: CaptionRequest): string {
  const { triggerType, platform, context, data } = req
  const charLimit = platform === 'twitter' ? 260 : 800
  const contextSummary = buildContextSummary(context)
  const eventName = context.tournament.name
  const footer = platform === 'twitter'
    ? `Include "via @DataGolf" and end with: divotlab.com\nHashtags (2-3 max): ${xHashtags(eventName)}`
    : `End with "Full breakdown at the link in bio."\nHashtags: ${igHashtags(eventName)}`

  switch (triggerType) {
    case 'live_leaderboard_r1_end':
    case 'live_leaderboard_r2_end':
    case 'live_leaderboard_r3_end': {
      const d = data as unknown as LiveLeaderboardData
      const roundNum = triggerType === 'live_leaderboard_r1_end' ? 1 : triggerType === 'live_leaderboard_r2_end' ? 2 : 3
      const leaderboard = (d.top5 ?? []).map((p, i) =>
        `${i + 1}. ${p.playerName}: ${formatScore(p.score)} | DG Rating: ${p.dg_rating ?? '—'} (${p.dgRatingPercentile ?? '—'}th pct) | SG Total: ${p.sg_total != null ? formatSG(p.sg_total) : '—'}`
      ).join('\n')
      return `Write a ${platform} caption for: R${roundNum} leaderboard complete at ${eventName}

Character limit: ${charLimit}
Event tier: ${context.tournament.tier}

LEADERBOARD DATA:
${leaderboard}

Field avg score today: ${formatScore(d.fieldAvgScore ?? 0)} (historical avg: ${formatScore(context.tournament.historicalScoringAvg)})
Pre-tournament model pick: ${d.modelTopPick?.playerName ?? 'Unknown'} — currently ${d.modelTopPick?.currentPosition != null ? `T${d.modelTopPick.currentPosition}` : 'unknown'}

CONTEXT:
${contextSummary}

${footer}`
    }

    case 'live_leaderboard_final': {
      const d = data as {
        winner: { playerName: string; finalScore: number; sg_total_tournament?: number; dg_rating?: number }
        modelTopPick: { playerName: string; finalPosition: number }
        modelCorrect: boolean
        fieldAvgScore?: number
      }
      const modelNote = d.modelCorrect
        ? 'Model was correct: acknowledge matter-of-factly. Do not gloat.'
        : 'Model was wrong: acknowledge matter-of-factly. What did the model miss?'
      const majorNote = context.tournament.tier === 'major'
        ? 'This is a major championship result — add appropriate historical weight.'
        : ''
      return `Write a ${platform} caption for: Tournament final result — ${eventName}

Character limit: ${charLimit}
Event tier: ${context.tournament.tier}

RESULT:
Winner: ${d.winner.playerName}, ${formatScore(d.winner.finalScore)}
Winner SG Total (tournament): ${d.winner.sg_total_tournament != null ? formatSG(d.winner.sg_total_tournament) : '—'}
Winner DG Rating: ${d.winner.dg_rating ?? '—'}

Pre-tournament top pick: ${d.modelTopPick.playerName} — finished T${d.modelTopPick.finalPosition}
${modelNote}
${majorNote}

CONTEXT:
${contextSummary}

${footer}`
    }

    case 'mid_round_mover': {
      const d = data as {
        playerName: string
        positionStart: number
        positionNow: number
        roundScore: number
        sg_approach_round?: number
        sg_putting_round?: number
        dg_rating?: number
        dgRatingPercentile?: number
        courseHistoryAvgFinish?: number
      }
      return `Write an X-only caption for: Player moving up the leaderboard mid-round

Character limit: 240

PLAYER DATA:
Player: ${d.playerName}
Started round at: T${d.positionStart}
Currently: T${d.positionNow}
Current round score: ${formatScore(d.roundScore)}
SG Approach this round: ${d.sg_approach_round != null ? formatSG(d.sg_approach_round) : 'not available'}
SG Putting this round: ${d.sg_putting_round != null ? formatSG(d.sg_putting_round) : 'not available'}
DG Rating: ${d.dg_rating ?? '—'} (${d.dgRatingPercentile ?? '—'}th percentile)
Historical avg finish at this course: T${d.courseHistoryAvgFinish ?? '—'}

CONTEXT:
${contextSummary}

Keep it under 5 sentences. Lead with the move. One data point explains the mechanism.
Include "via @DataGolf" at the end.`
    }

    case 'cut_bubble_alert': {
      const d = data as { cutLine: number; players: Array<{ playerName: string; score: number; holesPlayed: number }> }
      const playerList = d.players.slice(0, 5).map(p =>
        `${p.playerName}: ${formatScore(p.score)} (thru ${p.holesPlayed})`
      ).join('\n')
      return `Write a ${platform} caption for: Cut line alert — notable players on the bubble

Character limit: ${charLimit}
Event: ${eventName}

CUT LINE DATA:
Projected cut: ${formatScore(d.cutLine)}

Players on the bubble:
${playerList}

CONTEXT:
${contextSummary}

Frame analytically. Why does it matter which of these players make/miss? DG rating context.
${footer}`
    }

    case 'weather_angle': {
      const d = data as {
        roundNumber: number
        roundDate: string
        expectedScoreImpact?: string
        playersWhoExcelInWind?: Array<{ playerName: string; windConditionRecord: string }>
      }
      const windPlayers = (d.playersWhoExcelInWind ?? []).map(p =>
        `${p.playerName}: ${p.windConditionRecord}`
      ).join('\n')
      return `Write a ${platform} caption for: Notable weather conditions pre-round

Character limit: ${charLimit}

WEATHER DATA:
Event: ${eventName}
Round: ${d.roundNumber} — ${d.roundDate}
Wind: ${context.weather.windSpeedMph}mph ${context.weather.windDirection}
Temp: ${context.weather.tempF}°F
Precip chance: ${context.weather.precipChance}%
Conditions flag: ${context.weather.conditionsFlag}
${d.expectedScoreImpact ? `Expected scoring impact: ${d.expectedScoreImpact}` : ''}

Players who tend to excel in these conditions:
${windPlayers || 'Data not available'}

CONTEXT:
${contextSummary}

Frame as analytical context, not weather reporting.
The conditions should explain what to expect from the round.
Do not write "it's going to be windy today" — write why that matters to scoring and who benefits.
${footer}`
    }

    case 'pre_tournament_model_picks': {
      const d = data as {
        picks: Array<{ playerName: string; winProbability: number; courseFitScore: number; keyStrength: string }>
        darkHorse: { playerName: string; reason: string }
      }
      const picks = d.picks.slice(0, 3).map((p, i) =>
        `${i + 1}. ${p.playerName} — ${p.winProbability}% win probability, Course Fit: ${p.courseFitScore}/100\n   Key strength: ${p.keyStrength}`
      ).join('\n')
      return `Write a ${platform} caption for: Pre-tournament model picks — ${eventName}

Character limit: ${charLimit}
Event tier: ${context.tournament.tier}

MODEL DATA:
Course: ${context.tournament.course}
Field strength: ${context.tournament.fieldStrengthRank}/50

Top 3 picks:
${picks}

Dark horse: ${d.darkHorse.playerName} — ${d.darkHorse.reason}

CONTEXT:
${contextSummary}

Frame as the model's analytical view, not a tip sheet.
Do not say "we like" or "our pick" — say "the model" or "the numbers favor."
${platform === 'instagram' ? 'End with: Full model breakdown at the link in bio.' : ''}
${footer}`
    }

    case 'post_round_sleeper': {
      const d = data as {
        playerName: string
        position: number
        score: number
        dg_rating?: number
        dgRatingPercentile?: number
        courseFitScore?: number
        sg_total_round?: number
        courseHistoryAvgFinish?: number
        recentFormTrend?: string
      }
      return `Write a ${platform} caption for: Player worth watching — data angle

Character limit: ${charLimit}

PLAYER DATA:
Player: ${d.playerName}
Current position: T${d.position}
Current score: ${formatScore(d.score)}
DG Rating: ${d.dg_rating ?? '—'} (${d.dgRatingPercentile ?? '—'}th percentile in field)
Course Fit Score: ${d.courseFitScore ?? '—'}/100
SG Total this round: ${d.sg_total_round != null ? formatSG(d.sg_total_round) : '—'}
Course history avg finish: T${d.courseHistoryAvgFinish ?? '—'}
Recent form trend: ${d.recentFormTrend ?? 'stable'}

CONTEXT:
${contextSummary}

Do not use the word "sleeper" in the caption.
Do not say "keep an eye on" or "don't sleep on."
Lead with the data that makes this player interesting, not their position.
${footer}`
    }

    case 'comparison_spotlight': {
      const d = data as {
        comparisonAngle: string
        playerA: { name: string; score: number; position: string; sg_total_round?: number; sg_approach_round?: number; dg_rating?: number }
        playerB: { name: string; score: number; position: string; sg_total_round?: number; sg_approach_round?: number; dg_rating?: number }
      }
      return `Write a ${platform} caption for: Head-to-head player comparison

Character limit: ${charLimit}

COMPARISON DATA:
Event: ${eventName}
Comparison angle: ${d.comparisonAngle}

Player A: ${d.playerA.name}
- Score: ${formatScore(d.playerA.score)} (${d.playerA.position})
- SG Total: ${d.playerA.sg_total_round != null ? formatSG(d.playerA.sg_total_round) : '—'}
- SG Approach: ${d.playerA.sg_approach_round != null ? formatSG(d.playerA.sg_approach_round) : '—'}
- DG Rating: ${d.playerA.dg_rating ?? '—'}

Player B: ${d.playerB.name}
- Score: ${formatScore(d.playerB.score)} (${d.playerB.position})
- SG Total: ${d.playerB.sg_total_round != null ? formatSG(d.playerB.sg_total_round) : '—'}
- SG Approach: ${d.playerB.sg_approach_round != null ? formatSG(d.playerB.sg_approach_round) : '—'}
- DG Rating: ${d.playerB.dg_rating ?? '—'}

CONTEXT:
${contextSummary}

The contrast between them is the story. What do the numbers explain about the gap?
Do not just list their stats — find the analytical insight the comparison reveals.
${footer}`
    }

    default:
      return `Write a ${platform} golf analytics caption for Divot Lab.

Event: ${eventName}
Character limit: ${charLimit}

CONTEXT:
${contextSummary}

Data-first, analytical tone. No exclamation points.
${footer}`
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GeneratedCaptions {
  captionX: string
  captionIG: string
  usedFallback: boolean
}

/**
 * Generate both platform captions for a trigger.
 * Runs sequentially (not parallel) to stay within API rate limits.
 */
export async function generateCaptions(
  triggerType: TriggerType,
  context: PostContext,
  data: Record<string, unknown>
): Promise<GeneratedCaptions> {
  const xPrompt = buildUserPrompt({ triggerType, platform: 'twitter', context, data })
  const igPrompt = buildUserPrompt({ triggerType, platform: 'instagram', context, data })

  const [xResult, igResult] = await Promise.all([
    generateWithRetry(xPrompt),
    generateWithRetry(igPrompt),
  ])

  const usedFallback = xResult.usedFallback || igResult.usedFallback

  return {
    captionX:  xResult.usedFallback  ? buildFallbackCaption(triggerType, 'twitter', data)  : xResult.caption,
    captionIG: igResult.usedFallback ? buildFallbackCaption(triggerType, 'instagram', data) : igResult.caption,
    usedFallback,
  }
}

/**
 * Regenerate a single caption given an edit instruction.
 * Used by the Telegram edit flow — never re-fetches data.
 */
export async function regenerateCaption(params: {
  currentCaption: string
  rawData: Record<string, unknown>
  context: PostContext
  editInstruction: string
  platform: EditPlatform
}): Promise<{ caption: string; usedFallback: boolean }> {
  const { currentCaption, rawData, context, editInstruction, platform } = params
  const contextSummary = buildContextSummary(context)

  const platformLabel = platform === 'twitter' ? 'X (Twitter)' : platform === 'instagram' ? 'Instagram' : 'both platforms'

  const prompt = `Edit this ${platformLabel} caption for Divot Lab.

CURRENT CAPTION:
${currentCaption}

EDIT INSTRUCTION:
${editInstruction}

ORIGINAL DATA:
${JSON.stringify(rawData, null, 2).slice(0, 1500)}

CONTEXT:
${contextSummary}

Apply the edit precisely. Do not change anything not mentioned in the instruction.
Maintain brand voice: data-first, no exclamation points, short punchy sentences.
Output ONLY the revised caption.`

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: EDIT_REGEN_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = msg.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type')
    return { caption: block.text.trim(), usedFallback: false }
  } catch {
    return { caption: currentCaption, usedFallback: true }
  }
}

/**
 * Generate evergreen captions at seed time.
 * Returns JSON with both platform captions.
 */
export async function generateEvergreenCaptions(params: {
  topic: string
  triggerType: TriggerType
  keyInsight: string
  primaryStat: string
  supportingContext: string
}): Promise<{ captionX: string; captionIG: string }> {
  const { topic, triggerType, keyInsight, primaryStat, supportingContext } = params

  const prompt = `Write X and Instagram captions for this evergreen golf analytics post.

Topic: ${topic}
Content type: ${triggerType}
Key insight: ${keyInsight}
Primary stat: ${primaryStat}
Supporting context: ${supportingContext}

BRAND VOICE: Data-first, no exclamation points, short punchy sentences.
Every number needs a comparison or context.
Lead with what's surprising or counterintuitive.
No hype words.

X caption: max 260 chars + 2-3 hashtags. End with divotlab.com
Instagram caption: up to 600 chars + 8-10 hashtags at end.

Output as JSON:
{
  "caption_x": "...",
  "caption_ig": "..."
}`

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: BRAND_VOICE_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')

  try {
    const parsed = JSON.parse(block.text.trim()) as { caption_x: string; caption_ig: string }
    return { captionX: parsed.caption_x, captionIG: parsed.caption_ig }
  } catch {
    // If JSON parse fails, use the raw text for both platforms
    return { captionX: block.text.trim(), captionIG: block.text.trim() }
  }
}

// ─── Fallback captions ────────────────────────────────────────────────────────

function buildFallbackCaption(
  triggerType: TriggerType,
  platform: Platform,
  data: Record<string, unknown>
): string {
  const p1 = (data.top5 as Array<{ playerName: string; score: number }> | undefined)?.[0]
  const eventName = (data.eventName as string | undefined) ?? 'this week\'s event'
  const tag = platform === 'twitter' ? 'divotlab.com via @DataGolf #PGATour' : 'Full breakdown at the link in bio. via @DataGolf\n#PGATour #GolfAnalytics #DivotLab'

  switch (triggerType) {
    case 'live_leaderboard_r1_end':
      return p1
        ? `${p1.playerName} leads ${eventName} after R1 at ${formatScore(p1.score)}. ${tag}`
        : `R1 complete at ${eventName}. ${tag}`
    case 'live_leaderboard_r2_end':
      return p1
        ? `${p1.playerName} leads ${eventName} through 36 holes at ${formatScore(p1.score)}. ${tag}`
        : `R2 complete at ${eventName}. ${tag}`
    case 'live_leaderboard_r3_end':
      return p1
        ? `${p1.playerName} holds the 54-hole lead at ${eventName} at ${formatScore(p1.score)}. ${tag}`
        : `R3 complete at ${eventName}. ${tag}`
    case 'live_leaderboard_final': {
      const w = data.winner as { playerName: string; finalScore: number } | undefined
      return w
        ? `${w.playerName} wins ${eventName} at ${formatScore(w.finalScore)}. ${tag}`
        : `${eventName} complete. ${tag}`
    }
    default:
      return `${eventName} — ${tag}`
  }
}
