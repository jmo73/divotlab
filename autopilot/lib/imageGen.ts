import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import type { TemplateId } from './types'

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates')

// ─── Font loading ─────────────────────────────────────────────────────────────
// Sharp uses librsvg which does NOT fetch external URLs at render time.
// We load fonts from Google Fonts once per process and embed as base64 data URIs.

let fontStyleCache: string | null = null

async function getFontStyle(): Promise<string> {
  if (fontStyleCache) return fontStyleCache

  const GOOGLE_FONTS_URL =
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'

  try {
    // Fetch the CSS (use a desktop user-agent to get woff2 URLs)
    const cssRes = await fetch(GOOGLE_FONTS_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    const css = await cssRes.text()

    // Extract all woff2 src URLs
    const urlPattern = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g
    const fontUrls: string[] = []
    let match: RegExpExecArray | null
    while ((match = urlPattern.exec(css)) !== null) {
      fontUrls.push(match[1])
    }

    // Download each font file and replace URL with base64 data URI
    let embeddedCss = css
    await Promise.all(
      fontUrls.map(async (url) => {
        try {
          const fontRes = await fetch(url)
          const buffer = await fontRes.arrayBuffer()
          const b64 = Buffer.from(buffer).toString('base64')
          const dataUri = `url(data:font/woff2;base64,${b64})`
          embeddedCss = embeddedCss.replaceAll(`url(${url})`, dataUri)
        } catch {
          // Non-fatal: font may not render but SVG won't break
        }
      })
    )

    fontStyleCache = embeddedCss
    return embeddedCss
  } catch {
    // Fallback: system fonts — numbers will still render, display font degrades gracefully
    fontStyleCache = ''
    return ''
  }
}

// ─── XML escaping ─────────────────────────────────────────────────────────────

export function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ─── Score helpers ────────────────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score < 0) return '#5BBF85'  // under par — green
  if (score === 0) return '#FAFAFA' // even par — white
  return '#C9A84C'                  // over par — gold
}

export function formatScore(score: number): string {
  if (score === 0) return 'E'
  return score > 0 ? `+${score}` : `${score}`
}

export function formatSG(sg: number): string {
  return `${sg >= 0 ? '+' : ''}${sg.toFixed(1)}`
}

// DG rating (0–180 scale) → bar width (0–180px)
export function dgRatingToBarWidth(rating: number): number {
  return Math.round(Math.min(180, Math.max(0, (rating / 180) * 180)))
}

// Course fit score (0–100) → bar width (0–280px for model-pick template)
export function fitScoreToBarWidth(fitScore: number): number {
  return Math.round(Math.min(280, Math.max(0, (fitScore / 100) * 280)))
}

// player-hero renders at 1080×1350 (Instagram 4:5); all others are 1080×1080
const TEMPLATE_CANVAS: Partial<Record<TemplateId, { width: number; height: number }>> = {
  'player-hero': { width: 1080, height: 1350 },
}

// ─── Core render function ─────────────────────────────────────────────────────

export async function generateImage(
  templateId: TemplateId,
  fields: Record<string, string>
): Promise<Buffer> {
  const templatePath = path.join(TEMPLATES_DIR, `${templateId}.svg`)
  let svg = await fs.readFile(templatePath, 'utf-8')

  // Inject embedded fonts
  const fonts = await getFontStyle()
  svg = svg.replace('{{FONTS}}', fonts)

  // Replace all {{TOKEN}} placeholders
  for (const [key, value] of Object.entries(fields)) {
    svg = svg.replaceAll(`{{${key}}}`, escapeXml(value))
  }

  // Validate no unreplaced tokens remain
  const unreplaced = svg.match(/\{\{[A-Z0-9_]+\}\}/g)
  if (unreplaced) {
    throw new Error(`Unreplaced SVG tokens in ${templateId}: ${unreplaced.join(', ')}`)
  }

  const canvas = TEMPLATE_CANVAS[templateId] ?? { width: 1080, height: 1080 }
  return sharp(Buffer.from(svg))
    .resize(canvas.width, canvas.height)
    .png({ compressionLevel: 8 })
    .toBuffer()
}

// ─── Instagram 4:5 extension ──────────────────────────────────────────────────
// Adds a branded 270px footer strip below a 1080×1080 graphic → 1080×1350

