/**
 * Wednesday pick reveal — renders the pick-reveal card from current-pick.json
 * and posts to X (with image + link) and optionally Instagram.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-wednesday-picks.ts
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })
}

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { publish, tgNotify } from '../lib/publisher'

const ROOT      = path.join(__dirname, '../../')
const PICK_PATH = path.join(ROOT, 'current-pick.json')

const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the bet itself — player, bet type, odds. That is the news.
2. One sentence max of reasoning, pulled directly from the data provided
3. Tone: confident, direct, understated. No hype, no exclamation points
4. Twitter: under 200 chars (link will be appended separately)
5. Instagram: 2–3 sentences + "Full breakdown at divotlab.com/picks — link in bio." + 3 hashtags
6. Never say "lock", "fire", "can't miss", "huge value"

Return JSON only: { "twitter_tweet": "...", "instagram_caption": "...", "hashtags": ["#Golf", ...] }`

async function generateCaptions(
  player: string, betType: string, odds: string, book: string,
  reasoning: string, confidence: string, eventName: string
): Promise<{ tweet: string; ig: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const data = `Event: ${eventName}\nPick: ${player} ${betType} ${odds} @ ${book}\nConfidence: ${confidence}\nReasoning: ${reasoning}`

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: data }],
  })

  const raw   = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON from Claude')
  const parsed = JSON.parse(match[0]) as { twitter_tweet?: string; instagram_caption?: string; hashtags?: string[] }
  const hashtags = (parsed.hashtags ?? []).slice(0, 3).join(' ')
  return {
    tweet: parsed.twitter_tweet ?? '',
    ig:    parsed.instagram_caption ? `${parsed.instagram_caption}\n\n${hashtags}` : '',
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  if (!fs.existsSync(PICK_PATH)) throw new Error('current-pick.json not found')

  const data = JSON.parse(fs.readFileSync(PICK_PATH, 'utf8')) as {
    tournament: string
    week_of:    string
    published:  string
    pick: {
      player:      string
      bet_type:    string
      bet_detail:  string | null
      odds:        string
      book:        string
      reasoning:   string
      confidence:  string
      result:      string | null
      result_detail: string | null
    }
    teaser: string
  }

  const pick = data.pick

  // Freshness guard — warn if pick is older than 3 days
  const pickAge = (Date.now() - new Date(data.published).getTime()) / (1000 * 60 * 60 * 24)
  if (pickAge > 3) {
    throw new Error(`current-pick.json was published ${data.published} (${Math.round(pickAge)} days ago). Update it in admin.html first, then re-run.`)
  }
  if (pick.result !== null) {
    throw new Error(`This pick already has a result (${pick.result}). It looks like last week's pick. Update current-pick.json in admin.html first.`)
  }

  console.log(`Tournament: ${data.tournament}`)
  console.log(`Pick:       ${pick.player} ${pick.bet_type} ${pick.odds} @ ${pick.book}`)
  console.log(`Confidence: ${pick.confidence}`)

  // Confidence CSS class
  const confClass = pick.confidence.toLowerCase() === 'high' ? 'high'
    : pick.confidence.toLowerCase() === 'medium' ? 'medium'
    : 'low'

  // Bet type display (uppercase)
  const betTypeDisplay = pick.bet_detail
    ? `${pick.bet_type} · ${pick.bet_detail}`
    : pick.bet_type

  // Render card
  console.log('\nRendering pick-reveal card...')
  const { renderHtmlTemplate } = await import('../lib/renderHtml')
  const fields: Record<string, string> = {
    BADGE:             'Free Pick',
    EVENT_NAME:        data.tournament,
    PLAYER_NAME:       pick.player,
    BET_TYPE:          betTypeDisplay.toUpperCase(),
    ODDS:              pick.odds,
    BOOK:              pick.book,
    CONFIDENCE:        pick.confidence.toUpperCase(),
    CONFIDENCE_CLASS:  confClass,
    REASONING:         pick.reasoning,
  }
  const pngBuf = await renderHtmlTemplate('pick-reveal', fields, { height: 1350 })
  console.log(`✓ Card: ${(pngBuf.length / 1024).toFixed(0)} KB`)

  // Generate captions
  console.log('\nGenerating captions...')
  const captions = await generateCaptions(
    pick.player, betTypeDisplay, pick.odds, pick.book,
    pick.reasoning, pick.confidence, data.tournament
  )
  console.log(`Tweet (${captions.tweet.length}): ${captions.tweet}`)

  const tgPreview = [
    `<b>${data.tournament}</b>  ·  ${data.week_of}`,
    `Pick: <b>${pick.player} ${betTypeDisplay} ${pick.odds}</b> @ ${pick.book}`,
    `Confidence: ${pick.confidence}`,
    pick.reasoning,
  ].join('\n')

  await publish({
    pngBuf,
    tweet:     captions.tweet,
    igCaption: captions.ig,
    tgPreview,
    label:     `Wednesday Pick · ${pick.player} ${pick.odds}`,
    link:      'divotlab.com/picks',
  })
}

main().catch(async err => {
  console.error('✗', (err as Error).message)
  await tgNotify(`❌ post-wednesday-picks failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
  process.exit(1)
})
