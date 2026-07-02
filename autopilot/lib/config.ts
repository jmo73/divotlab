const REQUIRED_VARS = [
  'DATAGOLF_API_KEY',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TOMORROWIO_API_KEY',
  'X_API_KEY',
  'X_API_KEY_SECRET',
  'X_ACCESS_TOKEN',
  'X_ACCESS_TOKEN_SECRET',
  'INSTAGRAM_ACCESS_TOKEN',
  'INSTAGRAM_USER_ID',
  'BLOB_READ_WRITE_TOKEN',
  'AUTOPILOT_DASHBOARD_SECRET',
] as const

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter(v => !process.env[v])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}

export const config = {
  datagolf: {
    apiKey: process.env.DATAGOLF_API_KEY ?? '',
    baseUrl: 'https://feeds.datagolf.com',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: 'claude-sonnet-4-6',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    chatId: process.env.TELEGRAM_CHAT_ID ?? '',
  },
  weather: {
    apiKey: process.env.TOMORROWIO_API_KEY ?? '',
    baseUrl: 'https://api.tomorrow.io/v4',
  },
  twitter: {
    apiKey: process.env.X_API_KEY ?? '',
    apiKeySecret: process.env.X_API_KEY_SECRET ?? '',
    accessToken: process.env.X_ACCESS_TOKEN ?? '',
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET ?? '',
    handle: '@divotlab',
  },
  instagram: {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN ?? '',
    userId: process.env.INSTAGRAM_USER_ID ?? '',
    handle: '@divotlab',
  },
  blob: {
    token: process.env.BLOB_READ_WRITE_TOKEN ?? '',
  },
  autopilot: {
    enabled: process.env.AUTOPILOT_ENABLED === 'true',
    dashboardSecret: process.env.AUTOPILOT_DASHBOARD_SECRET ?? '',
    cronSecret: process.env.CRON_SECRET ?? '',
  },
  site: {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? 'https://divotlab.com',
  },
} as const
