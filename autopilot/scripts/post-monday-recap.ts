/**
 * Monday recap — text-only post summarizing last week's picks results.
 * Reads season-tracker.json (last weekly_picks entry + season totals).
 * No API calls needed. Text only — fast to run.
 *
 * Run from /autopilot:
 *   npx tsx scripts/post-monday-recap.ts
 */

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env.local') })
}

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { publish, tgNotify } from '../lib/publisher'

const ROOT = path.join(__dirname, '../../')
const TRACKER_PATH = path.join(ROOT, 'lab-notes/lab-picks/season-tracker.json')

const SYSTEM_PROMPT = `You are the caption writer for Divot Lab, a data-driven golf analytics brand.

Rules:
1. Lead with the most specific observation — the number, the result, the anomaly
2. Tone: confident, specific, understated. Think "The Athletic" not "ESPN Bottom Line"
3. Never use hype language, exclamation points, or engagement-bait hooks
4. Twitter: 1–3 sentences MAX, no hashtags, no emojis, under 240 chars
5. If it was a bad week, be honest and specific about what went wrong — that builds trust
6. Season record goes at the end of the tweet, not the start
7. One sentence max on what's next (optional)

Return JSON only: { "twitter_tweet": "..." }`

interface WeeklyPick {
  player: string
  bet: string
  odds: number
  result: 'win' | 'loss' | 'push' | null
  profit: number
  note: string
}

interface WeeklyEntry {
  event: string
  date: string
  picks_count: number
  hits_count: number
  net_units: number
  notes: string
  picks: WeeklyPick[]
}

interface Totals {
  total_picks: number
  total_hits: number
  hit_rate_pct: number
  events_tracked: number
  units: { wagered: number; returned: number; profit_loss: number; roi_pct: number }
}

function formatPlayer(name: string): string {
  const parts = name.split(',').map(s => s.trim())
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name
}

function fmtOdds(odds: number): string {
  return odds >= 0 ? `+${odds}` : String(odds)
}

function fmtUnits(u: number): string {
  return (u >= 0 ? '+' : '') + u.toFixed(1) + 'u'
}

async function generateTweet(week: WeeklyEntry, totals: Totals): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const wins   = week.picks.filter(p => p.result === 'win')
  const losses = week.picks.filter(p => p.result === 'loss')

  const pickLines = week.picks
    .filter(p => p.result !== null)
    .map(p => `${formatPlayer(p.player)} ${p.bet} ${fmtOdds(p.odds)} — ${p.result?.toUpperCase()} (${p.note})`)
    .join('\n')

  const data = [
    `Event: ${week.event}`,
    `Record: ${week.hits_count}-for-${week.picks_count} (${fmtUnits(week.net_units)})`,
    `Picks:\n${pickLines}`,
    `Season: ${totals.total_hits}/${totals.total_picks} (${totals.hit_rate_pct.toFixed(1)}%), ${fmtUnits(totals.units.profit_loss)}, ${totals.units.roi_pct.toFixed(1)}% ROI, ${totals.events_tracked} events`,
    `Notes: ${week.notes}`,
  ].join('\n\n')

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Results data:\n${data}` }],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON from Claude')
  const parsed = JSON.parse(match[0]) as { twitter_tweet?: string }
  return parsed.twitter_tweet ?? ''
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  const tracker = JSON.parse(fs.readFileSync(TRACKER_PATH, 'utf8')) as {
    totals: Totals
    weekly_picks: WeeklyEntry[]
  }

  const week = tracker.weekly_picks[tracker.weekly_picks.length - 1]
  if (!week) throw new Error('No weekly_picks entries in season-tracker.json')

  // Freshness guard — warn if last entry is older than 10 days
  const entryAge = (Date.now() - new Date(week.date).getTime()) / (1000 * 60 * 60 * 24)
  if (entryAge > 10) {
    throw new Error(`season-tracker.json last entry is from ${week.date} (${Math.round(entryAge)} days ago). Update it first, then re-run.`)
  }
  if (week.picks.some(p => p.result === null)) {
    throw new Error(`Last entry (${week.event}) still has null results. Fill in results in admin.html first.`)
  }

  const totals = tracker.totals

  console.log(`Event: ${week.event}`)
  console.log(`Record: ${week.hits_count}-for-${week.picks_count} (${fmtUnits(week.net_units)})`)
  console.log(`Season: ${totals.total_hits}/${totals.total_picks} (${totals.hit_rate_pct.toFixed(1)}%), ${fmtUnits(totals.units.profit_loss)} ROI`)

  console.log('\nGenerating tweet...')
  const tweet = await generateTweet(week, totals)
  console.log(`Tweet (${tweet.length} chars): ${tweet}`)

  const wins   = week.picks.filter(p => p.result === 'win')
  const losses = week.picks.filter(p => p.result === 'loss')

  const tgPreview = [
    `<b>${week.event}</b>`,
    `${week.hits_count}-for-${week.picks_count} · ${fmtUnits(week.net_units)}`,
    wins.length  ? `✓ ${wins.map(p  => `${formatPlayer(p.player)} ${fmtOdds(p.odds)}`).join(', ')}` : '',
    losses.length ? `✗ ${losses.map(p => `${formatPlayer(p.player)}`).join(', ')}` : '',
    `Season: ${totals.hit_rate_pct.toFixed(1)}% · ${fmtUnits(totals.units.profit_loss)} · ${totals.units.roi_pct.toFixed(1)}% ROI`,
  ].filter(Boolean).join('\n')

  await publish({
    tweet,
    tgPreview,
    label: `Monday Recap · ${week.event}`,
  })
}

main().catch(async err => {
  console.error('✗', (err as Error).message)
  await tgNotify(`❌ post-monday-recap failed:\n<code>${(err as Error).message}</code>`).catch(() => {})
  process.exit(1)
})
