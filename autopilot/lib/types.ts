// ─── Queue & Status ───────────────────────────────────────────────────────────

export type QueueStatus =
  | 'pending'
  | 'pending_edit'
  | 'pending_edit_regenerating'
  | 'approved'
  | 'posted'
  | 'partial'
  | 'failed'
  | 'skipped'
  | 'expired'
  | 'telegram_failed'

export type TriggerType =
  | 'live_leaderboard_r1_end'
  | 'live_leaderboard_r2_end'
  | 'live_leaderboard_r3_end'
  | 'live_leaderboard_final'
  | 'mid_round_mover'
  | 'cut_bubble_alert'
  | 'weather_angle'
  | 'pre_tournament_model_picks'
  | 'post_round_sleeper'
  | 'comparison_spotlight'
  | 'evergreen_sg_explainer'
  | 'evergreen_course_profile'
  | 'evergreen_player_spotlight'
  | 'evergreen_stat_of_week'
  | 'evergreen_myth_bust'

export type TemplateId =
  | 'leaderboard'
  | 'player-stat'
  | 'model-pick'
  | 'cut-line'
  | 'evergreen-fact'
  | 'quote-insight'
  | 'comparison'
  | 'course-breakdown'
  | 'weather-card'
  | 'player-hero'

export type EventTier = 'major' | 'signature' | 'standard'
export type EditPlatform = 'twitter' | 'instagram' | 'both'
export type ConditionsFlag = 'calm' | 'moderate' | 'difficult' | 'severe'
export type TournamentStatus =
  | 'LIVE'
  | 'PRE_TOURNAMENT'
  | 'POST_R1'
  | 'POST_R2'
  | 'POST_R3'
  | 'COMPLETED'
  | 'OFF'

// ─── Weather ──────────────────────────────────────────────────────────────────

export interface WeatherContext {
  windSpeedMph: number
  windDirection: string
  conditionsFlag: ConditionsFlag
  tempF: number
  precipChance: number
  conditionsSummary: string
}

// ─── Insight Flags ────────────────────────────────────────────────────────────

export interface InsightFlags {
  playerOverperforming: boolean
  playerUnderperforming: boolean
  conditionsAdvantage: boolean
  courseSpecialist: boolean
  modelAligned: boolean
  modelSurprise: boolean
  fieldBeatingCourse: boolean
}

// ─── Post Context ─────────────────────────────────────────────────────────────

export interface PostContext {
  tournament: {
    name: string
    course: string
    tier: EventTier
    historicalScoringAvg: number
    fieldStrengthRank: number
    isFirstRound: boolean
  }
  weather: WeatherContext
  field: {
    avgDgRating: number
    topRatedInField: string
    fieldStrengthLabel: string
  }
  player?: {
    name: string
    dgRating: number
    dgRatingPercentile: number
    courseHistory: {
      timesPlayed: number
      avgFinish: number
      bestFinish: number
      sgAppAvg: number
    }
    recentForm: {
      last5EventsAvgSg: number
      trend: 'improving' | 'declining' | 'stable'
    }
    vsFieldAvg: {
      sgTotal: number
      sgApp: number
      sgPutt: number
    }
  }
  insightFlags: InsightFlags
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export interface QueuedPost {
  id: string
  triggerType: TriggerType
  triggerLabel: string
  eventName: string | null
  eventTier: EventTier | null
  graphicType: TemplateId | null
  captionX: string
  captionIG: string
  captionXOriginal: string
  captionIGOriginal: string
  imageBlobUrl: string
  imageBlobKey: string
  rawData: Record<string, unknown>
  context: PostContext
  weatherContext: WeatherContext | null
  status: QueueStatus
  editPlatform: EditPlatform | null
  editCount: number
  editHistory: EditHistoryEntry[]
  telegramMessageId: number | null
  createdAt: Date
  approvedAt: Date | null
  postedAt: Date | null
  twitterPostId: string | null
  twitterUrl: string | null
  instagramPostId: string | null
  instagramUrl: string | null
  errorMessage: string | null
}

export interface EditHistoryEntry {
  instruction: string
  platform: EditPlatform
  timestamp: string
  captionXBefore: string
  captionIGBefore: string
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export interface TournamentStatusResult {
  status: TournamentStatus
  eventId?: string
  eventName?: string
  courseName?: string
  courseLat?: number
  courseLng?: number
  roundNumber?: number
  roundDate?: string
  currentRound?: number
}

export interface SchedulerResult {
  triggerType: TriggerType
  eventName: string | null
  tournamentStatus: TournamentStatus
  rawData: Record<string, unknown>
  lat?: number
  lng?: number
}

// ─── Trigger data shapes (for claude.ts prompt builders) ─────────────────────

export interface LiveLeaderboardData {
  eventName: string
  top5?: Array<{
    playerName: string
    score: number
    sg_total?: number | null
    dg_rating?: number | null
    dgRatingPercentile?: number | null
  }>
  fieldAvgScore?: number
  modelTopPick?: { playerName: string; currentPosition: number | null } | null
}

// ─── DataGolf shapes ──────────────────────────────────────────────────────────

export interface DGPlayer {
  dg_id: number
  player_name: string
  country?: string
  dg_rating?: number
  sg_total?: number
  sg_ott?: number
  sg_app?: number
  sg_arg?: number
  sg_putt?: number
  primary_tour?: string
}

export interface DGLeaderboardEntry {
  dg_id: number
  player_name: string
  position: number
  score: number
  sg_total?: number
  dg_rating?: number
  dgRatingPercentile?: number
}

export interface DGPreTournamentEntry {
  dg_id: number
  player_name: string
  win?: number
  top_5?: number
  top_10?: number
  top_20?: number
  make_cut?: number
  dg_rating?: number
  sg_ott?: number
  sg_app?: number
  sg_arg?: number
  sg_putt?: number
  sg_total?: number
}

// ─── Evergreen Bank ──────────────────────────────────────────────────────────

export interface EvergreenItem {
  id: string
  contentId: string
  triggerType: TriggerType
  topic: string
  seriesName: string | null
  seriesOrder: number | null
  templateId: TemplateId
  templateFields: Record<string, string>
  captionX: string
  captionIG: string
  lastUsedAt: Date | null
  useCount: number
}

// ─── Post Log ─────────────────────────────────────────────────────────────────

export interface PostLogEntry {
  queueId: string
  triggerType: TriggerType
  eventName: string | null
  eventTier: EventTier | null
  graphicType: TemplateId | null
  status: string
  twitterSuccess: boolean | null
  twitterPostId: string | null
  twitterUrl: string | null
  twitterError: string | null
  instagramSuccess: boolean | null
  instagramPostId: string | null
  instagramUrl: string | null
  instagramError: string | null
  wasEdited: boolean
  editCount: number
}

// ─── Cron Log ─────────────────────────────────────────────────────────────────

export interface CronLogEntry {
  jobName: string
  tournamentStatus?: TournamentStatus
  eventName?: string
  triggerSelected?: TriggerType
  skipReason?: string
  durationMs: number
  error?: string
}