export async function extendForInstagram(pngBuffer: Buffer): Promise<Buffer> {
  const footerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="270">
    <rect width="1080" height="270" fill="#0A0A0A"/>
    <line x1="60" y1="44" x2="1020" y2="44" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <text x="540" y="108" font-family="DM Sans,sans-serif" font-size="12" font-weight="600" letter-spacing="0.14em" fill="rgba(245,245,243,0.15)" text-anchor="middle">DIVOT LAB</text>
    <text x="540" y="140" font-family="DM Sans,sans-serif" font-size="11" font-weight="400" letter-spacing="0.1em" fill="rgba(245,245,243,0.09)" text-anchor="middle">DIVOTLAB.COM</text>
  </svg>`
  const footerPng = await sharp(Buffer.from(footerSvg)).resize(1080, 270).png().toBuffer()

  return sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 10, g: 10, b: 10 } }
  })
    .composite([
      { input: pngBuffer, top: 0, left: 0 },
      { input: footerPng, top: 1080, left: 0 }
    ])
    .png({ compressionLevel: 8 })
    .toBuffer()
}

// ─── Photo card generator (player-hero, Instagram only) ───────────────────────
// Composites a player photo into the top zone of the player-hero template.

export async function generatePhotoCard(
  fields: Record<string, string>,
  photoUrl: string
): Promise<Buffer> {
  // Render base SVG (dark background + content zone in bottom half)
  const basePng = await generateImage('player-hero', fields)

  // Fetch and crop photo to top zone (1080×660)
  const photoRes = await fetch(photoUrl)
  if (!photoRes.ok) throw new Error(`Photo fetch failed: ${photoRes.status} ${photoUrl}`)
  const photoBuffer = Buffer.from(await photoRes.arrayBuffer())
  const photoCropped = await sharp(photoBuffer)
    .resize(1080, 660, { fit: 'cover', position: 'north' })
    .png()
    .toBuffer()

  // Gradient overlay (transparent → opaque dark at bottom of photo zone)
  const gradSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="660">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0A0A0A" stop-opacity="0"/>
        <stop offset="55%" stop-color="#0A0A0A" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#0A0A0A" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="660" fill="url(#g)"/>
  </svg>`
  const gradPng = await sharp(Buffer.from(gradSvg)).png().toBuffer()

  // Composite: base + photo (top) + gradient (over photo)
  return sharp(basePng)
    .composite([
      { input: photoCropped, top: 0, left: 0 },
      { input: gradPng, top: 0, left: 0 }
    ])
    .png({ compressionLevel: 8 })
    .toBuffer()
}

// ─── Template field builders ──────────────────────────────────────────────────
// One function per template — takes typed data, returns the fields Record<string, string>

export function leaderboardFields(data: {
  eventName: string
  courseConditions: string
  roundBadge: string
  players: Array<{ name: string; score: number; dgRating?: number; sgTotal?: number }>
  insight: string
  fieldContext: string
}): Record<string, string> {
  const fields: Record<string, string> = {
    EVENT_NAME:        data.eventName,
    COURSE_CONDITIONS: data.courseConditions,
    ROUND_BADGE:       data.roundBadge,
    BADGE:             data.roundBadge,
    INSIGHT:           data.insight,
    FIELD_CONTEXT:     data.fieldContext,
  }
  for (let i = 1; i <= 5; i++) {
    const p = data.players[i - 1]
    fields[`P${i}_NAME`]         = p?.name ?? '—'
    fields[`P${i}_SCORE`]        = p != null ? formatScore(p.score) : '—'
    fields[`P${i}_SCORE_COLOR`]  = p != null ? scoreColor(p.score) : '#6B6B6B'
    fields[`P${i}_RATING`]       = p?.dgRating != null ? String(p.dgRating) : '—'
    fields[`P${i}_DG_BAR_WIDTH`] = String(p?.dgRating != null ? dgRatingToBarWidth(p.dgRating) : 0)
    fields[`P${i}_SG_TOTAL`]     = p?.sgTotal != null ? `${formatSG(p.sgTotal)} SG` : ''
    fields[`P${i}_SG_COLOR`]     = p?.sgTotal != null && p.sgTotal > 0 ? 'rgba(91,191,133,0.55)' : 'rgba(245,245,243,0.28)'
  }
  return fields
}

export function playerStatFields(data: {
  playerName: string
  contextLine: string
  badge: string
  badgeColor: string
  stats: Array<{ label: string; value: string }>
  insightLine1: string
  insightLine2?: string
}): Record<string, string> {
  const fields: Record<string, string> = {
    PLAYER_NAME:    data.playerName,
    CONTEXT_LINE:   data.contextLine,
    BADGE:          data.badge,
    BADGE_COLOR:    data.badgeColor,
    INSIGHT_LINE_1: data.insightLine1,
    INSIGHT_LINE_2: data.insightLine2 ?? '',
  }
  for (let i = 1; i <= 4; i++) {
    const s = data.stats[i - 1]
    fields[`STAT${i}_LABEL`] = s?.label ?? ''
    fields[`STAT${i}_VALUE`] = s?.value ?? ''
  }
  return fields
}

export function modelPickFields(data: {
  eventName: string
  conditionsSummary: string
  picks: Array<{ name: string; winPct: string; fitScore: number; keyStrength: string }>
  darkHorse: { name: string; reason: string }
}): Record<string, string> {
  const fields: Record<string, string> = {
    EVENT_NAME:          data.eventName,
    CONDITIONS_SUMMARY:  data.conditionsSummary,
    DH_NAME:             data.darkHorse.name,
    DH_REASON:           data.darkHorse.reason,
  }
  for (let i = 1; i <= 3; i++) {
    const p = data.picks[i - 1]
    fields[`P${i}_NAME`]         = p?.name ?? '—'
    fields[`P${i}_WIN_PCT`]      = p?.winPct ?? '—'
    fields[`P${i}_FIT_WIDTH`]    = String(p != null ? fitScoreToBarWidth(p.fitScore) : 0)
    fields[`P${i}_KEY_STRENGTH`] = p?.keyStrength ?? ''
  }
  return fields
}

export function cutLineFields(data: {
  eventName: string
  cutLine: string
  players: Array<{ name: string; score: number; holesPlayed: number }>
}): Record<string, string> {
  const fields: Record<string, string> = {
    EVENT_NAME: data.eventName,
    CUT_LINE:   data.cutLine,
  }
  for (let i = 1; i <= 4; i++) {
    const p = data.players[i - 1]
    fields[`B${i}_NAME`]        = p?.name ?? '—'
    fields[`B${i}_SCORE`]       = p != null ? formatScore(p.score) : '—'
    fields[`B${i}_SCORE_COLOR`] = p != null ? scoreColor(p.score) : '#6B6B6B'
    fields[`B${i}_HOLES`]       = p != null ? String(p.holesPlayed) : '—'
  }
  return fields
}

export function evergreenFactFields(data: {
  topicBadge: string
  headline: string
  subhead: string
  mainStat: string
  unitLabel: string
  supportLines: [string, string?, string?]
}): Record<string, string> {
  return {
    TOPIC_BADGE:    data.topicBadge,
    HEADLINE:       data.headline,
    SUBHEAD:        data.subhead,
    MAIN_STAT:      data.mainStat,
    UNIT_LABEL:     data.unitLabel,
    SUPPORT_LINE_1: data.supportLines[0],
    SUPPORT_LINE_2: data.supportLines[1] ?? '',
    SUPPORT_LINE_3: data.supportLines[2] ?? '',
  }
}

export function quoteInsightFields(data: {
  badge: string
  quoteLines: [string, string, string?]
  sourceLine: string
}): Record<string, string> {
  return {
    BADGE:        data.badge,
    QUOTE_LINE_1: data.quoteLines[0],
    QUOTE_LINE_2: data.quoteLines[1],
    QUOTE_LINE_3: data.quoteLines[2] ?? '',
    SOURCE_LINE:  data.sourceLine,
  }
}

export function comparisonFields(data: {
  eventRound: string
  playerA: { name: string; score: number; position: string; sgTotal: string; sgApproach: string; dgRating: string }
  playerB: { name: string; score: number; position: string; sgTotal: string; sgApproach: string; dgRating: string }
  comparisonAngle: string
}): Record<string, string> {
  const aBetter = data.playerA.score <= data.playerB.score
  return {
    EVENT_ROUND:        data.eventRound,
    A_NAME:             data.playerA.name,
    A_SCORE:            formatScore(data.playerA.score),
    A_SCORE_COLOR:      scoreColor(data.playerA.score),
    A_POSITION:         data.playerA.position,
    A_SG_TOTAL:         data.playerA.sgTotal,
    A_SG_APPROACH:      data.playerA.sgApproach,
    A_DG_RATING:        data.playerA.dgRating,
    A_ACCENT_COLOR:     aBetter ? '#5BBF85' : 'transparent',
    B_NAME:             data.playerB.name,
    B_SCORE:            formatScore(data.playerB.score),
    B_SCORE_COLOR:      scoreColor(data.playerB.score),
    B_POSITION:         data.playerB.position,
    B_SG_TOTAL:         data.playerB.sgTotal,
    B_SG_APPROACH:      data.playerB.sgApproach,
    B_DG_RATING:        data.playerB.dgRating,
    B_ACCENT_COLOR:     aBetter ? 'transparent' : '#5BBF85',
    COMPARISON_ANGLE:   data.comparisonAngle,
  }
}

export function courseBreakdownFields(data: {
  courseName: string
  courseMeta: string
  rewardsLabel: string
  histScoring: string
  fieldAvg: string
  keyStat: string
  insightLine1: string
  insightLine2?: string
  historicalHook: string
}): Record<string, string> {
  return {
    COURSE_NAME:     data.courseName,
    COURSE_META:     data.courseMeta,
    REWARDS_LABEL:   data.rewardsLabel,
    HIST_SCORING:    data.histScoring,
    FIELD_AVG:       data.fieldAvg,
    KEY_STAT:        data.keyStat,
    INSIGHT_LINE_1:  data.insightLine1,
    INSIGHT_LINE_2:  data.insightLine2 ?? '',
    HISTORICAL_HOOK: data.historicalHook,
  }
}

export function weatherCardFields(data: {
  eventName: string
  roundDate: string
  windSpeed: string
  windDirection: string
  tempPrecip: string
  conditionsFlag: string
  conditionsFlagColor: string
  scoringImpact: string
  historicalContext: string
}): Record<string, string> {
  return {
    EVENT_NAME:            data.eventName,
    ROUND_DATE:            data.roundDate,
    WIND_SPEED:            data.windSpeed,
    WIND_DIRECTION:        data.windDirection,
    TEMP_PRECIP:           data.tempPrecip,
    CONDITIONS_FLAG:       data.conditionsFlag,
    CONDITIONS_FLAG_COLOR: data.conditionsFlagColor,
    SCORING_IMPACT:        data.scoringImpact,
    HISTORICAL_CONTEXT:    data.historicalContext,
  }
}

export function playerHeroFields(data: {
  playerName: string
  score: number
  tournament: string
  position: string
  sgTotal: number
  sgApproach: number
  sgPutting: number
}): Record<string, string> {
  return {
    PLAYER_NAME:  data.playerName,
    SCORE:        formatScore(data.score),
    SCORE_COLOR:  scoreColor(data.score),
    TOURNAMENT:   data.tournament,
    POSITION:     data.position,
    SG_TOTAL:     formatSG(data.sgTotal),
    SG_APPROACH:  formatSG(data.sgApproach),
    SG_PUTTING:   formatSG(data.sgPutting),
  }
}

export function pickResultFields(data: {
  tournament: string
  playerName: string
  betLine: string
  result: 'WIN' | 'LOSS' | 'PUSH'
  resultDetail: string
  seasonRecord: string
  seasonUnits: string
  seasonRoi: string
  insight: string
}): Record<string, string> {
  const colorMap = {
    WIN:  '#5BBF85',
    LOSS: 'rgba(245,245,243,0.52)',
    PUSH: '#C9A84C',
  }
  const bgMap = {
    WIN:  'rgba(27,77,62,0.22)',
    LOSS: 'rgba(90,143,168,0.07)',
    PUSH: 'rgba(201,168,76,0.1)',
  }
  const color = colorMap[data.result]
  return {
    BADGE:          'Pick Result',
    TOURNAMENT:     data.tournament,
    PLAYER_NAME:    data.playerName,
    BET_LINE:       data.betLine,
    RESULT:         data.result,
    RESULT_COLOR:   color,
    RESULT_BG:      bgMap[data.result],
    RESULT_DETAIL:  data.resultDetail,
    SEASON_RECORD:  data.seasonRecord,
    SEASON_UNITS:   data.seasonUnits,
    SEASON_ROI:     data.seasonRoi,
    INSIGHT:        data.insight,
  }
}

export function modelPicksFields(data: {
  eventName: string
  badge?: string
  picks: Array<{ name: string; winPct: string; fitScore: number; keyStrength: string }>
  darkHorse: { name: string; reason: string }
}): Record<string, string> {
  const fields: Record<string, string> = {
    BADGE:      data.badge ?? 'Model Picks',
    EVENT_NAME: data.eventName,
    DH_NAME:    data.darkHorse.name,
    DH_REASON:  data.darkHorse.reason,
  }
  for (let i = 1; i <= 3; i++) {
    const p = data.picks[i - 1]
    fields[`P${i}_NAME`]         = p?.name ?? '—'
    fields[`P${i}_WIN_PCT`]      = p?.winPct ?? '—'
    fields[`P${i}_FIT_WIDTH`]    = String(p != null ? fitScoreToBarWidth(p.fitScore) : 0)
    fields[`P${i}_KEY_STRENGTH`] = p?.keyStrength ?? ''
  }
  return fields
}

export function cutAlertFields(data: {
  eventName: string
  cutLine: string
  players: Array<{
    name: string
    score: number
    status: 'MADE' | 'MISSED'
    isPick: boolean
  }>
}): Record<string, string> {
  const fields: Record<string, string> = {
    BADGE:      'Cut Alert',
    EVENT_NAME: data.eventName,
    CUT_LINE:   data.cutLine,
  }
  for (let i = 1; i <= 4; i++) {
    const p = data.players[i - 1]
    fields[`B${i}_NAME`]         = p?.name ?? '—'
    fields[`B${i}_SCORE`]        = p != null ? formatScore(p.score) : '—'
    fields[`B${i}_SCORE_COLOR`]  = p != null ? scoreColor(p.score) : '#6B6B6B'
    fields[`B${i}_STATUS`]       = p?.status ?? '—'
    fields[`B${i}_STATUS_CLASS`] = p?.status === 'MADE' ? 'made' : 'missed'
    fields[`B${i}_IS_PICK`]      = p?.isPick ? 'is-pick' : ''
  }
  return fields
}

export function spotlightFields(data: {
  badge: string
  playerName: string
  context: string
  heroLabel: string
  heroValue: string
  heroColor: string
  heroSub: string
  stats: Array<{ label: string; value: string }>
  insight: string
}): Record<string, string> {
  const fields: Record<string, string> = {
    BADGE:       data.badge,
    PLAYER_NAME: data.playerName,
    CONTEXT:     data.context,
    HERO_LABEL:  data.heroLabel,
    HERO_VALUE:  data.heroValue,
    HERO_COLOR:  data.heroColor,
    HERO_SUB:    data.heroSub,
    INSIGHT:     data.insight,
  }
  for (let i = 1; i <= 4; i++) {
    const s = data.stats[i - 1]
    fields[`STAT${i}_LABEL`] = s?.label ?? ''
    fields[`STAT${i}_VALUE`] = s?.value ?? ''
  }
  return fields
}

export function courseProfileFields(data: {
  badge?: string
  courseName: string
  courseMeta: string
  rewards: string
  histScoring: string
  fieldAvg: string
  keyStat: string
  insight: string
}): Record<string, string> {
  return {
    BADGE:        data.badge ?? 'Course Profile',
    COURSE_NAME:  data.courseName,
    COURSE_META:  data.courseMeta,
    REWARDS:      data.rewards,
    HIST_SCORING: data.histScoring,
    FIELD_AVG:    data.fieldAvg,
    KEY_STAT:     data.keyStat,
    INSIGHT:      data.insight,
  }
}

export function weatherFields(data: {
  badge?: string
  eventName: string
  roundDate: string
  windSpeed: string
  windArrowDeg: string
  windDir: string
  windDirTemp: string
  conditionsFlag: string
  conditionsColor: string
  scoringImpact: string
  histContext: string
}): Record<string, string> {
  return {
    BADGE:            data.badge ?? 'Weather',
    EVENT_NAME:       data.eventName,
    ROUND_DATE:       data.roundDate,
    WIND_SPEED:       data.windSpeed,
    WIND_ARROW_DEG:   data.windArrowDeg,
    WIND_DIR:         data.windDir,
    WIND_DIR_TEMP:    data.windDirTemp,
    CONDITIONS_FLAG:  data.conditionsFlag,
    CONDITIONS_COLOR: data.conditionsColor,
    SCORING_IMPACT:   data.scoringImpact,
    HIST_CONTEXT:     data.histContext,
  }
}
